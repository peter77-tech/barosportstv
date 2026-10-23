/* 리뷰 문서 코드 검사 (AI 아님). 제목 일치 · 허용 태그 · 근거 없는 숫자 · 금지 표현 · 무승부 승자 표현. */

const ALLOWED_TAGS = new Set(['h2', 'h3', 'p', 'ul', 'li', 'strong']);
const HTML_FIELDS = ['body_html', 'verdict_html'];
const TEXT_FIELDS = ['meta_description', 'answer'];
const BANNED = ['기록에 없', '데이터상', '때문에 이겼', '설명한다', '경기 내내'];
const DRAW_BANNED = ['이겼', '승리', '꺾'];
const SMALL_MAX = 12;                       // 횟수·서수로 쓰이는 0~12 는 항상 허용

const NUM_RE = /\d+\+\d+|\d+(?:\.\d+)?/g;   // 45+9 는 한 토큰

const numbersIn = (s) => (String(s).replace(/(\d),(?=\d{3}\b)/g, '$1').match(NUM_RE) ?? []);

function flatten(v, out = []) {
  if (v == null) return out;
  if (typeof v === 'number') out.push(String(v));
  else if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (typeof v === 'object') Object.values(v).forEach((x) => flatten(x, out));
  return out;
}

const plainNums = (strs) => strs.flatMap(numbersIn).filter((t) => !t.includes('+')).map(Number);

function allowedNumbers(facts) {
  const nums = new Set();
  const minutes = new Set();                // '45+9' 같은 토큰
  const add = (n) => { if (Number.isFinite(n)) nums.add(Math.round(n * 1000) / 1000); };

  const strs = [...flatten(facts.ai), ...flatten(facts.timeline), ...flatten(facts.crowd)];
  for (const s of strs) for (const t of numbersIn(s)) (t.includes('+') ? minutes.add(t) : add(Number(t)));
  for (const s of strs) for (const m of s.matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
    if (Number(m[2]) > 0) add(Math.round((Number(m[1]) / Number(m[2])) * 1000) / 10);   // 백분율 소수 1자리
  }

  const pairs = [];
  pairs.push([facts.score.home, facts.score.away]);
  const p = facts.periods ?? { home: [], away: [] };
  p.home.forEach((h, i) => { if (h != null && p.away[i] != null) pairs.push([h, p.away[i]]); });
  for (const s of facts.teamStats ?? []) {
    const h = plainNums([s.home]); const a = plainNums([s.away]);
    h.forEach((x, i) => { if (a[i] != null) pairs.push([x, a[i]]); });
  }
  for (const [x, y] of pairs) { add(x); add(y); add(x + y); add(Math.abs(x - y)); }

  for (const n of [...nums]) add(n * 2);    // 2점 득점 등

  for (let i = 0; i <= SMALL_MAX; i += 1) add(i);
  for (const t of numbersIn(facts.date)) add(Number(t));   // 연·월·일
  return { nums, minutes };
}

function stripTags(html) { return String(html).replace(/<[^>]*>/g, ' '); }

export function checkDoc(doc, facts, title, expectedTitle) {
  const issues = [];
  const issue = (field, problem) => issues.push({ field, problem });

  if (title !== expectedTitle) issue('title', `제목이 기대값과 다르다: ${title}`);

  for (const f of HTML_FIELDS) {
    const html = String(doc[f] ?? '');
    for (const m of html.matchAll(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
      const tag = m[1].toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) issue(f, `허용되지 않는 태그: <${tag}>`);
      else if (m[2].replace(/\/$/, '').trim() !== '') issue(f, `태그에 속성이 있다: <${tag}>`);
    }
  }
  const plainFields = [
    ...TEXT_FIELDS.map((f) => [f, doc[f]]),
    ...(doc.key_points ?? []).map((k, i) => [`key_points[${i}]`, k]),
  ];
  for (const [f, v] of plainFields) {
    if (/[<>]/.test(String(v ?? ''))) issue(f, '일반 문장 필드에 태그 문자가 있다');
  }
  const plain = [...plainFields, ...HTML_FIELDS.map((f) => [f, stripTags(doc[f] ?? '')])];

  const { nums, minutes } = allowedNumbers(facts);
  const draw = facts.score.home === facts.score.away;
  for (const [f, v] of plain) {
    const text = String(v ?? '');
    for (const t of new Set(numbersIn(text))) {
      const ok = t.includes('+') ? minutes.has(t) : nums.has(Math.round(Number(t) * 1000) / 1000);
      if (!ok) issue(f, `근거 없는 숫자: ${t}`);
    }
    for (const b of BANNED) if (text.includes(b)) issue(f, `금지 표현: ${b}`);
    if (draw) for (const w of DRAW_BANNED) if (text.includes(w)) issue(f, `무승부인데 승패 표현: ${w}`);
  }

  return { ok: issues.length === 0, issues };
}
