/**
 * CelEvaluator — Phase 50: Governance Hardening
 *
 * Evaluates a CEL (Common Expression Language) subset against a string
 * context map. Used for GoalSchema.activeWhen and
 * AuthorizedActionSchema.conditions.
 *
 * Supported features:
 *   - Comparison operators: ==  !=  <  >  <=  >=
 *   - Logical operators:    &&  ||  !  (also AND / OR / NOT keywords)
 *   - Grouping parentheses
 *   - String literals:      "value"  'value'
 *   - Number literals:      42  3.14
 *   - Boolean literals:     true  false
 *   - Field access:         key  or  ctx.key  (reads from the context map)
 *   - Legacy format:        key=value AND key=value  (backward compatible)
 *
 * Falls back gracefully — on any parse/eval error returns true (permissive)
 * so a malformed expression never silently blocks a goal.
 */

// ─── Tokeniser ────────────────────────────────────────────────────────────────

type TokenKind =
  | 'string'   // "..." or '...'
  | 'number'   // 42, 3.14
  | 'bool'     // true / false
  | 'ident'    // bare identifier
  | 'op'       // == != < > <= >= && || ! = AND OR NOT
  | 'lparen'   // (
  | 'rparen'   // )
  | 'dot'      // .
  | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
}

function tokenise(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    const ch = expr[i] as string;

    // Skip whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // String literals
    if (ch === '"' || ch === "'") {
      const quote = ch; i++;
      let s = '';
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === '\\' && i + 1 < expr.length) {
          i++;
          s += expr[i++] as string;
        } else {
          s += expr[i++] as string;
        }
      }
      i++; // consume closing quote
      tokens.push({ kind: 'string', value: s });
      continue;
    }

    // Number literals
    const next = expr[i + 1] ?? '';
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(next))) {
      let n = ch; i++;
      while (i < expr.length && /[0-9.]/.test(expr[i] as string)) n += expr[i++] as string;
      tokens.push({ kind: 'number', value: n });
      continue;
    }

    // Parentheses
    if (ch === '(') { tokens.push({ kind: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ kind: 'rparen', value: ')' }); i++; continue; }

    // Dot
    if (ch === '.') { tokens.push({ kind: 'dot', value: '.' }); i++; continue; }

    // Two-char operators
    const two = expr.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ kind: 'op', value: two }); i += 2; continue;
    }

    // Single-char operators
    if ('<>=!'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch }); i++; continue;
    }

    // Identifiers, keywords, and legacy = sign
    if (/[a-zA-Z_]/.test(ch)) {
      let id = ch; i++;
      while (i < expr.length && /[a-zA-Z0-9_-]/.test(expr[i] as string)) id += expr[i++] as string;
      const upper = id.toUpperCase();
      if (upper === 'TRUE')  { tokens.push({ kind: 'bool', value: 'true' });  continue; }
      if (upper === 'FALSE') { tokens.push({ kind: 'bool', value: 'false' }); continue; }
      if (upper === 'AND')   { tokens.push({ kind: 'op',   value: '&&' });    continue; }
      if (upper === 'OR')    { tokens.push({ kind: 'op',   value: '||' });    continue; }
      if (upper === 'NOT')   { tokens.push({ kind: 'op',   value: '!' });     continue; }
      tokens.push({ kind: 'ident', value: id });
      continue;
    }

    // Legacy key=value (bare = sign not preceded by < > !)
    if (ch === '=') {
      tokens.push({ kind: 'op', value: '==' }); i++; continue;
    }

    // Skip unknown characters
    i++;
  }

  tokens.push({ kind: 'eof', value: '' });
  return tokens;
}

// ─── Parser / Evaluator ────────────────────────────────────────────────────────

type CelValue = string | number | boolean | null;

class CelParser {
  private readonly tokens: Token[];
  private pos = 0;
  private readonly ctx: Record<string, string>;

  constructor(tokens: Token[], ctx: Record<string, string>) {
    this.tokens = tokens;
    this.ctx = ctx;
  }

  private peek(): Token { return this.tokens[this.pos] as Token; }
  private consume(): Token { return this.tokens[this.pos++] as Token; }

