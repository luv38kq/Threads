// ことばチェック（声かけ帖・トイトレ帖で共通。2つのフォルダに同じものを置いています）
// このファイルを直したら、もう片方のフォルダにも同じ内容をコピーしてください（テストで確認しています）。

// -------------------------------------------------------------------
// ことばチェック：気をつけたい言い方の判定
// 正解を決めるものではなく、言い換えのヒントを出すためのもの
// -------------------------------------------------------------------

export const CHECK_KINDS = {
  deny: { label: "気持ちの否定", tone: "strong" },
  apology: { label: "謝罪の強要", tone: "mild" },
  hurry: { label: "急かし", tone: "mild" },
  threat: { label: "おどし", tone: "strong" },
  scare: { label: "怖がらせ", tone: "strong" },
  compare: { label: "比べる", tone: "strong" },
  label: { label: "決めつけ", tone: "strong" },
  punish: { label: "罰・取り上げ", tone: "mild" },
  shame: { label: "恥ずかしさ", tone: "strong" },
  deadline: { label: "年齢の断定", tone: "strong" },
  promise: { label: "効果の断定", tone: "mild" },
};

export const CHECK_RULES = [
  {
    kind: "deny",
    pattern: /泣かないの|泣かないで|泣くんじゃない|泣くな(?![ぁ-ん])|(?:そんなこと|それくらい|それぐらい)で(?:泣かない|怒らない|嫌がらない|いやがらない)|大丈夫だから|怖くないよ|こわくないよ|痛くないでしょ|いたくないでしょ/g,
    reason: "気持ちを打ち消されると、子どもは気持ちを外に出さずにため込むようになりがちです。",
    hint: "「悔しかったね」「不安なんだね」と、まず気持ちを言葉にしてから次の話をする。",
  },
  {
    kind: "apology",
    pattern: /ごめんなさいは[？?]?|ごめんなさいしなさい|ごめんなさいって言いなさい|謝りなさい|あやまりなさい/g,
    reason: "謝ることを強いると、形だけの「ごめんなさい」になり、相手の気持ちを考えるきっかけを逃しがちです。",
    hint: "「〇〇くん、痛かったみたい。どうしたらいいと思う？」と、相手の気持ちに目を向ける。",
  },
  {
    kind: "hurry",
    pattern: /早くして|早くしなさい|早くしないと|はやくして|はやくしなさい|はやくしないと|急いで|いそいで/g,
    reason: "「早く」はどれくらい急げばいいのか、子どもには分かりにくい言葉です。",
    hint: "「時計の長い針が6になったら出発ね」のように、目に見える目安で伝える。",
  },
  {
    kind: "threat",
    pattern: /置いていく|置いてく|置いてっちゃう|おいていく|おいてく|もう知らない|もうしらない|知らないからね/g,
    reason: "置いていかれる不安で動かす言い方は、くり返すと効かなくなり、不安だけが残りがちです。",
    hint: "「あと5分で出るよ。玄関で待ってるね」と、見通しと居場所を伝える。",
  },
  {
    kind: "scare",
    pattern: /おばけが来る|おばけがくる|おばけ来る|鬼が来る|鬼がくる|鬼から電話|鬼に電話|サンタさんが来ない|サンタが来ない|サンタさん来ない|お巡りさんに|おまわりさんに/g,
    reason: "怖さで言うことを聞かせると、その場は収まっても、夜や暗い場所を怖がる原因になることがあります。",
    hint: "理由を短く伝える（「明日元気に遊べるように、もう寝ようね」）。",
  },
  {
    kind: "compare",
    pattern: /(?:お兄ちゃん|お姉ちゃん|おにいちゃん|おねえちゃん|弟|妹|みんな|ほかの子|他の子|[ぁ-んァ-ン一-龥]{1,6}(?:ちゃん|くん))(?:は|はもう|なんて)[^。！!？?\n]{0,15}(?:できる|できた|できてた|やってる|やってた)(?:のに|よ)|みんな(?:は)?(?:もっと|平気|ちゃんと|行ってる|やってる|できてる)/g,
    reason: "比べられると、自信をなくしたり、きょうだいや友だちを嫌いになったりしがちです。",
    hint: "比べるなら「先月のこの子」と。「昨日より早くできたね」のように伝える。",
  },
  {
    kind: "label",
    pattern: /お兄ちゃんなんだから|お姉ちゃんなんだから|おにいちゃんなんだから|おねえちゃんなんだから|何回言ったら|何回いったら|なんかいいったら|なんで(?:いつも|毎回)|いつもそう|悪い子|わるい子|ダメな子|だめな子|わがまま|なんで(?:できない|わからない|分からない)の/g,
    reason: "「いつも」「〇〇な子」は、行動ではなくその子自身を決めつける言い方に聞こえます。",
    hint: "その場の行動だけを言う（「今、おもちゃを投げたね。投げるのはなし」）。",
  },
  {
    kind: "punish",
    pattern: /(?:おやつ|テレビ|動画|ゲーム|おもちゃ)(?:は|も)?(?:なし|抜き|ぬき|没収|ボッシュート)|捨てるよ|すてるよ|捨てちゃう/g,
    reason: "罰で動かすと、罰がないときに動けなくなりがちです。",
    hint: "次の楽しみとセットにする（「片付けたら、おやつにしよう」）。",
  },
  {
    kind: "shame",
    pattern: /恥ずかしい|はずかしい|赤ちゃんみたい|あかちゃんみたい|赤ちゃんじゃないんだから|みっともない|笑われる|わらわれる/g,
    reason: "恥ずかしさで動かそうとすると、失敗を隠すようになることがあります。トイトレでは特に逆効果です。",
    hint: "「出ちゃったね、着替えよう」と淡々と。失敗は責めずに流す。",
  },
  {
    kind: "deadline",
    pattern: /(?:[0-9０-９]|一|二|三|四|五|六)歳までに|(?:外さないと|外れないと|はずさないと|はずれないと)(?:ダメ|だめ|いけない|まずい|困る)|(?:[0-9０-９]|一|二|三|四|五|六)歳(?:にも)?なのに|もう(?:[0-9０-９]|一|二|三|四|五|六)歳でしょ/g,
    reason: "トイレや発達の時期には大きな個人差があります。年齢での締め切りは、親子ともに追いつめがちです。",
    hint: "「その子のペースで」。気になるときは、年齢ではなく困りごとで小児科や保健師さんに相談。",
  },
  {
    kind: "promise",
    pattern: /必ず(?:外れる|できる|治る|成功)|絶対(?:に)?(?:外れる|できる|治る|成功)|これだけで|すぐ(?:に)?外れる|[0-9０-９]+日で(?:外れる|卒業|完了)/g,
    reason: "「必ず」「〇日で」は、うまくいかなかった親を苦しめます。発信するときは特に注意したい言い方です。",
    hint: "「うちではこうでした」「〜という方法もあります」と、体験や選択肢として伝える。",
  },
];

