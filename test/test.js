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


// ---- 公式資料の例（共通テスト用プログラム表記の例示） ----
const BINARY_SEARCH = [
  '( 1 ) Data=[3,18,29,33,48,52,62,77,89,97]',
  '( 2 ) kazu=要素数(Data)',
  '( 3 ) 表示する("0～99の数字を入力してください")',
  '( 4 ) atai=【外部からの入力】',
  '( 5 ) hidari=0 , migi=kazu-1',
  '( 6 ) owari=0',
  '( 7 ) hidari <= migi and owari==0 の間繰り返す:',
  '( 8 ) ｜aida=(hidari+migi)÷2 #演算子÷は商の整数値を返す',
  '( 9 ) ｜もしData[aida]==atai ならば:',
  '(10) ｜｜表示する(atai,"は",aida,"番目にありました")',
  '(11) ｜｜owari=1',
  '(12) ｜そうでなくもしData[aida]<atai ならば:',
  '(13) ｜｜hidari=aida+1',
  '(14) ｜そうでなければ:',
  '(15) ⎿⎿migi=aida-1',
  '(16) もしowari==0 ならば:',
  '(17) ⎿表示する(atai,"は見つかりませんでした")',
  '(18) 表示する("添字"," ","要素")',
  '(19) iを0からkazu-1まで1ずつ増やしながら繰り返す:',
  '(20) ⎿表示する(i," ",Data[i])',
];
test('公式: 二分探索（見つかる）', () => {
  const out = run(BINARY_SEARCH, 'dncl2', ['52']);
  assert.ok(out.startsWith('0～99の数字を入力してください\n52は5番目にありました\n添字 要素\n0 3\n'), out);
  assert.ok(out.endsWith('9 97\n'));
});
test('公式: 二分探索（見つからない）', () => {
  assert.match(run(BINARY_SEARCH, 'dncl2', ['85']), /85は見つかりませんでした/);
});
test('公式: DNCL2 の表記例', () => {
  assert.strictEqual(run([
    'moji = "I\'ll be back."',
    'message = "祇園精舎の" + "鐘の声"',
    'kosu = 3 , kingaku = 300',
    'kingaku_goukei = kingaku * kosu',
    'Data = [10,20,30,40,50,60]',
    'Tokutenのすべての値を0にする',
    'x = 2',
    'もしx < 3 ならば:',
    '｜x = x + 1',
    '⎿y = 1',
    'そうでなくもしx < 0 ならば:',
    '⎿x = x * 2',
    'そうでなければ:',
    '⎿y = y * 2',
    'x を0 から9 まで1 ずつ増やしながら繰り返す:',
    '⎿kingaku_goukei = kingaku_goukei + Data[x % 6]',
    'n = 7',
    'n < 10 の間繰り返す:',
    '｜kingaku_goukei = kingaku_goukei + n',
    '⎿n = n + 1',
    'atai = 乱数()    #0以上1未満のランダムな小数をataiに代入する',
    '表示する(moji, message, Tokuten[5], " ", x, y, " ", kingaku_goukei, " ", 要素数(Data))',
    '表示する(Data[2], "の得点は", x - 1, "です")',
  ], 'dncl2'), "I'll be back.祇園精舎の鐘の声0 101 1234 6\n30の得点は9です\n");
});