  private expect(kind: TokenKind): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new Error(`Expected ${kind}, got ${t.kind} '${t.value}'`);
    return this.consume();
  }

  /** Top-level entry point — parses a full expression. */
  parse(): boolean {
    const val = this.parseOr();
    return this.coerceBool(val);
  }

  // Precedence: OR < AND < NOT < comparison < primary
  private parseOr(): CelValue {
    let left = this.parseAnd();
    while (this.peek().kind === 'op' && this.peek().value === '||') {
      this.consume();
      const right = this.parseAnd();
      left = this.coerceBool(left) || this.coerceBool(right);
    }
    return left;
  }

  private parseAnd(): CelValue {
    let left = this.parseUnary();
    while (this.peek().kind === 'op' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseUnary();
      left = this.coerceBool(left) && this.coerceBool(right);
    }
    return left;
  }

  private parseUnary(): CelValue {
    if (this.peek().kind === 'op' && this.peek().value === '!') {
      this.consume();
      return !this.coerceBool(this.parseUnary());
    }
    return this.parseComparison();
  }

  private parseComparison(): CelValue {
    const left = this.parsePrimary();
    const op = this.peek();
    if (op.kind === 'op' && ['==', '!=', '<', '>', '<=', '>='].includes(op.value)) {
      this.consume();
      const right = this.parsePrimary();
      return this.compare(left, op.value, right);
    }
    return left;
  }

  private parsePrimary(): CelValue {
    const t = this.peek();

    if (t.kind === 'lparen') {
      this.consume();
      const val = this.parseOr();
      this.expect('rparen');
      return val;
    }

    if (t.kind === 'string') { this.consume(); return t.value; }
    if (t.kind === 'number') { this.consume(); return Number(t.value); }
    if (t.kind === 'bool')   { this.consume(); return t.value === 'true'; }

    if (t.kind === 'ident') {
      this.consume();
      // Support ctx.key field access
      if (this.peek().kind === 'dot') {
        this.consume();
        const field = this.expect('ident');
        if (t.value === 'ctx') return this.ctx[field.value] ?? null;
        // any_object.field — treat as context lookup
        return this.ctx[field.value] ?? null;
      }
      // Bare identifier — look up in context
      const ctxVal = this.ctx[t.value];
      if (ctxVal !== undefined) return ctxVal;
      // Not in context — return the identifier name as string (for existence checks)
      return null;
    }

    if (t.kind === 'eof') return true;

    this.consume();
    return null;
  }

  private compare(left: CelValue, op: string, right: CelValue): boolean {
    // Coerce both sides to comparable types
    const l = left === null ? '' : left;
    const r = right === null ? '' : right;

    if (typeof l === 'number' && typeof r === 'number') {
      switch (op) {
        case '==': return l === r;
        case '!=': return l !== r;
        case '<':  return l <  r;
        case '>':  return l >  r;
        case '<=': return l <= r;
        case '>=': return l >= r;
      }
    }

    const ls = String(l);
    const rs = String(r);
    switch (op) {
      case '==': return ls === rs;
      case '!=': return ls !== rs;
      case '<':  return ls <  rs;
      case '>':  return ls >  rs;
      case '<=': return ls <= rs;
      case '>=': return ls >= rs;
    }
    return false;
  }

  private coerceBool(v: CelValue): boolean {
    if (v === null || v === false || v === 0 || v === '') return false;
    return true;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluates a CEL expression against the given context map.
 *
 * - An undefined or empty expression always returns true (unconditional).
 * - A parse or evaluation error returns true (permissive fallback) and logs
 *   to stderr for diagnostics.
 * - Legacy "key=value AND key=value" conjunctions are transparently supported.
 *
 * Format detection heuristic:
 *   - If the expression contains quotes (""/'') or CEL-specific syntax
 *     (&&, ||, !, parentheses) → evaluate as CEL.
 *   - Otherwise → evaluate as legacy key=value AND format for backward compat.
 */
export function evalCel(
  expr: string | undefined,
  ctx: Record<string, string>
): boolean {
  if (!expr || expr.trim() === '') return true;

  const upper = expr.toUpperCase();
  const isCelSyntax =
    expr.includes('"') ||
    expr.includes("'") ||
    expr.includes('(') ||
    expr.includes('!') ||
    expr.includes('&&') ||
    expr.includes('||') ||
    expr.includes('==') ||
    expr.includes('!=') ||
    expr.includes('<=') ||
    expr.includes('>=') ||
    upper === 'TRUE' ||
    upper === 'FALSE';

  if (!isCelSyntax) {
    // Legacy key=value AND key=value format — no CEL parsing needed
    return evalLegacy(expr, ctx);
  }

  try {
    const tokens = tokenise(expr);
    const parser = new CelParser(tokens, ctx);
    return parser.parse();
  } catch (err) {
    // CEL parse failed — return permissive true so a malformed expression
    // never silently blocks a goal. Log to stderr for diagnostics.
    process.stderr.write(`[cel-evaluator] parse error for "${expr}": ${String(err)}\n`);
    return true;
  }
}

/** Backward-compatible simple key=value AND key=value evaluator. */
function evalLegacy(expr: string, ctx: Record<string, string>): boolean {
  const clauses = expr.split(/\s+AND\s+/i);
  return clauses.every((clause) => {
    const [key, val] = clause.split('=').map((s) => s.trim());
    if (!key) return true;
    if (!val) return key in ctx;
    return ctx[key] === val;
  });
}
