// 電卓（広告なし、軽量）。evalは使わない。+ - * / と小数、括弧()対応。

const screenEl = document.getElementById("screen");
const historyEl = document.getElementById("history");

/**
 * 状態方針:
 * - expr: 入力済みトークン列（文字列）。例: ["(", "12.3", "+", "4", ")", "*", "2"]
 * - input: 今入力中の数（文字列）
 */
const state = {
  input: "0",
  expr: [],
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
  historyEl.textContent = exprToHumanPreview();
  screenEl.textContent = clampDisplay(state.input);
}

function exprToHumanPreview() {
  const parts = state.expr.map((t) => (isNumberToken(t) ? formatNumber(Number(t)) : opToGlyph(t)));
  if (!state.justEvaluated) {
    // 入力中は末尾にinputを付ける（"0"のみでも括弧の中では出したいので条件を緩める）
    if (state.input !== "" && !(state.input === "0" && parts.length === 0)) parts.push(state.input);
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
    state.expr = [];
    state.input = "0";
    state.justEvaluated = false;
  }
  if (state.input === "0") state.input = d;
  else state.input += d;
  render();
}

function inputDot() {
  if (state.justEvaluated) {
    state.expr = [];
    state.input = "0";
    state.justEvaluated = false;
  }
  if (!state.input.includes(".")) state.input += ".";
  render();
}

function clearAll() {
  state.expr = [];
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

function errorState() {
  state.expr = [];
  state.input = "エラー";
  state.justEvaluated = true;
  render();
}

function flushInputIfNeeded() {
  if (state.input === "" || state.input === "エラー") return;
  // 入力が "0" でも、直前が "(" のときは意味があるので積む（例: (0.5 )
  if (state.justEvaluated) state.justEvaluated = false;
  // "0" だけで、まだ何も無いなら積まない（押してないのと同義）
  if (state.input === "0" && state.expr.length === 0) return;
  state.expr.push(state.input);
  state.input = "0";
}

function lastToken() {
  if (state.expr.length === 0) return null;
  return state.expr[state.expr.length - 1];
}

function pushOperator(op) {
  if (state.input === "エラー") return;

  // "="直後の演算子は、今表示中の数を左辺として継続
  if (state.justEvaluated) {
    state.justEvaluated = false;
  }

  // 値が入力中なら積む
  if (state.input !== "0" || state.expr.length === 0) {
    if (state.input !== "0" || state.expr.length > 0) flushInputIfNeeded();
  }

  const last = lastToken();
  if (last === null) {
    // 先頭の + は無視、- は単項マイナスとして入力に反映、* / は無視
    if (op === "-") {
      state.input = state.input.startsWith("-") ? state.input.slice(1) : "-" + state.input;
      render();
    }
    return;
  }

  // 連打時は演算子置換
  if (isOperatorToken(last)) {
    state.expr[state.expr.length - 1] = op;
    render();
    return;
  }

  // "(" の直後に演算子は基本NG。ただし "-" なら単項マイナスとして許す（"-" をトークンとして置く）
  if (last === "(") {
    if (op === "-") {
      state.expr.push(op);
      render();
    }
    return;
  }

  // 通常: 演算子を積む
  state.expr.push(op);
  render();
}

function pushParen(paren) {
  if (state.input === "エラー") return;
  if (state.justEvaluated && paren === "(") {
    // 結果の後に "(" を押したら新規式開始
    state.expr = [];
    state.input = "0";
    state.justEvaluated = false;
  } else if (state.justEvaluated) {
    state.justEvaluated = false;
  }

  const last = lastToken();

  if (paren === "(") {
    // 暗黙の掛け算: "2(" や ")(" を "2*(" / ")*(" にする
    if (last && (isNumberToken(last) || last === ")")) state.expr.push("*");
    state.expr.push("(");
    render();
    return;
  }

  // ")"
  // 入力中の数があるなら先に積む
  if (state.input !== "0" || (last && last === "(")) {
    if (state.input !== "0") flushInputIfNeeded();
  }

  // "(" が存在しないなら無視
  if (!state.expr.includes("(")) return;
  // 直前が演算子 or "(" の場合は閉じない
  const last2 = lastToken();
  if (last2 === "(" || isOperatorToken(last2)) return;
  state.expr.push(")");
  render();
}

function equals() {
  if (state.input === "エラー") return;
  // 入力中の数があるなら積む
  if (state.input !== "0") flushInputIfNeeded();

  const expr = [...state.expr];
  if (expr.length === 0) return;

  try {
    const result = evalExpression(expr);
    if (!Number.isFinite(result)) return errorState();
    historyEl.textContent = tokensToHuman(expr) + " =";
    state.expr = [];
    state.input = formatNumber(result);
    state.justEvaluated = true;
    render();
  } catch (e) {
    errorState();
  }
}

function tokensToHuman(tokens) {
  return tokens
    .map((t) => {
      if (isNumberToken(t)) return formatNumber(Number(t));
      return opToGlyph(t);
    })
    .join(" ");
}

function isNumberToken(t) {
  if (typeof t !== "string") return false;
  if (t === "" || t === "." || t === "-") return false;
  const n = Number(t);
  return Number.isFinite(n);
}

function isOperatorToken(t) {
  return t === "+" || t === "-" || t === "*" || t === "/";
}

function precedence(op) {
  if (op === "u-") return 3;
  if (op === "*" || op === "/") return 2;
  if (op === "+" || op === "-") return 1;
  return 0;
}

function isRightAssociative(op) {
  return op === "u-";
}

function evalExpression(tokens) {
  // シャントヤードでRPNへ → 評価
  const output = [];
  const ops = [];

  let prevType = "start"; // start | value | op | lparen | rparen

  for (const raw of tokens) {
    const t = raw;
    if (isNumberToken(t)) {
      output.push({ type: "num", value: Number(t) });
      prevType = "value";
      continue;
    }
    if (t === "(") {
      ops.push(t);
      prevType = "lparen";
      continue;
    }
    if (t === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        output.push({ type: "op", value: ops.pop() });
      }
      if (ops.length === 0) throw new Error("mismatched paren");
      ops.pop(); // "("
      prevType = "rparen";
      continue;
    }
    if (isOperatorToken(t)) {
      // 単項マイナス判定
      let op = t;
      if (op === "-" && (prevType === "start" || prevType === "op" || prevType === "lparen")) {
        op = "u-";
      }
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top === "(") break;
        const pTop = precedence(top);
        const pOp = precedence(op);
        if (pTop > pOp || (pTop === pOp && !isRightAssociative(op))) {
          output.push({ type: "op", value: ops.pop() });
        } else {
          break;
        }
      }
      ops.push(op);
      prevType = "op";
      continue;
    }
    throw new Error("unknown token");
  }

  while (ops.length > 0) {
    const op = ops.pop();
    if (op === "(") throw new Error("mismatched paren");
    output.push({ type: "op", value: op });
  }

  const stack = [];
  for (const node of output) {
    if (node.type === "num") {
      stack.push(node.value);
      continue;
    }
    const op = node.value;
    if (op === "u-") {
      if (stack.length < 1) throw new Error("bad unary");
      const a = stack.pop();
      stack.push(-a);
      continue;
    }
    if (stack.length < 2) throw new Error("bad expr");
    const b = stack.pop();
    const a = stack.pop();
    if (op === "+") stack.push(a + b);
    else if (op === "-") stack.push(a - b);
    else if (op === "*") stack.push(a * b);
    else if (op === "/") stack.push(a / b);
    else throw new Error("bad op");
  }
  if (stack.length !== 1) throw new Error("bad result");
  return stack[0];
}

