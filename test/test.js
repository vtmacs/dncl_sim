// node test/test.js で実行する
'use strict';
const assert = require('assert');
const DNCL = require('../js/dncl.js');
const SAMPLES = require('../js/samples.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.log('NG: ' + name);
    console.log('    ' + (e && e.message));
  }
}

function run(src, mode, inputs) {
  return DNCL.runAll(Array.isArray(src) ? src.join('\n') : src, mode, { inputs }).output;
}

function expectError(src, mode, pattern, line) {
  try {
    run(src, mode);
  } catch (e) {
    assert.ok(e instanceof DNCL.DnclError, '想定外の例外: ' + e.stack);
    if (pattern) assert.match(e.message, pattern);
    if (line !== undefined) assert.strictEqual(e.line, line);
    return;
  }
  assert.fail('エラーになりませんでした');
}

// ---- サンプル ----
for (const mode of Object.keys(SAMPLES)) {
  for (const s of SAMPLES[mode]) {
    test(`sample ${mode}/${s.id}`, () => {
      const out = run(s.code, mode, s.inputs);
      if (s.expected !== undefined) assert.strictEqual(out, s.expected);
    });
  }
}

// ---- DNCL2 ----
test('算術演算', () => {
  assert.strictEqual(run('表示する(7 / 2, " ", 7 ÷ 2, " ", 7 % 2, " ", 2 ** 10, " ", -7 ÷ 2, " ", -7 % 2)', 'dncl2'),
    '3.5 3 1 1024 -4 1\n');
});
test('演算の優先順位', () => {
  assert.strictEqual(run('表示する(1 + 2 * 3, " ", (1 + 2) * 3, " ", -2 ** 2, " ", 2 ** 3 ** 2)', 'dncl2'),
    '7 9 -4 512\n');
});
test('小数の表示', () => {
  assert.strictEqual(run('表示する(0.1 + 0.2)', 'dncl2'), '0.3\n');
});
test('論理演算', () => {
  assert.strictEqual(run([
    'a = 3',
    'もし a > 1 and not a == 5 ならば 表示する("A")',
    'もし a < 1 or a == 3 ならば 表示する("B")',
  ], 'dncl2'), 'A\nB\n');
});
test('全角記号・全角数字', () => {
  assert.strictEqual(run('ｘ ＝ ３ ＊ ４，y ＝ ｘ ＋ １\n表示する（y）', 'dncl2'), '13\n');
});
test('字下げ（空白）でもブロックになる', () => {
  assert.strictEqual(run([
    'i を 1 から 3 まで 1 ずつ増やしながら繰り返す:',
    '    もし i == 2 ならば:',
    '        表示する("two")',
    '    そうでなければ:',
    '        表示する(i)',
    '表示する("end")',
  ], 'dncl2'), '1\ntwo\n3\nend\n');
});
test('入れ子の if で else が外側に付く', () => {
  assert.strictEqual(run([
    'x = 5',
    'もし x > 10 ならば:',
    '│ もし x > 20 ならば:',
    '⎿ ⎿ 表示する("big")',
    'そうでなければ:',
    '⎿ 表示する("small")',
  ], 'dncl2'), 'small\n');
});
test('減らしながら繰り返す', () => {
  assert.strictEqual(run([
    'i を 10 から 1 まで 3 ずつ減らしながら繰り返す:',
    '⎿ 改行なしで表示する(i, ",")',
  ], 'dncl2'), '10,7,4,1,');
});
test('後判定の繰り返し', () => {
  assert.strictEqual(run([
    'x = 0',
    '繰り返す:',
    '⎿ x = x + 3',
    'x > 10 になるまで繰り返す',
    '表示する(x)',
  ], 'dncl2'), '12\n');
});
test('文字列の連結と添字', () => {
  assert.strictEqual(run('s = "情報" + "Ⅰ" + 1\n表示する(s, s[0], 要素数(s))', 'dncl2'), '情報Ⅰ1情4\n');
});
test('配列の参照渡しと末尾追加', () => {
  assert.strictEqual(run([
    'A = [1, 2]',
    'A の末尾に 3 を追加する',
    '関数 nibai(X):',
    '│ i を 0 から 要素数(X) - 1 まで 1 ずつ増やしながら繰り返す:',
    '⎿ ⎿ X[i] = X[i] * 2',
    'nibai(A)',
    '表示する(A)',
  ], 'dncl2'), '[2, 4, 6]\n');
});
test('関数内で大域変数を更新できる', () => {
  assert.strictEqual(run([
    'kaisu = 0',
    '関数 count():',
    '⎿ kaisu = kaisu + 1',
    'count()',
    'count()',
    '表示する(kaisu)',
  ], 'dncl2'), '2\n');
});
test('関数の局所変数は外に漏れない', () => {
  expectError([
    '関数 f(a):',
    '│ t = a * 2',
    '⎿ t を返す',
    '表示する(f(3))',
    '表示する(t)',
  ], 'dncl2', /t にはまだ値が代入されていません/, 5);
});
test('二次元配列の初期化', () => {
  assert.strictEqual(run('M = [[1, 2], [3, 4]]\n表示する(M[1][0] + M[0, 1])', 'dncl2'), '5\n');
});
test('二進で表示する', () => {
  assert.strictEqual(run('二進で表示する(10)', 'dncl2'), '1010\n');
});
test('外部からの入力', () => {
  assert.strictEqual(run('x = 外部からの入力\n表示する(x * 2)', 'dncl2', ['21']), '42\n');
});
test('コメント', () => {
  assert.strictEqual(run('# コメント\nx = 1 # 行末コメント\n表示する("#ではない", x)', 'dncl2'), '#ではない1\n');
});
test('「」の文字列', () => {
  assert.strictEqual(run('表示する(「こんにちは」)', 'dncl2'), 'こんにちは\n');
});

