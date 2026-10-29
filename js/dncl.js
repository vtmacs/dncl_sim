/*
 * DNCL / DNCL2 インタプリタ
 *
 *   DNCL  : 旧センター試験「情報関係基礎」で使われた手順記述標準言語
 *   DNCL2 : 共通テスト「情報Ⅰ」用プログラム表記
 *
 * ブラウザでは window.DNCL、Node.js では module.exports として公開する。
 */
(function (global) {
  'use strict';

  class DnclError extends Error {
    constructor(message, line) {
      super(message);
      this.name = 'DnclError';
      this.line = line;
    }
  }

  // ------------------------------------------------------------------
  // 前処理（行番号・字下げ・全角記号・コメント）
  // ------------------------------------------------------------------

  // 字下げとして扱う縦線・鉤（かぎ）記号
  const BAR_CHARS = '|｜│┃⎿└∟┗┕┖╰';

  // 全角英数字（U+FF01〜U+FF5E）以外で置き換える文字
  const CHAR_MAP = {
    '、': ',', '　': ' ', '−': '-', '‐': '-', '–': '-', '×': '*', '·': '*',
    '≦': '<=', '≤': '<=', '≧': '>=', '≥': '>=', '≠': '!=',
    '【': '', '】': '', '⇐': '←', '〔': '(', '〕': ')',
  };

  const QUOTES = '"“”＂';

  function normalizeText(s, line) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (QUOTES.includes(c) || c === '「') {
        const isKagi = c === '「';
        let j = i + 1;
        let buf = '';
        while (j < s.length && !(isKagi ? s[j] === '」' : QUOTES.includes(s[j]))) {
          buf += s[j];
          j++;
        }
        if (j >= s.length) {
          throw new DnclError('文字列の終わりを示す記号（" または 」）がありません', line);
        }
        out += '"' + buf.replace(/"/g, '”') + '"';
        i = j + 1;
        continue;
      }
      if (c === '#' || c === '＃') break; // コメント
      const code = c.charCodeAt(0);
      if (code >= 0xFF01 && code <= 0xFF5E) {
        out += String.fromCharCode(code - 0xFEE0);
      } else if (Object.prototype.hasOwnProperty.call(CHAR_MAP, c)) {
        out += CHAR_MAP[c];
      } else {
        out += c;
      }
      i++;
    }
    return out.trim().replace(/。$/, '').trim();
  }

  const LINE_NO_RE = /^\s*[(（]\s*[0-9０-９]+\s*[)）]([ \t　]*)/;

  function bracketDepth(text) {
    let depth = 0;
    let inStr = false;
    for (const c of text) {
      if (c === '"') inStr = !inStr;
      else if (!inStr && '([{'.includes(c)) depth++;
      else if (!inStr && ')]}'.includes(c)) depth--;
    }
    return depth;
  }

  function preprocess(src) {
    const raw = String(src).replace(/\r\n?/g, '\n').split('\n');
    // 試験問題のような行番号「( 1 )」「(01)」を取り除く。行番号の後の空白は
    // 行ごとに幅が違うことがあるので、全行に共通する分だけ取り除く
    let common = Infinity;
    for (const s of raw) {
      const m = s.match(LINE_NO_RE);
      if (m && s.slice(m[0].length).trim()) common = Math.min(common, m[1].length);
    }
    const lines = [];
    raw.forEach((s, idx) => {
      const line = idx + 1;
      const m = s.match(LINE_NO_RE);
      const t = m ? s.slice(m[0].length - m[1].length + Math.min(common, m[1].length)) : s;
      let indent = 0;
      let k = 0;
      for (; k < t.length; k++) {
        const c = t[k];
        if (c === ' ') indent += 1;
        else if (c === '\t') indent += 4;
        else if (c === '　') indent += 2;
        else if (BAR_CHARS.includes(c)) indent += 1;
        else break;
      }
      const text = normalizeText(t.slice(k), line);
      if (text === '') return;
      // 括弧が閉じていない行は次の行に続く（試験問題で長い配列や表示文を折り返す書き方）
      const prev = lines[lines.length - 1];
      if (prev && bracketDepth(prev.text) > 0) {
        prev.text += ' ' + text;
        return;
      }
      lines.push({ line, indent, text });
    });
    return lines;
  }

  // ------------------------------------------------------------------
  // 字句解析
  // ------------------------------------------------------------------

  const JP_CLASS = '\\u3040-\\u309F\\u30A0-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF々〆ヶ';
  const JP_RE = new RegExp('^[' + JP_CLASS + ']+');
  const WORD_OPS = ['かつ', 'または', 'でない', 'と'];
  const KEYWORDS = new Set(['and', 'or', 'not', 'かつ', 'または', 'でない', 'と']);
  const TWO_CHAR_OPS = { '**': '**', '==': '==', '!=': '!=', '<=': '<=', '>=': '>=', '<>': '!=' };
  const ONE_CHAR_OPS = '+-*/÷%()[]{},=<>←';

  function tokenize(text, line) {
    const toks = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '"') {
        const j = text.indexOf('"', i + 1);
        toks.push({ t: 'str', v: text.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
      const rest = text.slice(i);
      let m;
      if ((m = rest.match(/^(?:\d+\.\d+|\d+|\.\d+)/))) {
        toks.push({ t: 'num', v: parseFloat(m[0]) });
        i += m[0].length;
        continue;
      }
      if ((m = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/))) {
        toks.push({ t: 'id', v: m[0] });
        i += m[0].length;
        continue;
      }
      if ((m = rest.match(JP_RE))) {
        let word = m[0];
        // 「かつ要素数(A)」のように続けて書かれたキーワードを切り出す
        const kw = WORD_OPS.find(w => word.startsWith(w) && word.length > w.length);
        if (kw) word = kw;
        toks.push({ t: 'id', v: word });
        i += word.length;
        continue;
      }
      const two = rest.slice(0, 2);
      if (TWO_CHAR_OPS[two]) {
        toks.push({ t: 'op', v: TWO_CHAR_OPS[two] });
        i += 2;
        continue;
      }
      if (ONE_CHAR_OPS.includes(c)) {
        toks.push({ t: 'op', v: c });
        i++;
        continue;
      }
      throw new DnclError(`使用できない文字「${c}」があります`, line);
    }
    return toks;
  }

  // ------------------------------------------------------------------
  // 式の構文解析
  // ------------------------------------------------------------------

  class ExprParser {
    constructor(toks, line, mode) {
      this.toks = toks;
      this.p = 0;
      this.line = line;
      this.mode = mode;
    }
    err(msg) { return new DnclError(msg, this.line); }
    peek() { return this.toks[this.p]; }
    isOp(v) { const t = this.peek(); return !!t && t.t === 'op' && t.v === v; }
    isWord(...vs) { const t = this.peek(); return !!t && t.t === 'id' && vs.includes(t.v); }
    expectOp(v) {
      if (!this.isOp(v)) {
        const t = this.peek();
        throw this.err(t ? `「${v}」が必要な位置に「${t.v}」があります` : `「${v}」が足りません`);
      }
      this.p++;
    }
    end() {
      const t = this.peek();
      if (t) throw this.err(`式の後ろに余分な「${t.t === 'str' ? '"' + t.v + '"' : t.v}」があります`);
    }

    parseExpr() { return this.mode === 'dncl' ? this.parseLogicDncl() : this.parseOr(); }

    // DNCL の論理演算子（かつ・または・でない）には優先順位がなく、左から順に計算する
    parseLogicDncl() {
      let e = this.parseCmp();
      for (;;) {
        if (this.isWord('and', 'かつ')) {
          this.p++;
          e = { k: 'and', l: e, r: this.parseCmp() };
        } else if (this.isWord('or', 'または')) {
          this.p++;
          e = { k: 'or', l: e, r: this.parseCmp() };
        } else if (this.isWord('でない', 'not')) {
          this.p++;
          e = { k: 'not', e };
        } else {
          return e;
        }
      }
    }

    parseOr() {
      let l = this.parseAnd();
      while (this.isWord('or', 'または')) {
        this.p++;
        l = { k: 'or', l, r: this.parseAnd() };
      }
      return l;
    }

    parseAnd() {
      let l = this.parseNot();
      while (this.isWord('and', 'かつ')) {
        this.p++;
        l = { k: 'and', l, r: this.parseNot() };
      }
      return l;
    }

    parseNot() {
      if (this.isWord('not')) {
        this.p++;
        return { k: 'not', e: this.parseNot() };
      }
      let e = this.parseCmp();
      while (this.isWord('でない')) {
        this.p++;
        e = { k: 'not', e };
      }
      return e;
    }

    parseCmp() {
      const l = this.parseAdd();
      const t = this.peek();
      if (t && t.t === 'op' && ['==', '!=', '<', '>', '<=', '>=', '='].includes(t.v)) {
        let op = t.v;
        if (op === '=') {
          if (this.mode !== 'dncl') {
            throw this.err('DNCL2 で「等しい」を表す比較演算子は「==」です（「=」は代入です）');
          }
          op = '==';
        }
        this.p++;
        return { k: 'bin', op, l, r: this.parseAdd() };
      }
      return l;
    }

    parseAdd() {
      let l = this.parseMul();
      while (this.isOp('+') || this.isOp('-')) {
        const op = this.toks[this.p++].v;
        l = { k: 'bin', op, l, r: this.parseMul() };
      }
      return l;
    }

    parseMul() {
      let l = this.parseUnary();
      while (this.isOp('*') || this.isOp('/') || this.isOp('÷') || this.isOp('%')) {
        const op = this.toks[this.p++].v;
        l = { k: 'bin', op, l, r: this.parseUnary() };
      }
      return l;
    }

    parseUnary() {
      if (this.isOp('-')) { this.p++; return { k: 'neg', e: this.parseUnary() }; }
      if (this.isOp('+')) { this.p++; return this.parseUnary(); }
      return this.parsePow();
    }

    parsePow() {
      const base = this.parsePostfix();
      if (this.isOp('**')) {
        this.p++;
        return { k: 'bin', op: '**', l: base, r: this.parseUnary() };
      }
      return base;
    }

    parseList(close) {
      const items = [];
      if (this.isOp(close)) { this.p++; return items; }
      for (;;) {
        items.push(this.parseExpr());
        if (this.isOp(',')) { this.p++; continue; }
        this.expectOp(close);
        return items;
      }
    }

    parsePostfix() {
      let node = this.parsePrimary();
      while (this.isOp('[')) {
        this.p++;
        const idxs = this.parseList(']');
        if (!idxs.length) throw this.err('[ ] の中に添字がありません');
        // A[i, j] は A[i][j] と同じ
        for (const index of idxs) node = { k: 'idx', base: node, index };
      }
      return node;
    }

    parsePrimary() {
      const t = this.peek();
      if (!t) throw this.err('式が途中で終わっています');
      if (t.t === 'num') { this.p++; return { k: 'num', v: t.v }; }
      if (t.t === 'str') { this.p++; return { k: 'str', v: t.v }; }
      if (t.t === 'op') {
        if (t.v === '(') {
          this.p++;
          const e = this.parseExpr();
          this.expectOp(')');
          return e;
        }
        if (t.v === '[' || t.v === '{') {
          this.p++;
          return { k: 'arr', items: this.parseList(t.v === '[' ? ']' : '}') };
        }
        throw this.err(`「${t.v}」の位置が正しくありません`);
      }
      if (KEYWORDS.has(t.v)) throw this.err(`「${t.v}」の位置が正しくありません`);
      this.p++;
      if (this.isOp('(')) {
        this.p++;
        return { k: 'call', name: t.v, args: this.parseList(')') };
      }
      return { k: 'var', name: t.v };
    }
  }

  function parseExprTokens(toks, line, mode) {
    if (!toks.length) throw new DnclError('式がありません', line);
    const p = new ExprParser(toks, line, mode);
    const e = p.parseExpr();
    p.end();
    return e;
  }

  function parseExprText(text, line, mode) {
    return parseExprTokens(tokenize(text, line), line, mode);
  }

  function parseTargetTokens(toks, line, mode) {
    const e = parseExprTokens(toks, line, mode);
    if (e.k !== 'var' && e.k !== 'idx') {
      throw new DnclError('代入の左側には変数か配列の要素を書きます', line);
    }
    return e;
  }

  function parseVarName(text, line, mode) {
    const e = parseExprText(text, line, mode);
    if (e.k !== 'var') throw new DnclError(`「${text}」は変数名ではありません`, line);
    return e.name;
  }

  // 括弧の外側にあるトークンで区切る
  function splitTop(toks, isSep) {
    const groups = [[]];
    let depth = 0;
    for (const t of toks) {
      if (t.t === 'op' && '([{'.includes(t.v)) depth++;
      if (t.t === 'op' && ')]}'.includes(t.v)) depth--;
      if (depth === 0 && isSep(t)) groups.push([]);
      else groups[groups.length - 1].push(t);
    }
    return groups;
  }

  function findTop(toks, pred) {
    let depth = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'op' && '([{'.includes(t.v)) depth++;
      if (t.t === 'op' && ')]}'.includes(t.v)) depth--;
      if (depth === 0 && pred(t)) return i;
    }
    return -1;
  }

  const isOpTok = v => t => t.t === 'op' && t.v === v;

  // ------------------------------------------------------------------
  // 単純文（代入・表示・増減・関数呼び出しなど）
  // ------------------------------------------------------------------

  function parsePrintItems(text, line, mode) {
    const groups = splitTop(tokenize(text, line), t => (t.t === 'op' && t.v === ',') || (t.t === 'id' && t.v === 'と'));
    return groups.map(g => parseExprTokens(g, line, mode));
  }

  function parseSimple(text, line, mode) {
    let m;
    if (/^改行を表示する$/.test(text)) {
      return [{ type: 'print', items: [], nl: true, line }];
    }
    if ((m = text.match(/^(.+?)\s*を\s*改行なしで表示する$/))) {
      return [{ type: 'print', items: parsePrintItems(m[1], line, mode), nl: false, line }];
    }
    if ((m = text.match(/^(.+?)\s*を\s*表示する$/))) {
      return [{ type: 'print', items: parsePrintItems(m[1], line, mode), nl: true, line }];
    }
    if ((m = text.match(/^(.+?)\s*のすべての(?:要素|値)\s*(?:に|を)\s*(.+?)\s*(?:を代入する|にする)$/))) {
      return [{ type: 'fill', name: parseVarName(m[1], line, mode), expr: parseExprText(m[2], line, mode), line }];
    }
    if ((m = text.match(/^(.+?)\s*の末尾に\s*(.+?)\s*を追加する$/))) {
      return [{ type: 'push', name: parseVarName(m[1], line, mode), expr: parseExprText(m[2], line, mode), line }];
    }
    if ((m = text.match(/^(.+?)\s*を\s*(.+?)\s*(増やす|減らす)$/))) {
      return [{
        type: 'incr',
        target: parseTargetTokens(tokenize(m[1], line), line, mode),
        expr: parseExprText(m[2], line, mode),
        sign: m[3] === '増やす' ? 1 : -1,
        line,
      }];
    }
    if ((m = text.match(/^(.+?)\s*を返す$/)) || (m = text.match(/^(?:返す|戻り値)\s*\((.+)\)$/))) {
      return [{ type: 'return', expr: parseExprText(m[1], line, mode), line }];
    }
    if (/^(?:を実行|を繰り返す|を実行する|そうでなければ|そうでなくもし)/.test(text)) {
      throw new DnclError(`「${text}」に対応する「もし」や繰り返しの始まりがありません`, line);
    }

    const toks = tokenize(text, line);
    const groups = splitTop(toks, isOpTok(','));
    const out = [];
    for (const g of groups) {
      if (!g.length) throw new DnclError('「,」の前後に文がありません', line);
      const ai = findTop(g, t => t.t === 'op' && (t.v === '←' || (mode !== 'dncl' && t.v === '=')));
      if (ai >= 0) {
        if (ai === 0) throw new DnclError('代入先の変数がありません', line);
        out.push({
          type: 'assign',
          target: parseTargetTokens(g.slice(0, ai), line, mode),
          expr: parseExprTokens(g.slice(ai + 1), line, mode),
          line,
        });
        continue;
      }
      if (mode === 'dncl' && findTop(g, isOpTok('=')) >= 0) {
        throw new DnclError('DNCL では代入に「←」を使います（「=」は等しいかどうかの比較です）', line);
      }
      if (groups.length > 1) throw new DnclError('「,」で区切って並べられるのは代入文だけです', line);
      const e = parseExprTokens(g, line, mode);
      if (e.k !== 'call') {
        throw new DnclError(`「${text}」を文として解釈できません`, line);
      }
      out.push({ type: 'call', expr: e, line });
    }
    return out;
  }

  function asStatement(list, line) {
    return list.length === 1 ? list[0] : { type: 'seq', body: list, line };
  }

  // ------------------------------------------------------------------
  // 文の構文解析
  // ------------------------------------------------------------------

  const RE = {
    for: /^(.+?)\s*を\s*(.+?)\s*から\s*(.+?)\s*まで\s*(.+?)\s*ずつ\s*(増やし|減らし)ながら\s*,?\s*(.*)$/,
    func: /^関数\s*([^\s(]+)\s*\(([^)]*)\)\s*(?:を定義する|を)?\s*:?$/,
  };

  function makeFor(m, line, mode, body) {
    return {
      type: 'for',
      name: parseVarName(m[1], line, mode),
      from: parseExprText(m[2], line, mode),
      to: parseExprText(m[3], line, mode),
      step: parseExprText(m[4], line, mode),
      dir: m[5] === '増やし' ? 1 : -1,
      body,
      line,
    };
  }

  function makeFunc(m, line, body) {
    const params = m[2].split(',').map(s => s.trim()).filter(Boolean);
    for (const p of params) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && !JP_RE.test(p)) {
        throw new DnclError(`引数名「${p}」が正しくありません`, line);
      }
    }
    return { type: 'func', name: m[1], params, body, line };
  }

  // DNCL2：字下げ（または縦線）でブロックを表す
  function parseDncl2(lines) {
    const mode = 'dncl2';
    let pos = 0;

    function block(bound, depth) {
      const out = [];
      while (pos < lines.length && lines[pos].indent > bound) out.push(stmt(bound, depth));
      return out;
    }

    function child(L, rest, depth) {
      if (rest) return parseSimple(rest, L.line, mode);
      const body = block(L.indent, depth + 1);
      if (!body.length) {
        throw new DnclError(`「${L.text}」の中身がありません。次の行から字下げして書いてください`, L.line);
      }
      return body;
    }

    function stmt(bound, depth) {
      const L = lines[pos++];
      const t = L.text;
      const line = L.line;
      let m;

      if ((m = t.match(/^もし\s*(.+?)\s*ならば\s*:?\s*(.*)$/))) {
        const branches = [{ cond: parseExprText(m[1], line, mode), body: child(L, m[2], depth), line }];
        let elseBody = null;
        while (pos < lines.length && lines[pos].indent > bound) {
          const L2 = lines[pos];
          if ((m = L2.text.match(/^そうでなくもし\s*(.+?)\s*ならば\s*:?\s*(.*)$/))) {
            pos++;
            branches.push({ cond: parseExprText(m[1], L2.line, mode), body: child(L2, m[2], depth), line: L2.line });
            continue;
          }
          if ((m = L2.text.match(/^そうでなければ\s*:?\s*(.*)$/))) {
            pos++;
            elseBody = child(L2, m[1], depth);
          }
          break;
        }
        return { type: 'if', branches, elseBody, line };
      }
      if (/^そうでなくもし|^そうでなければ/.test(t)) {
        throw new DnclError(`「${t}」に対応する「もし」がありません（字下げの位置を確認してください）`, line);
      }
      if ((m = t.match(RE.for))) {
        const rest = m[6].replace(/^繰り返す\s*:?\s*/, '');
        return makeFor(m, line, mode, child(L, rest, depth));
      }
      if ((m = t.match(/^(.+?)\s*の間\s*,?\s*繰り返す\s*:?\s*(.*)$/))) {
        return { type: 'while', cond: parseExprText(m[1], line, mode), body: child(L, m[2], depth), line };
      }
      if (/^繰り返す\s*:?$/.test(t)) {
        const body = child(L, '', depth);
        const L2 = lines[pos];
        if (!L2 || L2.indent <= bound || !(m = L2.text.match(/^(?:を\s*,?\s*)?(.+?)\s*になるまで\s*(?:実行する|繰り返す)?$/))) {
          throw new DnclError('「繰り返す:」のブロックの後に「〜になるまで繰り返す」がありません', line);
        }
        pos++;
        return { type: 'until', body, cond: parseExprText(m[1], L2.line, mode), condLine: L2.line, line };
      }
      if ((m = t.match(RE.func))) {
        if (depth > 0) throw new DnclError('関数の定義は字下げせずに書いてください', line);
        return makeFunc(m, line, child(L, '', depth));
      }
      return asStatement(parseSimple(t, line, mode), line);
    }

    const body = block(-1, 0);
    return body;
  }

  // DNCL：「を実行する」「を繰り返す」などの終わりの言葉でブロックを表す
  function parseDncl(lines) {
    const mode = 'dncl';
    let pos = 0;

    const T = {
      ifEnd: /^を実行する$/,
      ifElse: /^を実行し\s*,?\s*そうでなければ$/,
      ifElif: /^を実行し\s*,?\s*そうでなくもし\s*(.+?)\s*ならば$/,
      loopEnd: /^を繰り返す$/,
      until: /^を\s*,?\s*(.+?)\s*になるまで\s*(?:実行する|繰り返す)$/,
      funcEnd: /^(?:と|を)定義する$/,
    };
    const ALL_T = Object.values(T);

    function until(terms, L, endName, depth) {
      const body = [];
      while (pos < lines.length) {
        const c = lines[pos];
        for (let k = 0; k < terms.length; k++) {
          const m = c.text.match(terms[k]);
          if (m) {
            pos++;
            if (!body.length) {
              throw new DnclError(`「${L.text}」の中身がありません`, L.line);
            }
            return { body, k, m, L: c };
          }
        }
        body.push(stmt(depth + 1));
      }
      throw new DnclError(`「${L.text}」の終わりを示す「${endName}」が見つかりません`, L.line);
    }

    function inline(text, line) {
      return parseSimple(text, line, mode);
    }

    function stmt(depth) {
      const L = lines[pos++];
      const t = L.text;
      const line = L.line;
      let m;

      if (/^もし/.test(t) && /を実行する$/.test(t)) {
        // 1 行（または「を実行し，」で改行して続けた数行）で書いた条件分岐
        const parts = t.replace(/\s*を実行する$/, '').split(/\s*を実行し\s*,\s*/);
        const branches = [];
        let elseBody = null;
        parts.forEach((part, i) => {
          let pm;
          if (i === 0) pm = part.match(/^もし\s*(.+?)\s*ならば\s*(.+)$/);
          else pm = part.match(/^そうでなくもし\s*(.+?)\s*ならば\s*(.+)$/);
          if (pm) {
            if (elseBody) throw new DnclError('「そうでなければ」の後に条件は続けられません', line);
            branches.push({ cond: parseExprText(pm[1], line, mode), body: inline(pm[2], line), line });
          } else if (i > 0 && i === parts.length - 1 && (pm = part.match(/^そうでなければ\s*(.+)$/))) {
            elseBody = inline(pm[1], line);
          } else {
            throw new DnclError(`条件分岐の形が正しくありません（「${part}」）`, line);
          }
        });
        return { type: 'if', branches, elseBody, line };
      }
      if ((m = t.match(/^もし\s*(.+?)\s*ならば$/))) {
        const branches = [];
        let elseBody = null;
        let cond = parseExprText(m[1], line, mode);
        let H = L;
        for (;;) {
          const r = until([T.ifEnd, T.ifElse, T.ifElif], H, 'を実行する', depth);
          branches.push({ cond, body: r.body, line: H.line });
          if (r.k === 0) break;
          if (r.k === 1) {
            elseBody = until([T.ifEnd], r.L, 'を実行する', depth).body;
            break;
          }
          cond = parseExprText(r.m[1], r.L.line, mode);
          H = r.L;
        }
        return { type: 'if', branches, elseBody, line };
      }
      if ((m = t.match(RE.for))) {
        const rest = m[6];
        if (rest) {
          const im = rest.match(/^(.+?)\s*を繰り返す$/);
          if (!im) throw new DnclError('順次繰り返しの最後は「を繰り返す」で終えてください', line);
          return makeFor(m, line, mode, inline(im[1], line));
        }
        return makeFor(m, line, mode, until([T.loopEnd], L, 'を繰り返す', depth).body);
      }
      if ((m = t.match(/^(.+?)\s*の間\s*,\s*(.+?)\s*を繰り返す$/))) {
        return { type: 'while', cond: parseExprText(m[1], line, mode), body: inline(m[2], line), line };
      }
      if ((m = t.match(/^(.+?)\s*の間\s*,?$/))) {
        return {
          type: 'while',
          cond: parseExprText(m[1], line, mode),
          body: until([T.loopEnd], L, 'を繰り返す', depth).body,
          line,
        };
      }
      if ((m = t.match(/^繰り返し\s*,\s*(.+?)\s*を\s*,?\s*(.+?)\s*になるまで\s*(?:実行する|繰り返す)$/))) {
        return { type: 'until', body: inline(m[1], line), cond: parseExprText(m[2], line, mode), condLine: line, line };
      }
      if (/^繰り返し\s*,?$/.test(t)) {
        const r = until([T.until], L, 'を，〜になるまで実行する', depth);
        return { type: 'until', body: r.body, cond: parseExprText(r.m[1], r.L.line, mode), condLine: r.L.line, line };
      }
      if ((m = t.match(RE.func))) {
        if (depth > 0) throw new DnclError('関数の定義は他の文の中には書けません', line);
        return makeFunc(m, line, until([T.funcEnd], L, 'と定義する', depth).body);
      }
      if (ALL_T.some(re => re.test(t))) {
        throw new DnclError(`「${t}」に対応する「もし」や繰り返しの始まりがありません`, line);
      }
      return asStatement(parseSimple(t, line, mode), line);
    }

    // 「…を実行し，」で行が終わり、次の行が「そうでなければ」「そうでなくもし」で
    // 始まる場合は 1 行につなげる（改行位置で意味は変わらない）
    for (let i = 0; i < lines.length - 1; i++) {
      if (/を実行し\s*,$/.test(lines[i].text) && /^そうでな/.test(lines[i + 1].text)) {
        lines[i] = { ...lines[i], text: lines[i].text + lines[i + 1].text };
        lines.splice(i + 1, 1);
        i--;
      }
    }

    const body = [];
    while (pos < lines.length) body.push(stmt(0));
    return body;
  }

  function parse(src, mode) {
    mode = mode === 'dncl' ? 'dncl' : 'dncl2';
    const lines = preprocess(src);
    const body = mode === 'dncl' ? parseDncl(lines) : parseDncl2(lines);
    const funcs = Object.create(null);
    for (const s of body) {
      if (s.type !== 'func') continue;
      if (BUILTINS[s.name]) throw new DnclError(`関数名「${s.name}」は組み込み関数と同じ名前なので使えません`, s.line);
      if (funcs[s.name]) throw new DnclError(`関数「${s.name}」が二重に定義されています`, s.line);
      funcs[s.name] = s;
    }
    return { mode, body, funcs };
  }

  // ------------------------------------------------------------------
  // 値
  // ------------------------------------------------------------------

  class Arr {
    constructor(items, dflt, base) {
      this.items = items;
      this.dflt = dflt; // 「すべての要素に〜を代入する」で設定される既定値
      this.base = base || 0; // 添字の開始（0 または 1）。items[base] が最初の要素
    }
    get size() { return Math.max(0, this.items.length - this.base); }
  }

  function fmtNum(v) {
    if (Object.is(v, -0)) return '0';
    if (Number.isInteger(v)) return String(v);
    if (!isFinite(v)) return String(v);
    return String(parseFloat(v.toPrecision(12)));
  }

  // 表示する で使う形式
  function fmt(v) {
    if (typeof v === 'number') return fmtNum(v);
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? '真' : '偽';
    if (v instanceof Arr) return fmtArr(v, 1000);
    return '';
  }

  function fmtArr(a, limit) {
    const parts = [];
    const n = a.items.length;
    for (let i = a.base; i < n && i - a.base < limit; i++) {
      const x = a.items[i];
      if (x === undefined) parts.push(a.dflt !== undefined ? fmtInner(a.dflt) : '?');
      else parts.push(fmtInner(x, limit));
    }
    if (a.size > limit) parts.push(`…（全${a.size}個）`);
    return '[' + parts.join(', ') + ']';
  }

  function fmtInner(v, limit) {
    if (typeof v === 'string') return '"' + v + '"';
    if (v instanceof Arr) return fmtArr(v, limit);
    return fmt(v);
  }

  function typeName(v) {
    if (typeof v === 'number') return '数値';
    if (typeof v === 'string') return '文字列';
    if (typeof v === 'boolean') return '真偽値';
    if (v instanceof Arr) return '配列';
    return '値なし';
  }

  // ------------------------------------------------------------------
  // 組み込み関数
  // ------------------------------------------------------------------

  function needNum(it, v, fname) {
    if (typeof v !== 'number') throw it.err(`${fname} には数値を渡してください（${typeName(v)}が渡されました）`);
    return v;
  }

  // 最大値(x, y, …) または 最大値(配列)
  function minMax(args, it, fname, f) {
    let vals = args;
    if (args.length === 1 && args[0] instanceof Arr) vals = args[0].items.slice(args[0].base);
    if (!vals.length) throw it.err(`${fname} には値を 1 つ以上渡してください`);
    return f(...vals.map(v => needNum(it, v, fname)));
  }

  function printProc(nl) {
    return {
      proc: true,
      fn(args, it) {
        it.out(args.map(fmt).join('') + (nl ? '\n' : ''));
      },
    };
  }

  const BUILTINS = {
    '表示する': printProc(true),
    '改行なしで表示する': printProc(false),
    '要素数': {
      n: 1,
      fn([v], it) {
        if (v instanceof Arr) return v.size;
        if (typeof v === 'string') return Array.from(v).length;
        throw it.err('要素数 には配列か文字列を渡してください');
      },
    },
    '整数': { n: 1, fn([v], it) { return Math.trunc(needNum(it, v, '整数')); } },
    '乱数': {
      fn(args, it) {
        if (args.length === 0) return Math.random();
        // DNCL の説明資料の例：乱数(m, n) は m 以上 n 以下の整数をランダムに返す
        if (args.length === 2) {
          const [a, b] = args.map(v => needNum(it, v, '乱数'));
          if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) {
            throw it.err('乱数(m, n) の m と n は m ≦ n の整数にしてください');
          }
          return a + Math.floor(Math.random() * (b - a + 1));
        }
        throw it.err('乱数 の引数は 0 個（0 以上 1 未満の小数）か 2 個（m 以上 n 以下の整数）です');
      },
    },
    '二乗': { n: 1, fn([v], it) { return needNum(it, v, '二乗') ** 2; } },
    'べき乗': { n: 2, fn([a, b], it) { return needNum(it, a, 'べき乗') ** needNum(it, b, 'べき乗'); } },
    '奇数': {
      n: 1,
      fn([v], it) {
        needNum(it, v, '奇数');
        return Number.isInteger(v) && Math.abs(v % 2) === 1;
      },
    },
    '二進': {
      n: 1,
      fn([v], it) {
        needNum(it, v, '二進');
        if (!Number.isInteger(v) || v < 0) throw it.err('二進 には 0 以上の整数を渡してください');
        return v.toString(2);
      },
    },
    '二進で表示する': {
      proc: true,
      n: 1,
      fn([v], it) {
        needNum(it, v, '二進で表示する');
        if (!Number.isInteger(v) || v < 0) throw it.err('二進で表示する には 0 以上の整数を渡してください');
        it.out(v.toString(2) + '\n');
      },
    },
    // ---- 以下はシミュレーター独自の拡張 ----
    '絶対値': { n: 1, fn([v], it) { return Math.abs(needNum(it, v, '絶対値')); } },
    '平方根': {
      n: 1,
      fn([v], it) {
        if (needNum(it, v, '平方根') < 0) throw it.err('負の数の平方根は求められません');
        return Math.sqrt(v);
      },
    },
    '切り捨て': { n: 1, fn([v], it) { return Math.floor(needNum(it, v, '切り捨て')); } },
    '切り上げ': { n: 1, fn([v], it) { return Math.ceil(needNum(it, v, '切り上げ')); } },
    '四捨五入': { n: 1, fn([v], it) { return Math.round(needNum(it, v, '四捨五入')); } },
    '文字列': { n: 1, fn([v]) { return fmt(v); } },
    '数値': {
      n: 1,
      fn([v], it) {
        if (typeof v === 'number') return v;
        const x = Number(String(v).trim());
        if (String(v).trim() === '' || Number.isNaN(x)) throw it.err(`「${fmt(v)}」は数値に変換できません`);
        return x;
      },
    },
    '入力': { n: 0, fn(args, it) { return it.readInput(); } },
    // 令和8年度 追試験「情報Ⅰ」第3問で問題文中に定義された関数
    '最大値': { fn(args, it) { return minMax(args, it, '最大値', Math.max); } },
    '最小値': { fn(args, it) { return minMax(args, it, '最小値', Math.min); } },
  };

  // ------------------------------------------------------------------
  // 実行
  // ------------------------------------------------------------------

  const MAX_DEPTH = 300;
  // 【外部からの入力】【整数を入力】のように【】で囲んで書く入力
  const INPUT_NAMES = ['外部からの入力', '整数を入力', '文字列を入力', '数値を入力'];

  class Interpreter {
    constructor(program, io) {
      io = io || {};
      this.prog = program;
      this.funcs = program.funcs;
      this.out = io.output || (() => {});
      this.input = io.input || (() => null);
      // 配列の添字の開始（問題文で「添字は 1 から始まる」とされる場合は 1）
      this.base = io.base === 1 ? 1 : 0;
      this.globals = new Map();
      this.frames = [];
      this.line = 0;
      this.steps = 0;
    }

    err(msg) { return new DnclError(msg, this.line); }

    // JavaScript 側の例外を DNCL のエラーに変換する
    convertError(e) {
      if (e instanceof DnclError) return e;
      if (e instanceof RangeError) return this.err('関数の呼び出しが深すぎます（再帰が終わらない可能性があります）');
      return this.err('内部エラー：' + (e && e.message));
    }

    newArr(vals, dflt) {
      return new Arr(this.base ? new Array(this.base).concat(vals) : vals, dflt, this.base);
    }

    // kind は「外部からの入力」「整数を入力」「文字列を入力」など
    readInput(kind) {
      kind = kind || '外部からの入力';
      const s = this.input(kind);
      if (s === null || s === undefined) throw this.err('入力がありません');
      const t = String(s).trim();
      const isNum = /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t);
      if (kind === '文字列を入力') return String(s);
      if (kind === '整数を入力') {
        if (!isNum || !Number.isInteger(Number(t))) throw this.err(`整数を入力してください（「${s}」が入力されました）`);
        return Number(t);
      }
      if (kind === '数値を入力') {
        if (!isNum) throw this.err(`数値を入力してください（「${s}」が入力されました）`);
        return Number(t);
      }
      return isNum ? Number(t) : String(s);
    }

    *run() {
      const r = yield* this.execBlock(this.prog.body);
      if (r) throw this.err('関数の外で値を返すことはできません');
    }

    // 変数 --------------------------------------------------------
    frame() { return this.frames[this.frames.length - 1]; }

    tryGet(name) {
      const fr = this.frame();
      if (fr && fr.vars.has(name)) return fr.vars.get(name);
      return this.globals.get(name);
    }

    get(name) {
      if (INPUT_NAMES.includes(name)) return this.readInput(name);
      const v = this.tryGet(name);
      if (v !== undefined) return v;
      if (this.funcs[name] || BUILTINS[name]) {
        throw this.err(`${name} は関数です。${name}( ) のように括弧を付けて呼び出してください`);
      }
      throw this.err(`変数 ${name} にはまだ値が代入されていません`);
    }

    set(name, v) {
      const fr = this.frame();
      // 関数の中では、引数・すでにある局所変数、または大域変数にない名前を局所変数とする
      if (fr && (fr.vars.has(name) || !this.globals.has(name))) fr.vars.set(name, v);
      else this.globals.set(name, v);
    }

    toIndex(v) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= this.base) return v;
      throw this.err(`添字には ${this.base} 以上の整数を使います（${fmt(v)} が指定されました。添字は ${this.base} から始まる設定です）`);
    }

    rootName(e) {
      while (e.k === 'idx') e = e.base;
      return e.k === 'var' ? e.name : '配列';
    }

    *assign(target, value) {
      if (target.k === 'var') {
        this.set(target.name, value);
        return;
      }
      const idxNodes = [];
      let n = target;
      while (n.k === 'idx') { idxNodes.unshift(n.index); n = n.base; }
      const idxs = [];
      for (const e of idxNodes) idxs.push(this.toIndex(yield* this.ev(e)));
      let arr = this.tryGet(n.name);
      if (arr === undefined) {
        arr = this.newArr([]);
        this.set(n.name, arr);
      }
      if (!(arr instanceof Arr)) throw this.err(`${n.name} は配列ではありません（${typeName(arr)}）`);
      for (let i = 0; i < idxs.length - 1; i++) {
        let next = arr.items[idxs[i]];
        if (next === undefined) {
          next = this.newArr([], arr.dflt);
          arr.items[idxs[i]] = next;
        }
        if (!(next instanceof Arr)) throw this.err(`${n.name} の要素は配列ではないので、添字を重ねて使えません`);
        arr = next;
      }
      arr.items[idxs[idxs.length - 1]] = value;
    }

    // 文 ----------------------------------------------------------
    *execBlock(stmts) {
      for (const s of stmts) {
        const r = yield* this.execStmt(s);
        if (r) return r;
      }
      return null;
    }

    *execStmt(s) {
      if (s.type === 'func') return null;
      this.line = s.line;
      this.steps++;
      yield s.line;
      return yield* this.doStmt(s);
    }

    *doStmt(s) {
      switch (s.type) {
        case 'seq':
          for (const c of s.body) {
            const r = yield* this.doStmt(c);
            if (r) return r;
          }
          return null;

        case 'assign': {
          let v = yield* this.ev(s.expr);
          if (v === undefined) throw this.err('代入する値がありません');
          // DNCL では配列の代入は「他の配列の内容に置き換える」（複製する）
          if (this.prog.mode === 'dncl' && v instanceof Arr && s.expr.k !== 'arr') v = copyArr(v);
          yield* this.assign(s.target, v);
          return null;
        }

        case 'incr': {
          const cur = yield* this.ev(s.target);
          const d = yield* this.ev(s.expr);
          if (typeof cur !== 'number' || typeof d !== 'number') throw this.err('増やす・減らす は数値に対して使います');
          yield* this.assign(s.target, cur + s.sign * d);
          return null;
        }

        case 'fill': {
          const v = yield* this.ev(s.expr);
          let a = this.tryGet(s.name);
          if (a === undefined) {
            this.set(s.name, this.newArr([], v));
          } else if (a instanceof Arr) {
            fillDeep(a, v);
          } else {
            throw this.err(`${s.name} は配列ではありません`);
          }
          return null;
        }

        case 'push': {
          const v = yield* this.ev(s.expr);
          let a = this.tryGet(s.name);
          if (a === undefined) {
            a = this.newArr([]);
            this.set(s.name, a);
          }
          if (!(a instanceof Arr)) throw this.err(`${s.name} は配列ではありません`);
          if (a.items.length < a.base) a.items.length = a.base;
          a.items.push(v);
          return null;
        }

        case 'print': {
          const vals = [];
          for (const e of s.items) vals.push(yield* this.ev(e));
          this.out(vals.map(fmt).join('') + (s.nl ? '\n' : ''));
          return null;
        }

        case 'call':
          yield* this.call(s.expr, true);
          return null;

        case 'return': {
          if (!this.frame()) throw this.err('関数の外で値を返すことはできません');
          return { ret: yield* this.ev(s.expr) };
        }

        case 'if': {
          for (let i = 0; i < s.branches.length; i++) {
            const b = s.branches[i];
            if (i > 0) {
              this.line = b.line;
              yield b.line;
            }
            if (this.truth(yield* this.ev(b.cond))) return yield* this.execBlock(b.body);
          }
          if (s.elseBody) return yield* this.execBlock(s.elseBody);
          return null;
        }

        case 'while': {
          for (let first = true; ; first = false) {
            if (!first) {
              this.line = s.line;
              yield s.line;
            }
            if (!this.truth(yield* this.ev(s.cond))) return null;
            const r = yield* this.execBlock(s.body);
            if (r) return r;
          }
        }

        case 'until': {
          for (;;) {
            const r = yield* this.execBlock(s.body);
            if (r) return r;
            this.line = s.condLine;
            yield s.condLine;
            if (this.truth(yield* this.ev(s.cond))) return null;
          }
        }

        case 'for': {
          const from = yield* this.ev(s.from);
          const to = yield* this.ev(s.to);
          const step = yield* this.ev(s.step);
          for (const [v, what] of [[from, '開始値'], [to, '終了値'], [step, '増分']]) {
            if (typeof v !== 'number') throw this.err(`繰り返しの${what}が数値ではありません`);
          }
          if (step <= 0) throw this.err('「〜ずつ増やしながら（減らしながら）」の値は正の数にしてください');
          this.set(s.name, from);
          for (let first = true; ; first = false) {
            if (!first) {
              this.line = s.line;
              yield s.line;
              const cur = this.get(s.name);
              if (typeof cur !== 'number') throw this.err(`繰り返しの変数 ${s.name} が数値ではなくなりました`);
              this.set(s.name, cur + s.dir * step);
            }
            const cur = this.get(s.name);
            if (s.dir > 0 ? cur > to : cur < to) return null;
            const r = yield* this.execBlock(s.body);
            if (r) return r;
          }
        }

        default:
          throw this.err('内部エラー：不明な文 ' + s.type);
      }
    }

    truth(v) {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v !== 0;
      throw this.err(`条件の値が真偽になりません（${typeName(v)}）`);
    }

    // 式 ----------------------------------------------------------
    *ev(e) {
      switch (e.k) {
        case 'num':
        case 'str':
          return e.v;
        case 'var':
          return this.get(e.name);
        case 'arr': {
          const items = [];
          for (const x of e.items) items.push(yield* this.ev(x));
          return this.newArr(items);
        }
        case 'idx': {
          const base = yield* this.ev(e.base);
          const i = this.toIndex(yield* this.ev(e.index));
          const name = this.rootName(e.base);
          if (typeof base === 'string') {
            const chars = Array.from(base);
            if (i - this.base >= chars.length) throw this.err(`添字 ${i} は文字列の範囲外です（文字数は ${chars.length}）`);
            return chars[i - this.base];
          }
          if (!(base instanceof Arr)) throw this.err(`${name} は配列ではないので [ ] で要素を取り出せません`);
          const v = base.items[i];
          if (v !== undefined) return v;
          if (base.dflt !== undefined) return base.dflt;
          if (i >= base.items.length) {
            const last = base.base + base.size - 1;
            throw this.err(`添字 ${i} は範囲外です（${name} の要素数は ${base.size}、添字は ${base.base}〜${last}）`);
          }
          throw this.err(`${name} の添字 ${i} の要素にはまだ値が代入されていません`);
        }
        case 'call': {
          const v = yield* this.call(e, false);
          return v;
        }
        case 'neg': {
          const v = yield* this.ev(e.e);
          if (typeof v !== 'number') throw this.err(`${typeName(v)}に「-」は付けられません`);
          return -v;
        }
        case 'not':
          return !this.truth(yield* this.ev(e.e));
        case 'and':
          return this.truth(yield* this.ev(e.l)) ? this.truth(yield* this.ev(e.r)) : false;
        case 'or':
          return this.truth(yield* this.ev(e.l)) ? true : this.truth(yield* this.ev(e.r));
        case 'bin': {
          const a = yield* this.ev(e.l);
          const b = yield* this.ev(e.r);
          return this.binop(e.op, a, b);
        }
        default:
          throw this.err('内部エラー：不明な式');
      }
    }

    binop(op, a, b) {
      if (op === '==') return eq(a, b);
      if (op === '!=') return !eq(a, b);
      if (op === '+') {
        if (typeof a === 'string' || typeof b === 'string') return fmt(a) + fmt(b);
        if (a instanceof Arr && b instanceof Arr) return new Arr(a.items.concat(b.items.slice(b.base)), undefined, a.base);
      }
      if (['<', '>', '<=', '>='].includes(op)) {
        if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) {
          throw this.err(`${typeName(a)}と${typeName(b)}は大小を比較できません`);
        }
        switch (op) {
          case '<': return a < b;
          case '>': return a > b;
          case '<=': return a <= b;
          default: return a >= b;
        }
      }
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw this.err(`${typeName(a)}と${typeName(b)}で「${op}」の計算はできません`);
      }
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/':
          if (b === 0) throw this.err('0 で割ることはできません');
          return a / b;
        case '÷':
          if (b === 0) throw this.err('0 で割ることはできません');
          return Math.floor(a / b);
        case '%':
          if (b === 0) throw this.err('0 で割った余りは求められません');
          return a - b * Math.floor(a / b);
        case '**': {
          const r = Math.pow(a, b);
          if (Number.isNaN(r)) throw this.err('べき乗を計算できません');
          return r;
        }
        default:
          throw this.err('内部エラー：不明な演算子 ' + op);
      }
    }

    *call(e, asStatement) {
      const args = [];
      for (const a of e.args) args.push(yield* this.ev(a));
      const user = this.funcs[e.name];
      if (user) {
        if (args.length !== user.params.length) {
          throw this.err(`関数 ${e.name} の引数は ${user.params.length} 個です（${args.length} 個渡されました）`);
        }
        if (this.frames.length >= MAX_DEPTH) {
          throw this.err('関数の呼び出しが深すぎます（再帰が終わらない可能性があります）');
        }
        const vars = new Map();
        user.params.forEach((p, i) => vars.set(p, args[i]));
        const saved = this.line;
        this.frames.push({ name: e.name, vars });
        const r = yield* this.execBlock(user.body);
        this.frames.pop();
        this.line = saved;
        if (!r && !asStatement) throw this.err(`関数 ${e.name} は値を返しませんでした`);
        return r ? r.ret : undefined;
      }
      const b = BUILTINS[e.name];
      if (!b) throw this.err(`関数「${e.name}」は定義されていません`);
      if (b.n !== undefined && args.length !== b.n) {
        throw this.err(`${e.name} の引数は ${b.n} 個です（${args.length} 個渡されました）`);
      }
      if (b.proc && !asStatement) throw this.err(`${e.name} は値を返さないので式の中では使えません`);
      return b.fn(args, this);
    }

    // 変数表示用 ---------------------------------------------------
    snapshot() {
      const conv = m => Array.from(m.entries()).map(([name, v]) => ({
        name,
        type: typeName(v),
        value: v instanceof Arr ? fmtArr(v, 200) : (typeof v === 'string' ? '"' + v + '"' : fmt(v)),
      }));
      const fr = this.frame();
      return {
        globals: conv(this.globals),
        local: fr ? { name: fr.name, vars: conv(fr.vars) } : null,
        callStack: this.frames.map(f => f.name),
      };
    }
  }

  function eq(a, b) {
    if (a instanceof Arr && b instanceof Arr) {
      if (a.size !== b.size) return false;
      for (let i = 0; i < a.size; i++) {
        if (!eq(a.items[a.base + i], b.items[b.base + i])) return false;
      }
      return true;
    }
    return a === b;
  }

  function copyArr(a) {
    return new Arr(a.items.map(x => (x instanceof Arr ? copyArr(x) : x)), a.dflt, a.base);
  }

  function fillDeep(a, v) {
    a.dflt = v;
    for (let i = a.base; i < a.items.length; i++) {
      if (a.items[i] instanceof Arr) fillDeep(a.items[i], v);
      else a.items[i] = v;
    }
  }

  // 全部まとめて実行する（テストや Node.js 用）
  function runAll(src, mode, opts) {
    opts = opts || {};
    let output = '';
    const inputs = (opts.inputs || []).slice();
    const prog = parse(src, mode);
    const it = new Interpreter(prog, {
      output: s => { output += s; },
      input: () => (inputs.length ? inputs.shift() : null),
      base: opts.base,
    });
    const max = opts.maxSteps || 1e7;
    const gen = it.run();
    for (let n = 0; ; n++) {
      if (n > max) throw new DnclError('実行ステップ数の上限を超えました', it.line);
      let r;
      try {
        r = gen.next();
      } catch (e) {
        throw it.convertError(e);
      }
      if (r.done) break;
    }
    return { output, interpreter: it };
  }

  const API = {
    DnclError,
    Interpreter,
    parse,
    runAll,
    BUILTINS: Object.keys(BUILTINS),
    _internal: { preprocess, tokenize },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.DNCL = API;
})(typeof window !== 'undefined' ? window : this);