function bindUI() {
  const evt = "PointerEvent" in window ? "pointerup" : "click";
  document.querySelectorAll("[data-num]").forEach((btn) => {
    btn.addEventListener(evt, () => inputNumber(btn.getAttribute("data-num")));
  });
  document.querySelectorAll("[data-op]").forEach((btn) => {
    btn.addEventListener(evt, () => pushOperator(btn.getAttribute("data-op")));
  });
  document.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener(evt, () => {
      const a = btn.getAttribute("data-action");
      if (a === "clear") return clearAll();
      if (a === "backspace") return backspace();
      if (a === "dot") return inputDot();
      if (a === "lparen") return pushParen("(");
      if (a === "rparen") return pushParen(")");
      if (a === "equals") return equals();
    });
  });

  // キーボード対応（iPadの外付けキーボードも想定）
  window.addEventListener("keydown", (e) => {
    const k = e.key;
    if (/^\d$/.test(k)) return inputNumber(k);
    if (k === ".") return inputDot();
    if (k === "(") return pushParen("(");
    if (k === ")") return pushParen(")");
    if (k === "+" || k === "-" || k === "*" || k === "/") return pushOperator(k);
    if (k === "Enter" || k === "=") {
      e.preventDefault();
      return equals();
    }
    if (k === "Backspace") return backspace();
    if (k === "Escape") return clearAll();
  });
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  // iOS Safariはhttps必須（localhost以外）。ここで失敗しても致命ではない。
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

bindUI();
registerSW();
render();


