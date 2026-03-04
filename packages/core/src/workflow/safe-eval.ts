/**
 * Safe Expression Evaluator for Workflow Conditions
 *
 * Replaces `new Function()` with a recursive-descent parser that supports:
 * - Property access: steps.step1.output.status
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Logical operators: &&, ||, !
 * - Literals: string, number, boolean, null
 * - Parenthesized grouping: (a && b) || c
 *
 * Rejects: function calls, assignments, new, import, require, template literals.
 */

const MAX_EXPRESSION_LENGTH = 1000;

// Tokens for the lexer
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'BOOLEAN'
  | 'NULL'
  | 'IDENTIFIER'
  | 'DOT'
  | 'LPAREN'
  | 'RPAREN'
  | 'EQ'
  | 'NEQ'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null;
}

// Forbidden keywords that indicate code injection
const FORBIDDEN_KEYWORDS = new Set([
  'function',
  'new',
  'import',
  'require',
  'eval',
  'Function',
  'class',
  'delete',
  'typeof',
  'void',
  'yield',
  'await',
  'async',
  'return',
  'throw',
  'var',
  'let',
  'const',
  'for',
  'while',
  'do',
  'if',
  'else',
  'switch',
  'try',
  'catch',
  'with',
  'debugger',
  'this',
  'super',
  'constructor',
  '__proto__',
  'prototype',
]);

class Lexer {
  private pos = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  private peek(): string {
    return this.src[this.pos] ?? '';
  }

  private advance(): string {
    return this.src[this.pos++] ?? '';
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos]!)) {
      this.pos++;
    }
  }

  next(): Token {
    this.skipWhitespace();
    if (this.pos >= this.src.length) return { type: 'EOF', value: null };

    const ch = this.peek();

    // String literals
    if (ch === "'" || ch === '"') {
      return this.readString(ch);
    }

    // Template literals — forbidden
    if (ch === '`') {
      throw new Error('Template literals are not allowed in conditions');
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(this.src[this.pos + 1] ?? ''))) {
      return this.readNumber();
    }

    // Operators and punctuation
    if (ch === '(') {
      this.advance();
      return { type: 'LPAREN', value: '(' };
    }
    if (ch === ')') {
      this.advance();
      return { type: 'RPAREN', value: ')' };
    }
    if (ch === '.') {
      this.advance();
      return { type: 'DOT', value: '.' };
    }
    if (ch === '!') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        if (this.peek() === '=') this.advance(); // !== treated same as !=
        return { type: 'NEQ', value: '!=' };
      }
      return { type: 'NOT', value: '!' };
    }
    if (ch === '=') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        if (this.peek() === '=') this.advance(); // === treated same as ==
        return { type: 'EQ', value: '==' };
      }
      throw new Error('Assignment (=) is not allowed in conditions');
    }
    if (ch === '>') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return { type: 'GTE', value: '>=' };
      }
      return { type: 'GT', value: '>' };
    }
    if (ch === '<') {
      this.advance();
      if (this.peek() === '=') {
        this.advance();
        return { type: 'LTE', value: '<=' };
      }
      return { type: 'LT', value: '<' };
    }
    if (ch === '&') {
      this.advance();
      if (this.peek() === '&') {
        this.advance();
        return { type: 'AND', value: '&&' };
      }
      throw new Error('Bitwise & is not allowed, use && for logical AND');
    }
    if (ch === '|') {
      this.advance();
      if (this.peek() === '|') {
        this.advance();
        return { type: 'OR', value: '||' };
      }
      throw new Error('Bitwise | is not allowed, use || for logical OR');
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      return this.readIdentifier();
    }

    throw new Error(`Unexpected character: ${ch}`);
  }

  private readString(quote: string): Token {
    this.advance(); // skip opening quote
    let str = '';
    while (this.pos < this.src.length && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance();
        const escaped = this.advance();
        if (escaped === 'n') str += '\n';
        else if (escaped === 't') str += '\t';
        else if (escaped === '\\') str += '\\';
        else if (escaped === quote) str += quote;
        else str += escaped;
      } else {
        str += this.advance();
      }
    }
    if (this.pos >= this.src.length) throw new Error('Unterminated string literal');
    this.advance(); // skip closing quote
    return { type: 'STRING', value: str };
  }

  private readNumber(): Token {
    let num = '';
    if (this.peek() === '-') num += this.advance();
    while (this.pos < this.src.length && /[0-9.]/.test(this.peek())) {
      num += this.advance();
    }
    const parsed = Number(num);
    if (isNaN(parsed)) throw new Error(`Invalid number: ${num}`);
    return { type: 'NUMBER', value: parsed };
  }

  private readIdentifier(): Token {
    let id = '';
    while (this.pos < this.src.length && /[a-zA-Z0-9_$]/.test(this.peek())) {
      id += this.advance();
    }
    if (id === 'true') return { type: 'BOOLEAN', value: true };
    if (id === 'false') return { type: 'BOOLEAN', value: false };
    if (id === 'null') return { type: 'NULL', value: null };
    if (id === 'undefined') return { type: 'NULL', value: null };
    if (FORBIDDEN_KEYWORDS.has(id)) {
      throw new Error(`Keyword '${id}' is not allowed in conditions`);
    }
    return { type: 'IDENTIFIER', value: id };
  }
}

