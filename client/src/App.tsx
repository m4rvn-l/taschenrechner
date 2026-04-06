import { useEffect, useMemo, useState } from 'react'
import './App.css'

type HistoryItem = { id: string; expression: string; result: string; ts: number }

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const OPERATORS = new Set(['+', '-', '*', '/', '^'])

function isOperatorChar(ch: string) {
  return OPERATORS.has(ch)
}

function getCurrentNumberFragment(expr: string) {
  let i = expr.length - 1
  while (i >= 0 && /[0-9.]/.test(expr[i])) i--
  return expr.slice(i + 1)
}

function findLastAtomRange(expr: string) {
  if (!expr) return null
  let end = expr.length

  // Include trailing percent postfixes (e.g. "12%%")
  let endMain = end
  while (endMain > 0 && expr[endMain - 1] === '%') endMain--
  if (endMain <= 0) return null

  let startMain = -1

  if (expr[endMain - 1] === ')') {
    // Find matching '('
    let depth = 0
    for (let i = endMain - 1; i >= 0; i--) {
      if (expr[i] === ')') depth++
      else if (expr[i] === '(') {
        depth--
        if (depth === 0) {
          startMain = i
          break
        }
      }
    }
    if (startMain < 0) return null

    // If we have unary minus directly before that group: "-( ... )"
    const maybeUnaryMinusIndex = startMain - 1
    if (
      maybeUnaryMinusIndex >= 0 &&
      expr[maybeUnaryMinusIndex] === '-' &&
      (maybeUnaryMinusIndex === 0 ||
        isOperatorChar(expr[maybeUnaryMinusIndex - 1]) ||
        expr[maybeUnaryMinusIndex - 1] === '(')
    ) {
      startMain = maybeUnaryMinusIndex
    }
  } else {
    const lastChar = expr[endMain - 1]
    if (!/[0-9.]/.test(lastChar)) return null
    let i = endMain - 1
    while (i >= 0 && /[0-9.]/.test(expr[i])) i--
    startMain = i + 1

    // If we have unary minus directly before the number: "-12"
    const maybeUnaryMinusIndex = startMain - 1
    if (
      maybeUnaryMinusIndex >= 0 &&
      expr[maybeUnaryMinusIndex] === '-' &&
      (maybeUnaryMinusIndex === 0 ||
        isOperatorChar(expr[maybeUnaryMinusIndex - 1]) ||
        expr[maybeUnaryMinusIndex - 1] === '(')
    ) {
      startMain = maybeUnaryMinusIndex
    }
  }

  return { start: startMain, end }
}

function evaluateDisplayValue(expr: string) {
  return expr || '0'
}

