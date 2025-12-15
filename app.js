/* eslint-disable no-unused-vars */
// 電卓（広告なし、軽量）。evalは使わない。+ - * / % と小数、括弧なし（実用上は十分）。

const screenEl = document.getElementById("screen");
const historyEl = document.getElementById("history");

/**
 * 状態方針:
 * - input: 今入力中の数（文字列）
 * - tokens: [number, op, number, op, ...] の列（opは "+-*/"）
 * - last: 最後に確定した結果（表示用）
 */
const state = {
  input: "0",
  tokens: [],
  justEvaluated: false
};

function clampDisplay(str) {
  // 無限桁表示でUI崩壊させない。科学表記も許容。
  if (str === "NaN" || str === "Infinity" || str === "-Infinity") return "エラー";
  if (str.length <= 14) return str;
  // 数値に変換できるなら丸める
  const n = Number(str);
  if (Number.isFinite(n)) return formatNumber(n, 12);
  return str.slice(0, 14);
}

function formatNumber(n, sig = 14) {
  // iPad標準電卓っぽく: ある程度までは通常表記、それ以上は科学表記
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
    return n.toExponential(Math.max(0, sig - 1));
  }
  // 余計な0を落とす
  const s = n.toPrecision(sig);
  // toPrecisionは科学表記になることがあるので、そのまま
  if (s.includes("e")) return s;
  return String(Number(s));
}

function render() {
  const expr = tokensToHuman(state.tokens, state.input, state.justEvaluated);
  historyEl.textContent = expr;
  screenEl.textContent = clampDisplay(state.input);
}

function tokensToHuman(tokens, input, justEval) {
  if (tokens.length === 0) return "";
  // 途中式: "12 × 3 +"
  const parts = [];
  for (const t of tokens) {
    if (typeof t === "number") parts.push(formatNumber(t));
    else parts.push(opToGlyph(t));
  }
  if (!justEval) {
    // 入力中のinputを追記（0のときは出さない）
    if (!(input === "0" && parts.length === 0)) {
      parts.push(input);
    }
  }
  return parts.join(" ");
}

function opToGlyph(op) {
  if (op === "*") return "×";
  if (op === "/") return "÷";
  if (op === "-") return "−";
  return op;
}

function inputNumber(d) {
  if (state.justEvaluated) {
    // "="直後の数字は新規入力として開始
    state.tokens = [];
    state.input = "0";
    state.justEvaluated = false;
  }
  if (state.input === "0") state.input = d;
  else state.input += d;
  render();
}

function inputDot() {
  if (state.justEvaluated) {
    state.tokens = [];
    state.input = "0";
    state.justEvaluated = false;
  }
  if (!state.input.includes(".")) state.input += ".";
  render();
}

function clearAll() {
  state.tokens = [];
  state.input = "0";
  state.justEvaluated = false;
  render();
}

function backspace() {
  if (state.justEvaluated) {
    // 結果表示中は入力だけ消して続行
    state.justEvaluated = false;
  }
  if (state.input.length <= 1 || (state.input.length === 2 && state.input.startsWith("-"))) {
    state.input = "0";
  } else {
    state.input = state.input.slice(0, -1);
  }
  render();
}

function toggleSign() {
  if (state.input === "0") return;
  if (state.input.startsWith("-")) state.input = state.input.slice(1);
  else state.input = "-" + state.input;
  render();
}

function percent() {
  // 標準電卓の%は文脈で変わるが、ここでは「現在入力を100で割る」(軽量・一貫)
  const n = Number(state.input);
  if (!Number.isFinite(n)) return errorState();
  state.input = formatNumber(n / 100);
  state.justEvaluated = false;
  render();
}

function errorState() {
  state.tokens = [];
  state.input = "エラー";
  state.justEvaluated = true;
  render();
}

function pushOperator(op) {
  if (state.input === "エラー") return;

  // "="直後の演算子は、今表示中の数を左辺として継続
  if (state.justEvaluated) {
    state.justEvaluated = false;
  }

  const n = Number(state.input);
  if (!Number.isFinite(n)) return errorState();

  if (state.tokens.length === 0) {
    state.tokens.push(n, op);
    state.input = "0";
    render();
    return;
  }

  const last = state.tokens[state.tokens.length - 1];
  if (typeof last === "string") {
    // 連打時は演算子だけ更新（iPad標準っぽい挙動）
    state.tokens[state.tokens.length - 1] = op;
    render();
    return;
  }

  // 直前が数なら、現在入力を積む
  state.tokens.push(n, op);
  state.input = "0";
  render();
}

function equals() {
  if (state.input === "エラー") return;
  const n = Number(state.input);
  if (!Number.isFinite(n)) return errorState();

  const expr = [...state.tokens, n].filter((t) => t !== undefined);
  if (expr.length === 0) return;

  // tokens: number op number op ... number
  try {
    const result = evalTokens(expr);
    if (!Number.isFinite(result)) return errorState();
    historyEl.textContent = exprToHuman(expr) + " =";
    state.tokens = [];
    state.input = formatNumber(result);
    state.justEvaluated = true;
    render();
  } catch (e) {
    errorState();
  }
}

function exprToHuman(expr) {
  const parts = [];
  for (const t of expr) {
    if (typeof t === "number") parts.push(formatNumber(t));
    else parts.push(opToGlyph(t));
  }
  return parts.join(" ");
}

function evalTokens(expr) {
  // 乗除を先に畳んで、その後加減
  // expr形式: [n, op, n, op, n ...]
  const tmp = [];
  let acc = expr[0];
  for (let i = 1; i < expr.length; i += 2) {
    const op = expr[i];
    const rhs = expr[i + 1];
    if (op === "*" || op === "/") {
      acc = op === "*" ? acc * rhs : acc / rhs;
    } else {
      tmp.push(acc, op);
      acc = rhs;
    }
  }
  tmp.push(acc);

  let res = tmp[0];
  for (let i = 1; i < tmp.length; i += 2) {
    const op = tmp[i];
    const rhs = tmp[i + 1];
    res = op === "+" ? res + rhs : res - rhs;
  }
  return res;
}

function bindUI() {
  document.querySelectorAll("[data-num]").forEach((btn) => {
    btn.addEventListener("click", () => inputNumber(btn.getAttribute("data-num")));
  });
  document.querySelectorAll("[data-op]").forEach((btn) => {
    btn.addEventListener("click", () => pushOperator(btn.getAttribute("data-op")));
  });
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = btn.getAttribute("data-action");
      if (a === "clear") return clearAll();
      if (a === "backspace") return backspace();
      if (a === "sign") return toggleSign();
      if (a === "percent") return percent();
      if (a === "dot") return inputDot();
      if (a === "equals") return equals();
    });
  });

  // キーボード対応（iPadの外付けキーボードも想定）
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^\d$/.test(k)) return inputNumber(k);
    if (k === ".") return inputDot();
    if (k === "+" || k === "-" || k === "*" || k === "/") return pushOperator(k);
    if (k === "Enter" || k === "=") {
      e.preventDefault();
      return equals();
    }
    if (k === "Backspace") return backspace();
    if (k === "Escape") return clearAll();
    if (k === "%") return percent();
  });

  // iOSのダブルタップズーム抑止（完全ではないがマシになる）
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) event.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  // iOS Safariはhttps必須（localhost以外）。ここで失敗しても致命ではない。
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

bindUI();
registerSW();
render();