// ---- 公式資料の例（共通テスト手順記述標準言語 DNCL の説明） ----
test('公式: DNCL 表示文', () => {
  assert.strictEqual(run([
    '「整いました」を表示する',
    'kosu ←3',
    'kosu と「個見つかった」を表示する',
    'x ←5，y ←−1',
    '"(" とx と"，" とy と")" を表示する',
  ], 'dncl'), '整いました\n3個見つかった\n(5，-1)\n');
});
test('公式: DNCL 代入文・算術演算', () => {
  assert.strictEqual(run([
    'Tokuten のすべての要素に0 を代入する',
    'Tokuten[4] ←100',
    'kosu ←3',
    'kosu_gokei ←kosu，tokuten ←kosu×(kosu＋1)',
    'kosu を1 増やす',
    'saihu ←1000，syuppi ←300',
    'saihu をsyuppi 減らす',
    'atai ←7 / 2',
    'syo ←7÷ 2',
    'amari ←10％3',
    'Tokuten[4] と " " と Tokuten[0] と " " と kosu_gokei と " " と tokuten と " " と kosu と " " と saihu を表示する',
    'atai と " " と syo と " " と amari を表示する',
    'kazu ←7',
    '1＋kazu÷ 3 と " " と (6＋9)÷ 2 と " " と 6＋9÷ 2 を表示する',
  ], 'dncl'), '100 0 3 12 4 700\n3.5 3 1\n3 7 10\n');
});
test('公式: DNCL 比較演算（文字列）', () => {
  assert.strictEqual(run([
    'もし「あいうえお」＝「あいうえお」ならば "真" を表示する を実行する',
    'もし「あいうえお」＝「あいう」ならば "誤" を表示する を実行する',
    'もし"ABC"≠"abc" ならば "真" を表示する を実行する',
  ], 'dncl'), '真\n真\n');
});
test('公式: DNCL 論理演算は左から順に計算する', () => {
  // kosu ＞12 かつkosu ＜27 でない は (kosu ＞12 かつkosu ＜27) でない と同じ
  const prog = k => [
    `kosu ←${k}`,
    'もしkosu ＞12 かつkosu ＜27 でない ならば "A" を表示する を実行する',
    'もしkosu ＞12 かつ(kosu ＜27 でない) ならば "B" を表示する を実行する',
    'もしkosu ≧12 かつkosu ≦27 ならば "C" を表示する を実行する',
    'もしkosu％2 ＝0 またはkosu ＜0 ならば "D" を表示する を実行する',
    'もしkosu ＞75 でない ならば "E" を表示する を実行する',
  ];
  assert.strictEqual(run(prog(5), 'dncl'), 'A\nE\n');
  assert.strictEqual(run(prog(20), 'dncl'), 'C\nD\nE\n');
  assert.strictEqual(run(prog(30), 'dncl'), 'A\nB\nD\nE\n');
});
test('公式: DNCL 条件分岐（複数行・1行・改行して続ける形）', () => {
  const src = x => [
    `x ←${x}，y ←5`,
    'もしx ＝3 ならば',
    '｜x ←x＋1',
    'を実行し，そうでなくもしy ＞2 ならば',
    '｜y ←y＋1',
    'を実行し，そうでなければ',
    '｜y ←y－1',
    'を実行する',
    'もしx ＜3 ならばx ←x＋1 を実行し，',
    'そうでなければx ←x－1 を実行する',
    'もしx ＝3 ならばx ←x＋1 を実行し，',
    'そうでなくもしy ＞2 ならばy ←y＋1 を実行し，',
    'そうでなければy ←y－1 を実行する',
    'もしx ＜3 ならばx ←x＋1 を実行する',
    'x と "," と y を表示する',
  ];
  assert.strictEqual(run(src(3), 'dncl'), '4,5\n');
  assert.strictEqual(run(src(1), 'dncl'), '3,7\n');
});
test('公式: DNCL 繰返し文', () => {
  assert.strictEqual(run([
    'x ←1，gokei ←0',
    'x ＜10 の間，',
    '｜gokei ←gokei＋x',
    '｜x ←x＋1',
    'を繰り返す',
    '繰り返し，',
    '｜gokei ←gokei＋x',
    '｜x ←x＋1',
    'を，x ≧10 になるまで実行する',
    'x を1 から10 まで1 ずつ増やしながら，',
    '｜gokei ←gokei＋x',
    'を繰り返す',
    'x を10 から1 まで1 ずつ減らしながら，',
    '｜gokei ←gokei＋x',
    'を繰り返す',
    'gokei と " " と x を表示する',
  ], 'dncl'), '165 0\n');
});
test('公式: DNCL 関数の定義', () => {
  assert.strictEqual(run([
    '関数和を表示する(n) を',
    '｜wa ←0',
    '｜i を1 からn まで1 ずつ増やしながら，',
    '｜｜wa ←wa＋i',
    '｜を繰り返す',
    '｜wa を表示する',
    'と定義する',
    '関数べき乗を表示する(m，n) を',
    '｜p ←1',
    '｜i を1 からn まで1 ずつ増やしながら，',
    '｜｜p ←p× m',
    '｜を繰り返す',
    '｜p を表示する',
    'と定義する',
    '和を表示する(10)',
    'べき乗を表示する(2，10)',
    '二進で表示する(11)',
    'y ←二乗(3)，z ←二乗(3) ＋べき乗(3，2)',
    'r ←乱数(1，6)',
    'y と " " と z を表示する',
    'もし r ≧ 1 かつ r ≦ 6 かつ 奇数(3) かつ 奇数(4) でない ならば "OK" を表示する を実行する',
  ], 'dncl'), '55\n1024\n1011\n9 18\nOK\n');
});
test('DNCL: 配列の代入は内容の複製', () => {
  assert.strictEqual(run('A ←{1, 2}\nB ←A\nB[0] ←9\nA と B を表示する', 'dncl'), '[1, 2][9, 2]\n');
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
