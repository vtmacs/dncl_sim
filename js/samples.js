/* サンプルプログラム（シミュレーターとテストで共通に使う） */
(function (global) {
  'use strict';

  // DNCL2 のサンプルは試験問題と同じ形（行番号「(01)」、縦線「｜」「⎿」）で書く。
  //   '(01)' などの行番号は自動で付ける
  //   '+ ' で始まる行 … 前の行の続き（試験問題と同じく行番号を付けない）
  //   '! ' で始まる行 … 問題の図の外にある準備の行（行番号を付けない）
  //   '#' で始まる行  … コメント（行番号を付けない）
  function numbered(lines) {
    let n = 0;
    return lines.map(l => {
      if (l.startsWith('+ ')) return '     ' + l.slice(2);
      if (l.startsWith('! ')) return l.slice(2);
      if (l.startsWith('#')) return l;
      n++;
      return '(' + String(n).padStart(2, '0') + ') ' + l;
    });
  }

  // 問題文で省略されているデータを補うための、毎回同じ値になる乱数列
  function seq(seed, count, f) {
    let x = seed;
    const out = [];
    for (let i = 0; i < count; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      out.push(f(x / 2147483648));
    }
    return out;
  }

  // 長い配列を折り返して書く。prefix は 1 行目の先頭（例: 'Bunya = '）
  function arrayLines(prefix, values, perLine, cont) {
    const rows = [];
    for (let i = 0; i < values.length; i += perLine) rows.push(values.slice(i, i + perLine).join(', '));
    return rows.map((r, i) => {
      const head = i === 0 ? prefix + '[' : cont;
      const tail = i === rows.length - 1 ? ']' : ',';
      return head + r + tail;
    });
  }

  // 問題の図の外で用意する配列（行番号を付けない準備の行）
  function rawArray(name, values) {
    const head = name + ' = ';
    return arrayLines(head, values, 10, ' '.repeat(head.length + 1)).map(l => '! ' + l);
  }

  // ---- 令和7年度 本試験 第3問のデータ（出席番号 1〜5 と 40 は問題の図の値） ----
  const R7_N = 40;
  const r7Iremono = [2, 1, 1, 1, 2].concat(seq(7, R7_N - 6, r => (r < 0.5 ? 1 : 2)), [2]);
  const r7Shurui2 = [1, 2, 2, 1, 1].concat(seq(11, R7_N - 6, r => (r < 0.6 ? 1 : 2)), [2]);
  const r7Shurui7 = [1, 2, 2, 1, 1].concat(seq(13, R7_N - 6, r => 1 + Math.floor(r * 7)), [2]);
  const r7Keiryou = [112, 1224, 717, 1206, 303].concat(
    seq(17, R7_N - 6, r => 100 + Math.floor(r * 1100)).map((w, i) => (r7Iremono[5 + i] === 1 ? w + 350 : w)),
    [401]);
  const r7Data = shurui => [
    '# ―― 問題の図3にあたる配列（出席番号 6〜39 の値はシミュレーター用の仮の値）――',
    ...rawArray('Iremono', r7Iremono),
    ...rawArray('Shurui', shurui),
    ...rawArray('Keiryou', r7Keiryou),
    '# ―― ここから問題のプログラム ――',
  ];

  // ---- 令和8年度 本試験 第3問のデータ（番号 0〜6 と 192 は問題の図の値） ----
  const r8Bunya = [2, 0, 2, 2, 1, 2, 0].concat(seq(5, 185, r => Math.floor(r * 6)), [5]);
  const r8Data = () => [
    '# 「……」で省略されている番号 7〜191 の分野はシミュレーター用の仮の値',
    ...arrayLines('Bunya = ', r8Bunya, 16, '+         ').map((l, i) => (i === 0 ? l : '+ ' + l.slice(2))),
    'saidai = 5',
    ...arrayLines('Saiyou = ', new Array(193).fill(0), 24, '+          ').map((l, i) => (i === 0 ? l : '+ ' + l.slice(2))),
  ];

  const R7_NAMAE = [
    'Namae = ["可燃ごみ", "不燃ごみ", "ペットボトル",',
    '+          "かん", "びん", "金属", "落ち葉"]',
  ];

  const SAMPLES = {
    dncl2: [
      // ---------------- 共通テスト「情報Ⅰ」の過去問 ----------------
      {
        id: 'r7h-1',
        group: 'exam',
        title: '令和7年度 本試験 第3問 問1 図2（ごみ拾いの結果を入力）',
        note: '令和7年度 本試験「情報Ⅰ」第3問 問1 図2。空欄 ア・イ に正解を入れています。添字は 1 から始まります。入力欄の値（出席番号・入れ物・種類・重量）を変えて試せます。',
        base: 1,
        inputs: ['3', '1', '2', '717'],
        code: numbered([
          '表示する("生徒の出席番号は？")',
          'n =【整数を入力】',
          '表示する("ごみの入れ物は？ バケツ:1 ごみ袋:2")',
          'Iremono[n] =【整数を入力】',
          '表示する("ごみの種類は？ 可燃ごみ:1 不燃ごみ:2")',
          'Shurui[n] =【整数を入力】',
          '表示する("計量結果（g）は？")',
          'Keiryou[n] =【整数を入力】',
        ]),
      },
      {
        id: 'r7h-2',
        group: 'exam',
        title: '令和7年度 本試験 第3問 問2 図4（ごみの種類ごとの総重量）',
        note: '令和7年度 本試験「情報Ⅰ」第3問 問2 図4。空欄 ウ〜キ に正解を入れています。添字は 1 から始まります。',
        base: 1,
        code: numbered([
          ...r7Data(r7Shurui2),
          'ninzu = 40',
          'kanen = 0, funen = 0',
          'i を 1 から ninzu まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Iremono[i] == 1 ならば:',
          '｜ ｜ gomi = Keiryou[i] - 350',
          '｜ そうでなければ:',
          '｜ ⎿ gomi = Keiryou[i]',
          '｜ もし Shurui[i] == 1 ならば:',
          '｜ ｜ kanen = kanen + gomi',
          '｜ そうでなければ:',
          '⎿ ⎿ funen = funen + gomi',
          '表示する("可燃ごみの総重量は", kanen, "g")',
          '表示する("不燃ごみの総重量は", funen, "g")',
        ]),
      },
      {
        id: 'r7h-3a',
        group: 'exam',
        title: '令和7年度 本試験 第3問 問3 図5（ごみの種類を名称で入力）',
        note: '令和7年度 本試験「情報Ⅰ」第3問 問3 図5。空欄 ア・ク・ケ に正解を入れています。添字は 1 から始まります。出席番号 n は問1の図2で入力された値の代わりに 3 としています。',
        base: 1,
        inputs: ['ペットボトル'],
        code: numbered([
          '# ―― 問1の図2で入力された出席番号の代わり ――',
          '! n = 3',
          '# ―― ここから問題のプログラム ――',
          ...R7_NAMAE,
          'shuruisu = 7',
          '表示する("ごみの種類の名称は？")',
          'meishou =【文字列を入力】',
          'j を 1 から shuruisu まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Namae[j] == meishou ならば:',
          '⎿ ⎿ Shurui[n] = j',
        ]),
      },
      {
        id: 'r7h-3b',
        group: 'exam',
        title: '令和7年度 本試験 第3問 問3 図6（種類ごとの総重量を名称つきで表示）',
        note: '令和7年度 本試験「情報Ⅰ」第3問 問3 図6。空欄 ウ・エ・ク・コ〜ス に正解を入れています。添字は 1 から始まります。',
        base: 1,
        code: numbered([
          ...r7Data(r7Shurui7),
          'ninzu = 40',
          ...R7_NAMAE,
          'shuruisu = 7',
          'Goukei = [0, 0, 0, 0, 0, 0, 0]',
          'i を 1 から ninzu まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Iremono[i] == 1 ならば:',
          '｜ ｜ gomi = Keiryou[i] - 350',
          '｜ そうでなければ:',
          '｜ ⎿ gomi = Keiryou[i]',
          '｜ s = Shurui[i]',
          '⎿ Goukei[s] = Goukei[s] + gomi',
          'j を 1 から shuruisu まで 1 ずつ増やしながら繰り返す:',
          '⎿ 表示する(Namae[j], "の総重量は", Goukei[j], "g")',
        ]),
      },
      {
        id: 'r7t-2',
        group: 'exam',
        title: '令和7年度 追試験 第3問 問2 図4（次の工芸品の担当部員）',
        note: '令和7年度 追試験「情報Ⅰ」第3問 問2 図4。空欄 カ・キ に正解を入れています。添字は 1 から始まります。(01)・(02) 行目を Akibi = [5, 6, 4, 4, 4]、buinsu = 5 に変えると問2の後半を確かめられます。',
        base: 1,
        expected: '次の工芸品の担当は部員2です。\n',
        code: numbered([
          'Akibi = [5, 3, 4]',
          'buinsu = 3',
          'tantou = 1',
          'buin を 2 から buinsu まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Akibi[buin] < Akibi[tantou] ならば:',
          '⎿ ⎿ tantou = buin',
          '表示する("次の工芸品の担当は部員", tantou, "です。")',
        ]),
      },
      {
        id: 'r7t-3',
        group: 'exam',
        title: '令和7年度 追試験 第3問 問3 図5（工芸品の担当と期間の一覧）',
        note: '令和7年度 追試験「情報Ⅰ」第3問 問3 図5。空欄 キ・ケ〜シ に正解を入れています。添字は 1 から始まります。',
        base: 1,
        expected: [
          '工芸品1 … 部員1：1日目～4日目',
          '工芸品2 … 部員2：1日目～1日目',
          '工芸品3 … 部員3：1日目～3日目',
          '工芸品4 … 部員2：2日目～2日目',
          '工芸品5 … 部員2：3日目～5日目',
          '工芸品6 … 部員3：4日目～7日目',
          '工芸品7 … 部員1：5日目～6日目',
          '工芸品8 … 部員2：6日目～9日目',
          '工芸品9 … 部員1：7日目～9日目',
          '',
        ].join('\n'),
        code: numbered([
          'Nissu = [4, 1, 3, 1, 3, 4, 2, 4, 3]',
          'kougeihinsu = 9',
          'Akibi = [1, 1, 1]',
          'buinsu = 3',
          'kougeihin を 1 から kougeihinsu まで 1 ずつ増やしながら繰り返す:',
          '｜ tantou = 1',
          '｜ buin を 2 から buinsu まで 1 ずつ増やしながら繰り返す:',
          '｜ ｜ もし Akibi[buin] < Akibi[tantou] ならば:',
          '｜ ⎿ ⎿ tantou = buin',
          '｜ 表示する("工芸品", kougeihin, " … ",',
          '+ ｜        "部員", tantou, "：",',
          '+ ｜        Akibi[tantou], "日目～",',
          '+ ｜        Akibi[tantou] + Nissu[kougeihin] - 1, "日目")',
          '⎿ Akibi[tantou] = Akibi[tantou] + Nissu[kougeihin]',
        ]),
      },
      {
        id: 'r8h-2',
        group: 'exam',
        title: '令和8年度 本試験 第3問 問2 図3（一つのクイズ集を作る）',
        note: '令和8年度 本試験「情報Ⅰ」第3問 問2 図3。空欄 エ・オ・カ〜ク に正解を入れています。添字は 0 から始まります。表示はないので、実行後に変数欄の Saiyou と Mondaisu を確かめてください。',
        base: 0,
        code: numbered([
          ...r8Data(),
          'Mondaisu = [0, 0, 0, 0, 0, 0]',
          'i を 0 から 要素数(Bunya) - 1 まで 1 ずつ増やしながら繰り返す:',
          '｜ b = Bunya[i]',
          '｜ もし Mondaisu[b] < saidai ならば:',
          '｜ ｜ Saiyou[i] = 1',
          '⎿ ⎿ Mondaisu[b] = Mondaisu[b] + 1',
        ]),
      },
      {
        id: 'r8h-3',
        group: 'exam',
        title: '令和8年度 本試験 第3問 問3 図4（重複しない四つのクイズ集）',
        note: '令和8年度 本試験「情報Ⅰ」第3問 問3 図4。空欄 エ・オ・カ〜ク・コ〜ス に正解を入れています。添字は 0 から始まります。省略されているデータを仮の値で補っているため、表示される番号は問題の図6とは異なります。',
        base: 0,
        code: numbered([
          ...r8Data(),
          'c を 1 から 4 まで 1 ずつ増やしながら繰り返す:',
          '｜ Mondaisu = [0, 0, 0, 0, 0, 0]',
          '｜ i を 0 から 要素数(Bunya) - 1 まで 1 ずつ増やしながら繰り返す:',
          '｜ ｜ b = Bunya[i]',
          '｜ ｜ もし (Mondaisu[b] < saidai) and (Saiyou[i] == 0) ならば:',
          '｜ ｜ ｜ Saiyou[i] = c',
          '⎿ ⎿ ⎿ Mondaisu[b] = Mondaisu[b] + 1',
          'i を 0 から 要素数(Bunya) - 1 まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Saiyou[i] > 0 ならば:',
          '｜ ｜ 表示する("番号", i, "の問題を",',
          '+ ⎿ ⎿       Saiyou[i], "番のクイズ集に入れる")',
        ]),
      },
      {
        id: 'r8t-2',
        group: 'exam',
        title: '令和8年度 追試験 第3問 問2 図3（来訪者の待ち時間）',
        note: '令和8年度 追試験「情報Ⅰ」第3問 問2 図3。空欄 カ〜コ に正解を入れています。添字は 1 から始まります。関数「最大値」は問題文で説明されている関数です。',
        base: 1,
        expected: '2人目の待ち時間：0分間\n3人目の待ち時間：2分間\n4人目の待ち時間：0分間\n5人目の待ち時間：2分間\n6人目の待ち時間：4分間\n',
        code: numbered([
          'taiken = 3',
          'Touchaku = [0, 3, 4, 10, 11, 12]',
          'kyakusu = 要素数(Touchaku)',
          'Kaishi = [0, 0, 0, 0, 0, 0]',
          'Shuryou = [0, 0, 0, 0, 0, 0]',
          'Shuryou[1] = taiken',
          'i を 2 から kyakusu まで 1 ずつ増やしながら繰り返す:',
          '｜ Kaishi[i] = 最大値(Touchaku[i], Shuryou[i - 1])',
          '｜ Shuryou[i] = Kaishi[i] + taiken',
          '｜ 表示する(i, "人目の待ち時間：",',
          '+ ⎿        Kaishi[i] - Touchaku[i], "分間")',
        ]),
      },
      {
        id: 'r8t-3',
        group: 'exam',
        title: '令和8年度 追試験 第3問 問3 図4（最長待ち時間が10分間未満の体験時間）',
        note: '令和8年度 追試験「情報Ⅰ」第3問 問3 図4。空欄 カ〜シ に正解を入れています。添字は 1 から始まります。',
        base: 1,
        expected: '体験時間1分間：最長待ち時間0分間\n体験時間2分間：最長待ち時間2分間\n体験時間3分間：最長待ち時間4分間\n体験時間4分間：最長待ち時間8分間\n',
        code: numbered([
          'Touchaku = [0, 3, 4, 10, 11, 12]',
          'kyakusu = 要素数(Touchaku)',
          'taiken を 1 から 15 まで 1 ずつ増やしながら繰り返す:',
          '｜ Kaishi = [0, 0, 0, 0, 0, 0]',
          '｜ Shuryou = [0, 0, 0, 0, 0, 0]',
          '｜ Shuryou[1] = taiken',
          '｜ i を 2 から kyakusu まで 1 ずつ増やしながら繰り返す:',
          '｜ ｜ Kaishi[i] = 最大値(Touchaku[i], Shuryou[i - 1])',
          '｜ ⎿ Shuryou[i] = Kaishi[i] + taiken',
          '｜ saichou = 0',
          '｜ i を 1 から kyakusu まで 1 ずつ増やしながら繰り返す:',
          '｜ ⎿ saichou = 最大値(saichou, Kaishi[i] - Touchaku[i])',
          '｜ もし saichou < 10 ならば:',
          '｜ ｜ 表示する("体験時間", taiken, "分間：",',
          '+ ⎿ ⎿        "最長待ち時間", saichou, "分間")',
        ]),
      },

      // ---------------- 公式資料の例 ----------------
      {
        id: 'bsearch',
        group: 'official',
        title: '二分探索（共通テスト用プログラム表記の例示）',
        note: '「共通テスト用プログラム表記の例示」の二分探索のプログラムです（行番号・縦線も資料のとおり）。入力欄の値を変えて試せます。',
        inputs: ['52'],
        expected: '0～99の数字を入力してください\n52は5番目にありました\n添字 要素\n0 3\n1 18\n2 29\n3 33\n4 48\n5 52\n6 62\n7 77\n8 89\n9 97\n',
        code: [
          '( 1 ) Data=[3,18,29,33,48,52,62,77,89,97]',
          '( 2 ) kazu=要素数(Data)',
          '( 3 ) 表示する("0～99の数字を入力してください")',
          '( 4 ) atai=【外部からの入力】',
          '( 5 ) hidari=0 , migi=kazu-1',
          '( 6 ) owari=0',
          '( 7 ) hidari <= migi and owari==0 の間繰り返す:',
          '( 8 ) ｜aida=(hidari+migi)÷2  #演算子÷は商の整数値を返す',
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
        ],
      },

      // ---------------- 基本のサンプル ----------------
      {
        id: 'sum',
        title: '合計と平均',
        expected: '合計: 304\n平均: 76\n',
        code: numbered([
          'Tokuten = [87, 45, 72, 100]',
          'goukei = 0',
          'i を 0 から 要素数(Tokuten) - 1 まで 1 ずつ増やしながら繰り返す:',
          '⎿ goukei = goukei + Tokuten[i]',
          '表示する("合計: ", goukei)',
          '表示する("平均: ", goukei / 要素数(Tokuten))',
        ]),
      },
      {
        id: 'coins',
        title: '硬貨の枚数（÷ と % ）',
        expected: '最少の枚数: 11\n',
        code: numbered([
          'Kouka = [500, 100, 50, 10, 5, 1]',
          'kingaku = 1768, maisu = 0, nokori = kingaku',
          'i を 0 から 要素数(Kouka) - 1 まで 1 ずつ増やしながら繰り返す:',
          '｜ maisu = maisu + nokori ÷ Kouka[i]',
          '⎿ nokori = nokori % Kouka[i]',
          '表示する("最少の枚数: ", maisu)',
        ]),
      },
      {
        id: 'fizzbuzz',
        title: '条件分岐（FizzBuzz）',
        expected: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n',
        code: numbered([
          'n を 1 から 15 まで 1 ずつ増やしながら繰り返す:',
          '｜ もし n % 15 == 0 ならば:',
          '｜ ｜ 表示する("FizzBuzz")',
          '｜ そうでなくもし n % 3 == 0 ならば:',
          '｜ ｜ 表示する("Fizz")',
          '｜ そうでなくもし n % 5 == 0 ならば:',
          '｜ ｜ 表示する("Buzz")',
          '｜ そうでなければ:',
          '⎿ ⎿ 表示する(n)',
        ]),
      },
      {
        id: 'max',
        title: '最大値を探す',
        expected: '最大値は 92（添字 3）\n',
        code: numbered([
          'Data = [48, 75, 31, 92, 66, 17]',
          'saidai = Data[0], basho = 0',
          'i を 1 から 要素数(Data) - 1 まで 1 ずつ増やしながら繰り返す:',
          '｜ もし Data[i] > saidai ならば:',
          '｜ ｜ saidai = Data[i]',
          '⎿ ⎿ basho = i',
          '表示する("最大値は ", saidai, "（添字 ", basho, "）")',
        ]),
      },
      {
        id: 'bubble',
        title: 'バブルソート（入れ子の繰り返し）',
        expected: '[1, 2, 3, 5, 8, 9]\n',
        code: numbered([
          'Data = [5, 3, 8, 1, 9, 2]',
          'n = 要素数(Data)',
          'i を 0 から n - 2 まで 1 ずつ増やしながら繰り返す:',
          '｜ j を 0 から n - 2 - i まで 1 ずつ増やしながら繰り返す:',
          '｜ ｜ もし Data[j] > Data[j + 1] ならば:',
          '｜ ｜ ｜ tmp = Data[j]',
          '｜ ｜ ｜ Data[j] = Data[j + 1]',
          '⎿ ⎿ ⎿ Data[j + 1] = tmp',
          '表示する(Data)',
        ]),
      },
      {
        id: 'prime',
        title: '素数判定（条件繰り返し）',
        expected: '2 3 5 7 11 13 17 19 23 29 31 37 41 43 47 \n',
        code: numbered([
          'kazu = 2',
          'kazu <= 50 の間繰り返す:',
          '｜ waru = 2, sosu = 1',
          '｜ waru * waru <= kazu and sosu == 1 の間繰り返す:',
          '｜ ｜ もし kazu % waru == 0 ならば sosu = 0',
          '｜ ⎿ waru = waru + 1',
          '｜ もし sosu == 1 ならば:',
          '｜ ⎿ 改行なしで表示する(kazu, " ")',
          '⎿ kazu を 1 増やす',
          '表示する()',
        ]),
      },
      {
        id: 'binary',
        title: '10進数を2進数に変換',
        expected: '13 → 1101\n確認: 1101\n',
        code: numbered([
          'x = 13, kotae = "", n = x',
          'n > 0 の間繰り返す:',
          '｜ kotae = 文字列(n % 2) + kotae',
          '⎿ n = n ÷ 2',
          '表示する(x, " → ", kotae)',
          '表示する("確認: ", 二進(x))',
        ]),
      },
      {
        id: 'grid',
        title: '二次元配列（九九の表）',
        expected: '1 2 3 \n2 4 6 \n3 6 9 \n',
        code: numbered([
          'Hyou のすべての値を 0 にする',
          'i を 1 から 3 まで 1 ずつ増やしながら繰り返す:',
          '｜ j を 1 から 3 まで 1 ずつ増やしながら繰り返す:',
          '⎿ ⎿ Hyou[i, j] = i * j',
          'i を 1 から 3 まで 1 ずつ増やしながら繰り返す:',
          '｜ j を 1 から 3 まで 1 ずつ増やしながら繰り返す:',
          '｜ ⎿ 改行なしで表示する(Hyou[i][j], " ")',
          '⎿ 表示する()',
        ]),
      },
      {
        id: 'dice',
        title: '乱数（サイコロのシミュレーション）',
        code: numbered([
          'Kaisu のすべての値を 0 にする',
          'i を 1 から 600 まで 1 ずつ増やしながら繰り返す:',
          '｜ me = 整数(乱数() * 6) + 1',
          '⎿ Kaisu[me] = Kaisu[me] + 1',
          'me を 1 から 6 まで 1 ずつ増やしながら繰り返す:',
          '⎿ 表示する(me, " の目: ", Kaisu[me], " 回")',
        ]),
      },
      {
        id: 'func',
        title: '関数の定義（拡張）',
        note: '関数の定義はシミュレーター独自の書き方です（DNCL2 の例示には関数を定義する書き方がありません）。',
        expected: '5! = 120\n最大公約数(84, 36) = 12\n',
        code: numbered([
          '関数 kaijou(n):',
          '｜ もし n <= 1 ならば:',
          '｜ ｜ 1 を返す',
          '｜ そうでなければ:',
          '⎿ ⎿ n * kaijou(n - 1) を返す',
          '関数 gcd(a, b):',
          '｜ b != 0 の間繰り返す:',
          '｜ ｜ r = a % b',
          '｜ ⎿ a = b, b = r',
          '⎿ a を返す',
          '表示する("5! = ", kaijou(5))',
          '表示する("最大公約数(84, 36) = ", gcd(84, 36))',
        ]),
      },
      {
        id: 'input',
        title: '入力を使う',
        note: '入力欄に 1 行に 1 つずつ値を書いておくと、【外部からの入力】で上から順に読み込みます（空のときは実行中に入力を求められます）。',
        inputs: ['3', '5'],
        expected: '3 + 5 = 8\n',
        code: numbered([
          'a =【外部からの入力】',
          'b =【外部からの入力】',
          '表示する(a, " + ", b, " = ", a + b)',
        ]),
      },
    ],

    dncl: [
      {
        id: 'sum',
        title: '合計と平均',
        expected: '合計は 304\n平均は 76\n',
        code: [
          '# 配列の値の合計と平均を求める',
          'Tokuten ← {87, 45, 72, 100}',
          'goukei ← 0',
          'i を 0 から 3 まで 1 ずつ増やしながら，',
          '｜ goukei ← goukei ＋ Tokuten[i]',
          'を繰り返す',
          '"合計は " と goukei を表示する',
          '"平均は " と goukei ÷ 4 を表示する',
        ],
      },
      {
        id: 'ifelse',
        title: '条件分岐（もし〜ならば）',
        expected: '15 は 3 の倍数\n16 は 3 の倍数ではない\n',
        code: [
          'x ← 15',
          '繰り返し，',
          '｜ もし x ％ 3 ＝ 0 ならば',
          '｜ ｜ x と " は 3 の倍数" を表示する',
          '｜ を実行し，そうでなければ',
          '｜ ｜ x と " は 3 の倍数ではない" を表示する',
          '｜ を実行する',
          '｜ x ← x ＋ 1',
          'を，x ≧ 17 になるまで実行する',
        ],
      },
      {
        id: 'max',
        title: '最大値を探す',
        expected: '最大値は 92\n',
        code: [
          'Data ← {48, 75, 31, 92, 66, 17}',
          'saidai ← Data[0]',
          'i を 1 から 5 まで 1 ずつ増やしながら，',
          '｜ もし Data[i] ＞ saidai ならば saidai ← Data[i] を実行する',
          'を繰り返す',
          '"最大値は " と saidai を表示する',
        ],
      },
      {
        id: 'bubble',
        title: 'バブルソート（入れ子の繰り返し）',
        expected: '[1, 2, 3, 5, 8, 9]\n',
        code: [
          'Data ← {5, 3, 8, 1, 9, 2}',
          'n ← 6',
          'i を 0 から n − 2 まで 1 ずつ増やしながら，',
          '｜ j を 0 から n − 2 − i まで 1 ずつ増やしながら，',
          '｜ ｜ もし Data[j] ＞ Data[j ＋ 1] ならば',
          '｜ ｜ ｜ tmp ← Data[j]',
          '｜ ｜ ｜ Data[j] ← Data[j ＋ 1]',
          '｜ ｜ ｜ Data[j ＋ 1] ← tmp',
          '｜ ｜ を実行する',
          '｜ を繰り返す',
          'を繰り返す',
          'Data を表示する',
        ],
      },
      {
        id: 'gcd',
        title: '最大公約数（ユークリッドの互除法）',
        expected: '84 と 36 の最大公約数は 12\n',
        code: [
          'a ← 84，b ← 36',
          '"" と a と " と " と b と " の最大公約数は " を改行なしで表示する',
          'b ≠ 0 の間，',
          '｜ r ← a ％ b',
          '｜ a ← b',
          '｜ b ← r',
          'を繰り返す',
          'a を表示する',
        ],
      },
      {
        id: 'grade',
        title: '多分岐（そうでなくもし）',
        expected: '72 点は B\n',
        code: [
          'ten ← 72',
          'もし ten ≧ 80 ならば',
          '｜ hyouka ← "A"',
          'を実行し，そうでなくもし ten ≧ 60 ならば',
          '｜ hyouka ← "B"',
          'を実行し，そうでなければ',
          '｜ hyouka ← "C"',
          'を実行する',
          'ten と " 点は " と hyouka を表示する',
        ],
      },
      {
        id: 'count',
        title: '数え上げ（すべての要素に 0 を代入する）',
        expected: '[2, 3, 1, 2]\n',
        code: [
          'Data ← {1, 3, 0, 1, 3, 1, 2, 0}',
          'Kosu のすべての要素に 0 を代入する',
          'i を 0 から 7 まで 1 ずつ増やしながら，',
          '｜ Kosu[Data[i]] ← Kosu[Data[i]] ＋ 1',
          'を繰り返す',
          'Kosu を表示する',
        ],
      },
      {
        id: 'func',
        title: '関数の定義（公式資料の例）',
        expected: '55\n1024\n',
        code: [
          '関数 和を表示する(n) を',
          '｜ wa ← 0',
          '｜ i を 1 から n まで 1 ずつ増やしながら，',
          '｜ ｜ wa ← wa ＋ i',
          '｜ を繰り返す',
          '｜ wa を表示する',
          'と定義する',
          '',
          '関数 べき乗を表示する(m，n) を',
          '｜ p ← 1',
          '｜ i を 1 から n まで 1 ずつ増やしながら，',
          '｜ ｜ p ← p × m',
          '｜ を繰り返す',
          '｜ p を表示する',
          'と定義する',
          '',
          '和を表示する(10)',
          'べき乗を表示する(2，10)',
        ],
      },
      {
        id: 'countdown',
        title: '減らしながら繰り返す',
        expected: '5 4 3 2 1 発射！\n',
        code: [
          'i を 5 から 1 まで 1 ずつ減らしながら，',
          '｜ i と " " を改行なしで表示する',
          'を繰り返す',
          '"発射！" を表示する',
        ],
      },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = SAMPLES;
  else global.DNCL_SAMPLES = SAMPLES;
})(typeof window !== 'undefined' ? window : this);