/**
 * ことばチェック。見つかった箇所を、文章の前から順に返す。
 * 重なった箇所は、先に始まる（同じなら長い）ほうを残す。
 */
export function checkText(text) {
  const found = [];
  for (const rule of CHECK_RULES) {
    const re = new RegExp(rule.pattern.source, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      found.push({ start: m.index, end: m.index + m[0].length, match: m[0], rule });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let until = -1;
  for (const f of found) {
    if (f.start < until) continue;
    kept.push(f);
    until = f.end;
  }
  return kept;
}

/** 文章を「ふつうの部分」と「印を付ける部分」に分ける（画面の表示用） */
export function splitByFindings(text, findings) {
  const parts = [];
  let pos = 0;
  for (const f of findings) {
    if (f.start > pos) parts.push({ text: text.slice(pos, f.start) });
    parts.push({ text: f.match, finding: f });
    pos = f.end;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos) });
  return parts;
}

/** 種類ごとにまとめる（同じ種類の指摘を1つのカードにする） */
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.rule.kind;
    if (!groups.has(key)) groups.set(key, { kind: key, ...CHECK_KINDS[key], rule: f.rule, matches: [] });
    const g = groups.get(key);
    if (!g.matches.includes(f.match)) g.matches.push(f.match);
  }
  return [...groups.values()];
}
