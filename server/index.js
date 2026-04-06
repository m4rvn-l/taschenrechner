const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

function formatNumber(n) {
  if (Object.is(n, -0)) return '0';
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && abs < 1e-12) return '0';
  // Cap precision to keep the output readable like on a school calculator.
  if (abs >= 1e12 || abs < 1e-6) return n.toPrecision(12).replace(/\.?0+e/, 'e');
  const fixed = n.toFixed(12);
  return fixed.replace(/\.?0+$/, '');
}

function tokenize(input) {
  const s = input.replace(/\s+/g, '');
  const tokens = [];
  const isDigit = (c) => c >= '0' && c <= '9';

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (isDigit(ch) || ch === '.') {
      const start = i;
      let hasDot = false;
      while (i < s.length) {
        const c = s[i];
        if (isDigit(c)) {
          i++;
          continue;
        }
        if (c === '.') {
          if (hasDot) break;
          hasDot = true;
          i++;
          continue;
        }
        break;
      }
      const raw = s.slice(start, i);
      if (raw === '.' || raw.length === 0) throw new Error('Ungültige Zahl');
      tokens.push({ type: 'number', value: raw });
      continue;
    }

    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      const start = i;
      i++;
      while (i < s.length) {
        const c = s[i];
        if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) i++;
        else break;
      }
      const ident = s.slice(start, i);
      if (ident === 'sqrt' || ident === 'recip') {
        tokens.push({ type: 'func', value: ident });
      } else {
        throw new Error(`Unbekannte Funktion: ${ident}`);
      }
      continue;
    }

    if (ch === '%') {
      tokens.push({ type: 'percent' });
      i++;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch });
      i++;
      continue;
    }

    throw new Error(`Ungültiges Zeichen: ${ch}`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(type, value) {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      const got = t.type === 'op' || t.type === 'paren' ? `${t.type} ${t.value}` : t.type;
      throw new Error(`Syntaxfehler (erwartet ${type}${value ? ` ${value}` : ''}, bekam ${got})`);
    }
    this.pos++;
    return t;
  }

  parseExpression() {
    return this.parseAddSub();
  }

  parseAddSub() {
    let node = this.parseMulDiv();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.peek().value;
      this.pos++;
      const right = this.parseMulDiv();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  }

  parseMulDiv() {
    let node = this.parsePower();
    while (this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.peek().value;
      this.pos++;
      const right = this.parsePower();
      node = { type: 'bin', op, left: node, right };
    }
    return node;
  }

  parsePower() {
    const base = this.parseUnary();
    if (this.peek().type === 'op' && this.peek().value === '^') {
      this.pos++;
      const exp = this.parsePower(); // right associative
      return { type: 'pow', left: base, right: exp };
    }
    return base;
  }

  parseUnary() {
    if (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.peek().value;
      this.pos++;
      const expr = this.parseUnary();
      if (op === '-') return { type: 'unary', op: 'neg', expr };
      return expr;
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (this.peek().type === 'percent') {
      this.pos++;
      node = { type: 'postfix', op: 'percent', expr: node };
    }
    return node;
  }

  parsePrimary() {
    const t = this.peek();
    if (t.type === 'number') {
      this.pos++;
      return { type: 'number', value: Number(t.value) };
    }

    if (t.type === 'paren' && t.value === '(') {
      this.pos++;
      const inner = this.parseExpression();
      this.consume('paren', ')');
      return inner;
    }

    if (t.type === 'func') {
      const func = t.value;
      this.pos++;
      this.consume('paren', '(');
      const inner = this.parseExpression();
      this.consume('paren', ')');
      return { type: 'func', name: func, arg: inner };
    }

    throw new Error('Unerwartetes Token');
  }
}

function evalNode(node) {
  switch (node.type) {
    case 'number':
      if (!Number.isFinite(node.value)) throw new Error('Zahl ungültig');
      return node.value;
    case 'bin': {
      const a = evalNode(node.left);
      const b = evalNode(node.right);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Ergebnis ungültig');
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new Error('Division durch 0');
          return a / b;
        default:
          throw new Error('Unbekannter Operator');
      }
    }
    case 'pow': {
      const base = evalNode(node.left);
      const exp = evalNode(node.right);
      const v = base ** exp;
      if (!Number.isFinite(v)) throw new Error('Ergebnis zu groß/ungültig');
      return v;
    }
    case 'unary':
      if (node.op === 'neg') return -evalNode(node.expr);
      throw new Error('Unbekannte Unary-Operation');
    case 'postfix':
      if (node.op === 'percent') return evalNode(node.expr) / 100;
      throw new Error('Unbekannter Postfix');
    case 'func': {
      const v = evalNode(node.arg);
      switch (node.name) {
        case 'sqrt':
          if (v < 0) throw new Error('Wurzel aus negativer Zahl');
          return Math.sqrt(v);
        case 'recip':
          if (v === 0) throw new Error('Kehrwert von 0');
          return 1 / v;
        default:
          throw new Error('Unbekannte Funktion');
      }
    }
    default:
      throw new Error('Interner Fehler: unbekannter Knoten');
  }
}

function evaluateExpression(expression) {
  if (typeof expression !== 'string') throw new Error('Expression fehlt');
  const trimmed = expression.trim();
  if (!trimmed) throw new Error('Expression ist leer');
  if (trimmed.length > 200) throw new Error('Expression zu lang');

  const tokens = tokenize(trimmed);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  if (parser.peek().type !== 'eof') throw new Error('Syntaxfehler (Resttokens vorhanden)');

  const value = evalNode(ast);
  if (!Number.isFinite(value)) throw new Error('Ergebnis ungültig');
  return formatNumber(value);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/evaluate', (req, res) => {
  try {
    const { expression } = req.body ?? {};
    const result = evaluateExpression(expression ?? '');
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
  }
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server läuft auf http://localhost:${PORT}`);
});

