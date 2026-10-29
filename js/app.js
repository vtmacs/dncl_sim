/* シミュレーター画面の制御 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const codeEl = $('code');
  const gutterEl = $('gutter');
  const hlEl = $('hl');
  const outEl = $('output');
  const varsEl = $('vars');
  const statusEl = $('status');
  const modeEl = $('mode');
  const sampleEl = $('sample');
  const speedEl = $('speed');
  const inputsEl = $('inputs');
  const btnRun = $('btn-run');
  const btnStep = $('btn-step');
  const btnStop = $('btn-stop');

  const SYMBOLS = {
    dncl2: [
      ['│', '縦線（字下げ）'], ['⎿', 'ブロックの最後の行'], ['==', '等しい'], ['!=', '等しくない'],
      ['<=', '以下'], ['>=', '以上'], ['÷', '整数の商'], ['%', '余り'], ['**', 'べき乗'],
      ['表示する()', '表示文'], ['要素数()', '配列の要素数'],
    ],
    dncl: [
      ['←', '代入'], ['｜', '縦線（字下げ）'], ['＝', '等しい'], ['≠', '等しくない'], ['≦', '以下'],
      ['≧', '以上'], ['×', '掛け算'], ['÷', '整数の商'], ['％', '余り'], ['，', '読点'],
      ['を表示する', '表示文'], ['を実行する', '分岐の終わり'], ['を繰り返す', '繰り返しの終わり'],
    ],
  };

  const STORE_KEY = 'dncl_sim_code_';
  const MAX_OUTPUT = 200000;

  let mode = 'dncl2';
  let interp = null;
  let gen = null;
  let state = 'idle'; // idle | running | paused
  let timer = null;
  let pendingOut = '';
  let inputPos = 0;
  let prevVars = new Map();
  let currentLine = 0;

  // ---------------------------------------------------------------
  // 保存
  // ---------------------------------------------------------------
  function save() {
    try { localStorage.setItem(STORE_KEY + mode, codeEl.value); } catch (e) { /* 保存できない環境 */ }
  }
  function load(m) {
    try { return localStorage.getItem(STORE_KEY + m); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------
  // エディタ
  // ---------------------------------------------------------------
  function lineHeight() {
    return parseFloat(getComputedStyle(codeEl).lineHeight) || 22;
  }

  function updateGutter(errLine) {
    const n = codeEl.value.split('\n').length;
    const parts = [];
    for (let i = 1; i <= n; i++) parts.push(i === errLine ? `<span class="err">${i}</span>` : String(i));
    gutterEl.innerHTML = parts.join('\n');
    syncScroll();
  }

  function syncScroll() {
    gutterEl.scrollTop = codeEl.scrollTop;
    positionHighlight();
  }

  function positionHighlight() {
    if (!currentLine) {
      hlEl.style.display = 'none';
      return;
    }
    const pad = parseFloat(getComputedStyle(codeEl).paddingTop) || 0;
    hlEl.style.display = 'block';
    hlEl.style.top = (pad + (currentLine - 1) * lineHeight() - codeEl.scrollTop) + 'px';
  }

  function highlight(line, isError) {
    currentLine = line || 0;
    hlEl.classList.toggle('error', !!isError);
    positionHighlight();
    if (!line) return;
    // 見える位置までスクロールする
    const lh = lineHeight();
    const top = (line - 1) * lh;
    if (top < codeEl.scrollTop || top + lh * 2 > codeEl.scrollTop + codeEl.clientHeight) {
      codeEl.scrollTop = Math.max(0, top - codeEl.clientHeight / 3);
      syncScroll();
    }
  }

  function insertText(text) {
    if (codeEl.readOnly) return;
    codeEl.focus();
    const s = codeEl.selectionStart;
    const e = codeEl.selectionEnd;
    codeEl.setRangeText(text, s, e, 'end');
    // 「表示する()」のような括弧付きの記号は括弧の中にカーソルを置く
    if (text.endsWith('()')) codeEl.selectionStart = codeEl.selectionEnd = s + text.length - 1;
    onEdit();
  }

  function onEdit() {
    updateGutter();
    save();
  }

  codeEl.addEventListener('input', onEdit);
  codeEl.addEventListener('scroll', syncScroll);
  window.addEventListener('resize', positionHighlight);

  codeEl.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runClicked();
      return;
    }
    if (codeEl.readOnly) return;
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      insertText('  ');
    } else if (e.key === 'Enter' && !e.isComposing) {
      // 前の行の字下げ（縦線を含む）を引き継ぐ
      const s = codeEl.selectionStart;
      const before = codeEl.value.slice(0, s);
      const lineStart = before.lastIndexOf('\n') + 1;
      const cur = before.slice(lineStart);
      const m = cur.match(/^\s*(?:[(（]\s*\d+\s*[)）]\s*)?([\s|｜│┃]*)/);
      let prefix = m ? m[1] : '';
      prefix = prefix.replace(/[⎿└∟]/g, ' ');
      const trimmed = cur.trim();
      const opensBlock = mode === 'dncl2'
        ? /[:：]$/.test(trimmed)
        : /(ならば|そうでなければ|の間[，,、]|ながら[，,、]|^繰り返し[，,、]?)$/.test(trimmed);
      if (opensBlock) prefix += mode === 'dncl2' ? '│ ' : '｜ ';
      e.preventDefault();
      insertText('\n' + prefix);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'F10') {
      e.preventDefault();
      stepClicked();
    } else if (e.key === 'Escape' && state !== 'idle') {
      stop('停止しました');
    }
  });

  // ---------------------------------------------------------------
  // モードとサンプル
  // ---------------------------------------------------------------
  function renderSymbols() {
    const box = $('symbols');
    box.innerHTML = '';
    for (const [sym, title] of SYMBOLS[mode]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = sym;
      b.title = title;
      b.addEventListener('click', () => insertText(sym));
      box.appendChild(b);
    }
  }

  function renderSamples() {
    sampleEl.innerHTML = '<option value="">（選んでください）</option>';
    for (const s of DNCL_SAMPLES[mode]) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.title;
      sampleEl.appendChild(o);
    }
  }

  function setCode(text) {
    codeEl.value = text;
    codeEl.scrollTop = 0;
    highlight(0);
    updateGutter();
  }

  function setMode(m, code) {
    if (state !== 'idle') stop();
    mode = m === 'dncl' ? 'dncl' : 'dncl2';
    modeEl.value = mode;
    renderSymbols();
    renderSamples();
    const saved = code !== undefined ? code : load(mode);
    setCode(saved !== null && saved !== undefined ? saved : DNCL_SAMPLES[mode][0].code.join('\n'));
    if (code !== undefined) save();
  }

  modeEl.addEventListener('change', () => {
    save();
    setMode(modeEl.value);
  });

  sampleEl.addEventListener('change', () => {
    const s = DNCL_SAMPLES[mode].find(x => x.id === sampleEl.value);
    sampleEl.value = '';
    if (!s) return;
    if (state !== 'idle') stop();
    setCode(s.code.join('\n'));
    if (s.inputs) {
      inputsEl.value = s.inputs.join('\n');
    }
    save();
  });

  // ---------------------------------------------------------------
  // 出力と変数
  // ---------------------------------------------------------------
  function writeOut(s) {
    pendingOut += s;
  }

  function flushOut() {
    if (!pendingOut) return;
    outEl.appendChild(document.createTextNode(pendingOut));
    pendingOut = '';
    if (outEl.textContent.length > MAX_OUTPUT) {
      const t = outEl.textContent;
      outEl.textContent = '…（古い出力は省略しました）\n' + t.slice(t.length - MAX_OUTPUT / 2);
    }
    outEl.scrollTop = outEl.scrollHeight;
  }

  function writeSys(text, cls) {
    flushOut();
    const span = document.createElement('span');
    span.className = cls;
    const needNl = outEl.textContent && !outEl.textContent.endsWith('\n');
    span.textContent = (needNl ? '\n' : '') + text + '\n';
    outEl.appendChild(span);
    outEl.scrollTop = outEl.scrollHeight;
  }

  function readInput() {
    const lines = inputsEl.value.split('\n');
    // 末尾の空行は入力として扱わない
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (inputPos < lines.length) {
      const v = lines[inputPos++];
      writeSys('入力: ' + v, 'sys');
      return v;
    }
    flushOut();
    let v = null;
    try { v = window.prompt('値を入力してください'); } catch (e) { v = null; }
    if (v !== null) writeSys('入力: ' + v, 'sys');
    return v;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function renderVars() {
    if (!interp) return;
    const snap = interp.snapshot();
    const next = new Map();
    const rows = [];
    const addRows = (list, scope) => {
      for (const v of list) {
        const key = scope + ':' + v.name;
        next.set(key, v.value);
        const changed = prevVars.has(key) ? prevVars.get(key) !== v.value : prevVars.size > 0 || state !== 'idle';
        rows.push(`<tr class="${changed ? 'changed' : ''}"><td class="name">${escapeHtml(v.name)}</td>` +
          `<td class="val">${escapeHtml(v.value)}</td><td class="type">${v.type}</td></tr>`);
      }
    };
    if (snap.local) {
      rows.push(`<tr class="section"><td colspan="3">関数 ${escapeHtml(snap.local.name)} の局所変数</td></tr>`);
      addRows(snap.local.vars, 'L' + snap.callStack.length);
      rows.push('<tr class="section"><td colspan="3">大域変数</td></tr>');
    }
    addRows(snap.globals, 'G');
    prevVars = next;
    $('callstack').textContent = snap.callStack.length ? '呼び出し中: ' + snap.callStack.join(' → ') : '';
    if (!rows.length) {
      varsEl.innerHTML = '<div class="empty">変数はまだありません</div>';
      return;
    }
    varsEl.innerHTML = '<table><thead><tr><th>名前</th><th>値</th><th>種類</th></tr></thead><tbody>' +
      rows.join('') + '</tbody></table>';
  }

  // ---------------------------------------------------------------
  // 実行制御
  // ---------------------------------------------------------------
  function setStatus(text, cls) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function setState(s) {
    state = s;
    codeEl.readOnly = s !== 'idle';
    btnStop.disabled = s === 'idle';
    btnRun.textContent = s === 'running' ? '❚❚ 一時停止' : (s === 'paused' ? '▶ 続ける' : '▶ 実行');
    modeEl.disabled = s !== 'idle';
  }

  function start() {
    outEl.textContent = '';
    pendingOut = '';
    inputPos = 0;
    prevVars = new Map();
    updateGutter();
    highlight(0);
    let prog;
    try {
      prog = DNCL.parse(codeEl.value, mode);
    } catch (e) {
      showError(e);
      return false;
    }
    interp = new DNCL.Interpreter(prog, { output: writeOut, input: readInput });
    gen = interp.run();
    renderVars();
    return true;
  }

  // 1 ステップ進める。終了またはエラーなら false
  function advance() {
    let r;
    try {
      r = gen.next();
    } catch (e) {
      showError(interp ? interp.convertError(e) : e);
      return false;
    }
    if (r.done) {
      finish();
      return false;
    }
    return true;
  }

  function finish() {
    clearTimeout(timer);
    flushOut();
    renderVars();
    highlight(0);
    writeSys(`― 実行終了（${interp.steps} ステップ）―`, 'sys');
    setStatus('実行終了', 'done');
    setState('idle');
  }

  function showError(e) {
    clearTimeout(timer);
    flushOut();
    const line = e && e.line;
    const msg = e && e.name === 'DnclError' ? e.message : '内部エラー: ' + (e && e.message);
    writeSys(line ? `エラー（${line} 行目）: ${msg}` : `エラー: ${msg}`, 'err');
    setStatus(line ? `${line} 行目でエラー` : 'エラー', 'error');
    renderVars();
    setState('idle');
    if (line) {
      updateGutter(line);
      highlight(line, true);
    }
  }

  function stop(message) {
    clearTimeout(timer);
    flushOut();
    if (message) writeSys('― ' + message + ' ―', 'sys');
    highlight(0);
    setStatus(message || '準備完了');
    setState('idle');
  }

  function tick() {
    if (state !== 'running') return;
    const delay = Number(speedEl.value);
    if (delay === 0) {
      const t0 = performance.now();
      while (performance.now() - t0 < 25) {
        for (let i = 0; i < 200; i++) {
          if (!advance()) return;
        }
      }
      flushOut();
      renderVars();
      setStatus(`実行中… ${interp.steps} ステップ`);
      timer = setTimeout(tick, 0);
    } else {
      if (!advance()) return;
      flushOut();
      renderVars();
      highlight(interp.line);
      setStatus(`実行中… ${interp.line} 行目`);
      timer = setTimeout(tick, delay);
    }
  }

  function runClicked() {
    if (state === 'running') {
      clearTimeout(timer);
      setState('paused');
      flushOut();
      renderVars();
      highlight(interp.line);
      setStatus(`一時停止中（${interp.line} 行目の手前）`);
      return;
    }
    if (state === 'idle') {
      if (!start()) return;
      if (Number(speedEl.value) === 0) highlight(0);
    }
    setState('running');
    setStatus('実行中…');
    tick();
  }

  function stepClicked() {
    if (state === 'running') return;
    if (state === 'idle') {
      if (!start()) return;
      setState('paused');
    }
    if (!advance()) return;
    flushOut();
    renderVars();
    highlight(interp.line);
    setStatus(`${interp.line} 行目を実行する手前（${interp.steps} ステップ目）`);
  }

  btnRun.addEventListener('click', runClicked);
  btnStep.addEventListener('click', stepClicked);
  btnStop.addEventListener('click', () => stop('停止しました'));
  $('btn-clear').addEventListener('click', () => {
    outEl.textContent = '';
  });

  // ---------------------------------------------------------------
  // 起動
  // ---------------------------------------------------------------
  function initFromHash() {
    const hash = location.hash.replace(/^#/, '');
    if (!hash) return false;
    const params = new URLSearchParams(hash);
    const code = params.get('code');
    const m = params.get('mode');
    if (code === null && !m) return false;
    setMode(m || 'dncl2', code === null ? undefined : code);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  if (!initFromHash()) {
    let m = 'dncl2';
    try { m = localStorage.getItem('dncl_sim_mode') || 'dncl2'; } catch (e) { /* なし */ }
    setMode(m);
  }
  modeEl.addEventListener('change', () => {
    try { localStorage.setItem('dncl_sim_mode', mode); } catch (e) { /* なし */ }
  });
  window.addEventListener('hashchange', initFromHash);
  setState('idle');
})();
