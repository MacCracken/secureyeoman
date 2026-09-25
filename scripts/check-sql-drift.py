#!/usr/bin/env python3
"""Check sy-core's SQL against the schema the server actually ships with.

sy-core issues its queries as runtime strings (`sqlx::query*("...")`), so the
compiler never sees the schema: a renamed table or a column type the row struct
cannot decode only shows up as a 500 in production. This script:

  1. extracts every literal `sqlx::query*` statement and the `FromRow` struct it
     decodes into, from `crates/sy-core/src`;
  2. has PostgreSQL parse and describe each statement (`psql` + `\\gdesc`: the
     statement is analysed, never executed);
  3. compares the described result columns with the struct's fields using
     sqlx's strict decode rules (e.g. `i64` needs BIGINT, `f64` needs DOUBLE
     PRECISION) and flags non-`Option` fields fed by nullable columns.

It needs `psql` and a database with the shipped migrations applied, e.g.:

    for f in packages/core/src/storage/migrations/*.sql; do
      psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
    scripts/check-sql-drift.py "$DB"

Exit status is 1 when any statement fails, 0 otherwise (`--report-only` always
exits 0). Only literal statements are checked; `format!`-built SQL is listed.
"""

import argparse
import collections
import json
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'crates', 'sy-core', 'src')

CALL = re.compile(r'sqlx::(query_as|query_scalar|query)(\s*::\s*<\s*_\s*,\s*'
                  r'((?:[^<>]|<[^<>]*(?:<[^<>]*>)?[^<>]*>)+?)\s*>)?\s*\(')
STRUCT = re.compile(r'#\[derive\(([^)]*)\)\]\s*(?:#\[[^\]]*\]\s*)*pub\s+struct\s+([A-Za-z0-9_]+)\s*\{', re.S)
FIELD = re.compile(r'((?:\s*#\[[^\]]*\]\s*)*)\s*(?:pub(?:\([a-z]+\))?\s+)?([a-z_][a-z0-9_]*)\s*:\s*([^,]+?),\s*(?://[^\n]*)?\n')

# Rust type -> PostgreSQL types sqlx will decode it from.
COMPAT = {
    'i16': {'smallint'}, 'i32': {'integer'}, 'i64': {'bigint'},
    'f32': {'real'}, 'f64': {'double precision'}, 'bool': {'boolean'},
    'String': {'text', 'character varying', 'character', 'name', 'unknown', 'citext'},
    'serde_json::Value': {'json', 'jsonb'}, 'Value': {'json', 'jsonb'}, 'JsonValue': {'json', 'jsonb'},
    'Vec<String>': {'text[]', 'character varying[]'}, 'Vec<f32>': {'real[]'},
    'Vec<f64>': {'double precision[]'}, 'Vec<i64>': {'bigint[]'}, 'Vec<i32>': {'integer[]'},
    'Vec<u8>': {'bytea'}, 'uuid::Uuid': {'uuid'}, 'Uuid': {'uuid'},
    'chrono::DateTime<chrono::Utc>': {'timestamp with time zone'},
    'DateTime<Utc>': {'timestamp with time zone'},
    'chrono::NaiveDateTime': {'timestamp without time zone'},
}


def parse_str_lit(src, i):
    """Parse the Rust string literal starting at src[i] (plain or raw)."""
    if src.startswith('r', i) and src[i + 1] in '#"':
        j = i + 1
        hashes = 0
        while src[j] == '#':
            hashes += 1
            j += 1
        term = '"' + '#' * hashes
        end = src.index(term, j + 1)
        return src[j + 1:end]
    out, j = [], i + 1
    while True:
        c = src[j]
        if c == '"':
            return ''.join(out)
        if c == '\\':
            n = src[j + 1]
            if n == '\n':  # line continuation
                j += 2
                while src[j] in ' \t\r\n':
                    j += 1
                continue
            out.append({'n': '\n', 't': '\t', 'r': '\r', '0': '\0'}.get(n, n))
            j += 2
            continue
        out.append(c)
        j += 1