// ---- DNCL2 のエラー ----
test('エラー: 範囲外の添字', () => {
  expectError('A = [1, 2, 3]\n表示する(A[3])', 'dncl2', /範囲外/, 2);
});
test('エラー: 未定義変数', () => {
  expectError('表示する(x)', 'dncl2', /x にはまだ値が代入されていません/, 1);
});
test('エラー: 0 で割る', () => {
  expectError('x = 0\ny = 3 / x', 'dncl2', /0 で割る/, 2);
});
test('エラー: = を比較に使う', () => {
  expectError('もし x = 1 ならば:\n⎿ 表示する(1)', 'dncl2', /==/, 1);
});
test('エラー: 字下げなし', () => {
  expectError('もし 1 == 1 ならば:\n表示する(1)', 'dncl2', /中身がありません/, 1);
});
test('エラー: 対応しない そうでなければ', () => {
  expectError('そうでなければ:\n⎿ x = 1', 'dncl2', /対応する「もし」/, 1);
});
test('エラー: 閉じていない文字列', () => {
  expectError('表示する("abc)', 'dncl2', /文字列の終わり/, 1);
});
test('エラー: 未定義関数', () => {
  expectError('x = foo(1)', 'dncl2', /定義されていません/, 1);
});
test('エラー: 無限再帰', () => {
  expectError('関数 f(n):\n⎿ f(n + 1) を返す\nx = f(0)', 'dncl2', /深すぎ/);
});

// ---- DNCL ----
test('DNCL: 比較と論理', () => {
  assert.strictEqual(run([
    'x ← 5',
    'もし x ＝ 5 かつ x ≠ 3 ならば "OK1" を表示する を実行する',
    'もし x ≦ 4 または x ≧ 5 ならば "OK2" を表示する を実行する',
    'もし x ＞ 3 ならば "OK3" を表示する を実行し，そうでなければ "NG" を表示する を実行する',
  ], 'dncl'), 'OK1\nOK2\nOK3\n');
});
test('DNCL: 1行の繰り返し', () => {
  assert.strictEqual(run([
    's ← 0',
    'i を 1 から 10 まで 1 ずつ増やしながら，s ← s ＋ i を繰り返す',
    'x ← 1',
    'x ＜ 100 の間，x ← x × 2 を繰り返す',
    's と " " と x を表示する',
  ], 'dncl'), '55 128\n');
});
test('DNCL: 外部からの入力', () => {
  assert.strictEqual(run('x ← 【外部からの入力】\nx × 2 を表示する', 'dncl', ['8']), '16\n');
});
test('DNCL: 「=」での代入はエラー', () => {
  expectError('x = 1', 'dncl', /←/, 1);
});
test('DNCL: 終わりがない', () => {
  expectError('x ← 0\nx ＜ 3 の間，\n｜ x ← x ＋ 1', 'dncl', /を繰り返す/, 2);
});
test('DNCL: 関数（拡張）', () => {
  assert.strictEqual(run([
    '関数 nijou(x) を',
    '｜ x × x を返す',
    'と定義する',
    'nijou(12) を表示する',
  ], 'dncl'), '144\n');
});
test('DNCL: 後判定の1行形式', () => {
  assert.strictEqual(run('x ← 1\n繰り返し，x ← x × 3 を，x ＞ 50 になるまで実行する\nx を表示する', 'dncl'), '81\n');
});

test('DNCL: 改行を表示する', () => {
  assert.strictEqual(run('"a" を改行なしで表示する\n改行を表示する\n"b" を表示する', 'dncl'), 'a\nb\n');
});

// ---- ステップ実行 ----
test('ステップ実行で行番号が順に返る', () => {
  const prog = DNCL.parse('x = 1\nもし x == 1 ならば:\n⎿ x = 2\n表示する(x)', 'dncl2');
  const it = new DNCL.Interpreter(prog, {});
  const lines = [];
  for (const l of it.run()) lines.push(l);
  assert.deepStrictEqual(lines, [1, 2, 3, 4]);
});

console.log(`\n${passed} 件成功, ${failed} 件失敗`);
process.exit(failed ? 1 : 0);