export default function App() {
  const [expression, setExpression] = useState<string>('')
  const [result, setResult] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [justEvaluated, setJustEvaluated] = useState<boolean>(false)
  const [history, setHistory] = useState<HistoryItem[]>([])

  const openParenCount = useMemo(() => {
    let open = 0
    let close = 0
    for (const ch of expression) {
      if (ch === '(') open++
      else if (ch === ')') close++
    }
    return open - close
  }, [expression])

  const displayTop = useMemo(() => evaluateDisplayValue(expression), [expression])

  function resetResultForNewInput() {
    setError(null)
    setResult('')
    setJustEvaluated(false)
  }

  function ensureExpressionAfterEquals() {
    if (!justEvaluated) return expression
    // If user continues after '=', treat the last result as the new expression.
    return result || ''
  }

  function appendDigit(d: string) {
    const base = ensureExpressionAfterEquals()
    if (justEvaluated) {
      setExpression(d)
      setResult('')
      setError(null)
      setJustEvaluated(false)
      return
    }
    if (!base) {
      setExpression(d)
      return
    }
    const last = base[base.length - 1]
    if (last === ')' || last === '%') {
      setExpression(base + '*' + d)
    } else {
      setExpression(base + d)
    }
  }

  function appendDecimal() {
    const base = ensureExpressionAfterEquals()
    if (justEvaluated) {
      setExpression('0.')
      setResult('')
      setError(null)
      setJustEvaluated(false)
      return
    }
    if (!base) {
      setExpression('0.')
      return
    }
    const last = base[base.length - 1]
    if (last === ')' || last === '%' || last === '^') {
      setExpression(base + '*0.')
      return
    }
    if (isOperatorChar(last) || last === '(') {
      setExpression(base + '0.')
      return
    }
    const frag = getCurrentNumberFragment(base)
    if (frag.includes('.')) return
    setExpression(base + '.')
  }

  function appendOperator(op: string) {
    const base = ensureExpressionAfterEquals()
    if (justEvaluated) {
      // start a continuation from the last result
      setExpression((result || '') + op)
      setError(null)
      setResult('')
      setJustEvaluated(false)
      return
    }
    if (!base) {
      if (op === '-') setExpression('-')
      return
    }
    const last = base[base.length - 1]
    if (isOperatorChar(last)) {
      setExpression(base.slice(0, -1) + op)
      return
    }
    if (last === '(') return
    setExpression(base + op)
  }

  function appendLeftParen() {
    const base = ensureExpressionAfterEquals()
    resetResultForNewInput()
    const last = base[base.length - 1]
    if (!base) {
      setExpression('(')
      return
    }
    if (isOperatorChar(last) || last === '(') {
      setExpression(base + '(')
      return
    }
    if (last === ')' || last === '%') {
      setExpression(base + '*(')
      return
    }
    // Otherwise keep it strict and don't create implicit multiplication for edge-cases.
    setExpression(base + '*(')
  }

  function appendRightParen() {
    const base = ensureExpressionAfterEquals()
    resetResultForNewInput()
    if (!base) return
    const last = base[base.length - 1]
    if (!/[0-9)]/.test(last) && last !== '%' && last !== ')') return
    if (openParenCount <= 0) return
    setExpression(base + ')')
  }

  function backspace() {
    if (justEvaluated) {
      setExpression(result)
      setResult('')
      setError(null)
      setJustEvaluated(false)
      return
    }
    if (!expression) return
    resetResultForNewInput()
    setExpression((prev) => prev.slice(0, -1))
  }

  function clearAll() {
    setExpression('')
    setResult('')
    setError(null)
    setJustEvaluated(false)
  }

  function appendPercent() {
    const base = ensureExpressionAfterEquals()
    resetResultForNewInput()
    if (!base) {
      setExpression('0%')
      return
    }
    if (base.endsWith('%')) return
    const last = base[base.length - 1]
    if (/[0-9]/.test(last) || last === ')' || last === '.') {
      setExpression(base + '%')
    } else {
      setExpression(base + '0%')
    }
  }

  function wrapLastAtom(wrapper: 'sqrt' | 'recip') {
    const base = ensureExpressionAfterEquals()
    resetResultForNewInput()
    const range = findLastAtomRange(base)
    const atom = range ? base.slice(range.start, range.end) : '0'
    if (!range) {
      setExpression(`${wrapper}(${atom})`)
      return
    }
    setExpression(base.slice(0, range.start) + `${wrapper}(${atom})` + base.slice(range.end))
  }

  function toggleSign() {
    const base = ensureExpressionAfterEquals()
    resetResultForNewInput()
    if (!base) {
      setExpression('-0')
      return
    }
    const range = findLastAtomRange(base)
    if (!range) return

    const atom = base.slice(range.start, range.end)
    // Separate trailing percents so we can safely unwrap "-( ... )" only.
    let i = atom.length
    while (i > 0 && atom[i - 1] === '%') i--
    const percentSuffix = atom.slice(i)
    const atomNoPercent = atom.slice(0, i)

    if (atomNoPercent.startsWith('-(') && atomNoPercent.endsWith(')')) {
      const inner = atomNoPercent.slice(2, -1)
      const newAtomNoPercent = `(${inner})`
      setExpression(base.slice(0, range.start) + newAtomNoPercent + percentSuffix + base.slice(range.end))
      return
    }

    if (atomNoPercent.startsWith('-') && /^[0-9.]+$/.test(atomNoPercent.slice(1))) {
      setExpression(base.slice(0, range.start) + atomNoPercent.slice(1) + percentSuffix + base.slice(range.end))
      return
    }

    setExpression(base.slice(0, range.start) + `-(${atom})` + base.slice(range.end))
  }

  function canEvaluate(expr: string) {
    if (!expr.trim()) return false
    const last = expr[expr.length - 1]
    if (isOperatorChar(last) || last === '(') return false
    return true
  }

  async function evaluate() {
    if (!canEvaluate(expression)) return
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Fehler')

      const next = String(data.result ?? '')
      setResult(next)
      setHistory((h) => [
        { id: crypto.randomUUID(), expression, result: next, ts: Date.now() },
        ...h
      ])
      setJustEvaluated(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler')
      setResult('')
      setJustEvaluated(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key
      if (key >= '0' && key <= '9') return appendDigit(key)
      if (key === '.') return appendDecimal()
      if (key === '+' || key === '-' || key === '*' || key === '/') return appendOperator(key)
      if (key === '^') return appendOperator('^')
      if (key === '(') return appendLeftParen()
      if (key === ')') return appendRightParen()
      if (key === '%') return appendPercent()
      if (key === 'Enter' || key === '=') {
        e.preventDefault()
        void evaluate()
        return
      }
      if (key === 'Escape') return clearAll()
      if (key === 'Backspace') return backspace()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression, result, justEvaluated])

  return (
    <div className="calc-root">
      <div className="calc">
        <div className="display" role="status" aria-live="polite">
          <div className="expression">{displayTop}</div>
          {error ? <div className="result error">{error}</div> : <div className="result">{justEvaluated ? result : ''}</div>}
        </div>

        <div className="keypad">
          <button className="key key-ac" onClick={clearAll}>
            AC
          </button>
          <button className="key key-op" onClick={backspace} aria-label="Backspace">
            ⌫
          </button>
          <button className="key key-op" onClick={appendLeftParen}>
            (
          </button>
          <button className="key key-op" onClick={appendRightParen}>
            )
          </button>

          <button className="key key-func" onClick={() => wrapLastAtom('sqrt')}>
            sqrt
          </button>
          <button className="key key-func" onClick={appendPercent}>
            %
          </button>
          <button className="key key-func" onClick={() => appendOperator('^')}>
            ^
          </button>
          <button className="key key-op" onClick={() => appendOperator('/')}>
            ÷
          </button>

          <button className="key" onClick={() => appendDigit('7')}>
            7
          </button>
          <button className="key" onClick={() => appendDigit('8')}>
            8
          </button>
          <button className="key" onClick={() => appendDigit('9')}>
            9
          </button>
          <button className="key key-op" onClick={() => appendOperator('*')}>
            ×
          </button>

          <button className="key" onClick={() => appendDigit('4')}>
            4
          </button>
          <button className="key" onClick={() => appendDigit('5')}>
            5
          </button>
          <button className="key" onClick={() => appendDigit('6')}>
            6
          </button>
          <button className="key key-op" onClick={() => appendOperator('-')}>
            -
          </button>

          <button className="key" onClick={() => appendDigit('1')}>
            1
          </button>
          <button className="key" onClick={() => appendDigit('2')}>
            2
          </button>
          <button className="key" onClick={() => appendDigit('3')}>
            3
          </button>
          <button className="key key-op" onClick={() => appendOperator('+')}>
            +
          </button>

          <button className="key key-func" onClick={() => wrapLastAtom('recip')}>
            1/x
          </button>
          <button className="key key-func" onClick={toggleSign}>
            +/-
          </button>
          <button className="key" onClick={() => appendDigit('0')}>
            0
          </button>
          <button className="key" onClick={appendDecimal}>
            .
          </button>

          <button className="key key-equals" onClick={() => void evaluate()} style={{ gridColumn: '1 / -1' }}>
            =
          </button>
        </div>
      </div>

      <div className="history">
        <div className="history-title">Verlauf</div>
        {history.length === 0 ? (
          <div className="history-empty">Noch keine Berechnungen.</div>
        ) : (
          <div className="history-list">
            {history.slice(0, 8).map((h) => (
              <button
                key={h.id}
                className="history-item"
                onClick={() => {
                  setExpression(h.expression)
                  setResult('')
                  setError(null)
                  setJustEvaluated(false)
                }}
              >
                <span className="history-expr">{h.expression}</span>
                <span className="history-res">= {h.result}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