def row_type_from_context(body, pos):
    """Row type of an untyped `query_as(`: a `let x: Vec<T>` annotation or the fn's return type."""
    k = body.rfind('let ', 0, pos)
    if k != -1 and pos - k < 200:
        m = re.search(r':\s*(?:Vec|Option)<\s*([A-Za-z_][A-Za-z0-9_]*)\s*>', body[k:pos])
        if m:
            return m.group(1)
    k = body.rfind('fn ', 0, pos)
    if k == -1:
        return None
    sig = body[k:body.find('{', k)]
    m = re.search(r'->.*Result<\s*(?:Vec|Option)<\s*([A-Za-z_:][A-Za-z0-9_:]*)\s*>', sig, re.S) or \
        re.search(r'->.*Result<\s*([A-Z][A-Za-z0-9_]*)\s*,', sig, re.S)
    return m.group(1).split('::')[-1] if m else None


def extract(root):
    queries, structs = [], {}
    for dp, _, fns in os.walk(root):
        for fn in sorted(fns):
            if not fn.endswith('.rs'):
                continue
            path = os.path.join(dp, fn)
            rel = os.path.relpath(path, root)
            src = open(path, encoding='utf-8').read()
            cut = src.find('#[cfg(test)]')
            body = src if cut == -1 else src[:cut]
            for m in STRUCT.finditer(body):
                if 'FromRow' not in m.group(1):
                    continue
                depth, j = 1, m.end()
                while depth:
                    depth += {'{': 1, '}': -1}.get(body[j], 0)
                    j += 1
                fields = []
                for f in FIELD.finditer(body[m.end():j - 1] + '\n'):
                    attrs = (f.group(1) or '').replace(' ', '')
                    rename = re.search(r'sqlx\(rename="([^"]+)"', attrs)
                    fields.append({
                        'name': rename.group(1) if rename else f.group(2),
                        'ty': re.sub(r'\s+', '', f.group(3)),
                        'default': 'sqlx(default)' in attrs,
                        'skip': 'sqlx(skip)' in attrs or 'sqlx(flatten)' in attrs,
                    })
                structs[m.group(2)] = fields
            for m in CALL.finditer(body):
                i = m.end()
                while body[i] in ' \t\n':
                    i += 1
                literal = body[i] == '"' or (body[i] == 'r' and body[i + 1] in '#"')
                row = m.group(3).replace(' ', '') if m.group(3) else (
                    row_type_from_context(body, m.start()) if m.group(1) == 'query_as' else None)
                queries.append({
                    'file': rel, 'line': body.count('\n', 0, m.start()) + 1,
                    'row': row, 'sql': parse_str_lit(body, i) if literal else None,
                })
    return queries, structs


def psql(db, script):
    p = subprocess.run(['psql', db, '-X', '-q', '-A', '-t', '-F', '|', '-v', 'ON_ERROR_STOP=1'],
                       input=script, capture_output=True, text=True)
    err = p.stderr.strip()
    return p.stdout, (err if p.returncode != 0 or 'ERROR' in err else None)


def describe(db, sql):
    """Result columns [(name, type)] of `sql`, or an error string."""
    for _ in range(8):
        out, err = psql(db, sql.rstrip().rstrip(';') + '\n\\gdesc\n')
        if not err:
            return [ln.split('|', 1) for ln in out.splitlines() if '|' in ln], None
        # Describe-only artefact: sqlx always sends bound parameter types, but a
        # bare describe must infer them. Type the ambiguous one and retry.
        m = re.search(r'could not determine data type of parameter \$(\d+)', err)
        if not m:
            break
        sql = re.sub(r'\$' + m.group(1) + r'(?![0-9])(?!::)', f'${m.group(1)}::text', sql)
    return None, re.sub(r'^psql:<stdin>:\d+: ', '', err.splitlines()[0])