class Parser {
  private current: Token;
  private readonly lexer: Lexer;
  private readonly context: Record<string, unknown>;

  constructor(lexer: Lexer, context: Record<string, unknown>) {
    this.lexer = lexer;
    this.context = context;
    this.current = this.lexer.next();
  }

  private eat(type: TokenType): Token {
    if (this.current.type !== type) {
      throw new Error(`Expected ${type}, got ${this.current.type}`);
    }
    const tok = this.current;
    this.current = this.lexer.next();
    return tok;
  }

  parse(): boolean {
    const result = this.orExpr();
    if (this.current.type !== 'EOF') {
      throw new Error(`Unexpected token: ${String(this.current.value)}`);
    }
    return !!result;
  }

  private orExpr(): unknown {
    let left = this.andExpr();
    while (this.current.type === 'OR') {
      this.eat('OR');
      const right = this.andExpr();
      left = left || right;
    }
    return left;
  }

  private andExpr(): unknown {
    let left = this.comparison();
    while (this.current.type === 'AND') {
      this.eat('AND');
      const right = this.comparison();
      left = left && right;
    }
    return left;
  }

  private comparison(): unknown {
    let left = this.unary();
    while (
      this.current.type === 'EQ' ||
      this.current.type === 'NEQ' ||
      this.current.type === 'GT' ||
      this.current.type === 'GTE' ||
      this.current.type === 'LT' ||
      this.current.type === 'LTE'
    ) {
      const op = this.current.type;
      this.eat(op);
      const right = this.unary();
      switch (op) {
        case 'EQ':
          left = left == right;
          break;
        case 'NEQ':
          left = left != right;
          break;
        case 'GT':
          left = (left as number) > (right as number);
          break;
        case 'GTE':
          left = (left as number) >= (right as number);
          break;
        case 'LT':
          left = (left as number) < (right as number);
          break;
        case 'LTE':
          left = (left as number) <= (right as number);
          break;
      }
    }
    return left;
  }

  private unary(): unknown {
    if (this.current.type === 'NOT') {
      this.eat('NOT');
      return !this.unary();
    }
    return this.primary();
  }

  private primary(): unknown {
    // Parenthesized expression
    if (this.current.type === 'LPAREN') {
      this.eat('LPAREN');
      const result = this.orExpr();
      this.eat('RPAREN');
      // Reject function calls: if next token is LPAREN, that's fn()
      if (this.current.type === 'LPAREN') {
        throw new Error('Function calls are not allowed in conditions');
      }
      return result;
    }

    // Literals
    if (this.current.type === 'NUMBER') return this.eat('NUMBER').value;
    if (this.current.type === 'STRING') return this.eat('STRING').value;
    if (this.current.type === 'BOOLEAN') return this.eat('BOOLEAN').value;
    if (this.current.type === 'NULL') {
      this.eat('NULL');
      return null;
    }

    // Property access: identifier(.identifier)*
    if (this.current.type === 'IDENTIFIER') {
      const name = this.eat('IDENTIFIER').value as string;
      let value: unknown = this.context[name];

      while (this.current.type === 'DOT') {
        this.eat('DOT');
        const prop = this.eat('IDENTIFIER').value as string;
        if (value === null || value === undefined) {
          value = undefined;
          continue;
        }
        value = (value as Record<string, unknown>)[prop];
      }

      // Reject function calls: identifier() or identifier.prop()
      if (this.current.type === 'LPAREN') {
        throw new Error('Function calls are not allowed in conditions');
      }

      return value;
    }

    throw new Error(`Unexpected token: ${this.current.type}`);
  }
}

/**
 * Evaluate a condition expression safely against a context object.
 * Returns true/false. Throws on syntax errors or forbidden constructs.
 */
export function evaluateCondition(
  expr: string,
  context: Record<string, unknown>
): boolean {
  if (!expr || typeof expr !== 'string') return false;
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    throw new Error(`Expression too long (${expr.length} chars, max ${MAX_EXPRESSION_LENGTH})`);
  }

  const lexer = new Lexer(expr);
  const parser = new Parser(lexer, context);
  return parser.parse();
}

/**
 * Validate a condition expression at save time (no execution context needed).
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateConditionExpression(
  expr: string
): { valid: boolean; error?: string } {
  if (!expr || typeof expr !== 'string') return { valid: false, error: 'Expression is empty' };
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    return { valid: false, error: `Expression too long (max ${MAX_EXPRESSION_LENGTH} chars)` };
  }

  try {
    // Parse with empty context — will validate syntax without evaluating property lookups
    const lexer = new Lexer(expr);
    const parser = new Parser(lexer, {});
    parser.parse();
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : String(e) };
  }
}