def table_nullability(db):
    out, err = psql(db, "SELECT c.table_schema || '.' || c.table_name, c.column_name, c.is_nullable "
                        "FROM information_schema.columns c "
                        "WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema');\n")
    if err:
        sys.exit(f'cannot read the schema: {err}')
    tables = collections.defaultdict(dict)
    for ln in out.splitlines():
        t, c, n = ln.split('|')
        tables[t][c] = n == 'YES'
    return tables


def decode_problems(query, cols, structs, tables):
    fields = structs.get(query['row'] or '')
    if not fields or not cols:
        return []
    got = {name: re.sub(r'\(\d+(,\d+)?\)', '', ty) for name, ty in cols}
    m = re.search(r'\b(?:FROM|INTO|UPDATE)\s+([a-z_]+\.[a-z_]+|[a-z_]+)', query['sql'], re.I)
    table = tables.get(m.group(1) if m and '.' in m.group(1) else f'public.{m.group(1)}' if m else '', {})
    problems = []
    for f in fields:
        if f['skip']:
            continue
        if f['name'] not in got:
            if not f['default']:
                problems.append(f"{query['row']}.{f['name']}: no such column in the result")
            continue
        opt = re.fullmatch(r'Option<(.+)>', f['ty'])
        base = opt.group(1) if opt else f['ty']
        ok = {'json', 'jsonb'} if base.startswith(('sqlx::types::Json', 'Json<')) else COMPAT.get(base)
        if ok is not None and got[f['name']] not in ok:
            problems.append(f"{query['row']}.{f['name']}: Rust {f['ty']} cannot decode {got[f['name']]}")
        elif ok is not None and not opt and table.get(f['name']):
            problems.append(f"{query['row']}.{f['name']}: nullable column into non-Option {f['ty']} "
                            "(fails on the first NULL)")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('db', help='psql connection string / URL of a migrated database')
    ap.add_argument('--json', help='also write the full result to this file')
    ap.add_argument('--report-only', action='store_true', help='always exit 0')
    args = ap.parse_args()

    queries, structs = extract(ROOT)
    tables = table_nullability(args.db)
    results = []
    for q in queries:
        if q['sql'] is None:
            results.append({**q, 'status': 'dynamic', 'detail': []})
            continue
        cols, err = describe(args.db, q['sql'])
        if err:
            results.append({**q, 'status': 'statement', 'detail': [err]})
            continue
        problems = decode_problems(q, cols, structs, tables)
        hard = [p for p in problems if 'nullable' not in p]
        status = 'decode' if hard else ('nullable' if problems else 'ok')
        results.append({**q, 'status': status, 'detail': problems})

    by_file = collections.defaultdict(collections.Counter)
    for r in results:
        by_file[r['file']][r['status']] += 1
    for r in results:
        if r['status'] in ('statement', 'decode', 'nullable'):
            print(f"{r['file']}:{r['line']}: {r['status']}: {'; '.join(r['detail'])}")
    print('\nper file (failing statements / checked):')
    for f in sorted(by_file, key=lambda f: -(by_file[f]['statement'] + by_file[f]['decode'])):
        c = by_file[f]
        bad = c['statement'] + c['decode']
        if bad:
            print(f"  {bad:3d}/{sum(c.values()) - c['dynamic']:3d}  {f}")
    total = collections.Counter(r['status'] for r in results)
    print(f"\n{len(results)} statements: {total['ok']} ok, {total['statement']} fail to parse against "
          f"the schema, {total['decode']} cannot decode into their row type, {total['nullable']} "
          f"decode only while no NULL appears, {total['dynamic']} built at runtime (not checked)")
    if args.json:
        json.dump(results, open(args.json, 'w'), indent=1)
    failing = total['statement'] + total['decode']
    sys.exit(0 if args.report_only or not failing else 1)


if __name__ == '__main__':
    main()
