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

const round3 = (n) => Math.round(n * 1000) / 1000;

/* 두 팀 숫자 짝(최종 점수·기간 점수·팀 기록)과 그 합·차. 검사기가 허용하는 합·차가 곧 이것이고,
   쓰는 AI 에게도 이 목록을 그대로 건넨다 — AI 가 암산하지 않게(#405: 58.0-49.5 를 9.5 로 썼다). */
export function statPairs(facts) {
  const pairs = [];
  const push = (label, home, away) => pairs.push({ label, home, away, sum: round3(home + away), diff: round3(Math.abs(home - away)) });
  push('최종 점수', facts.score.home, facts.score.away);
  const p = facts.periods ?? { home: [], away: [] };
  p.home.forEach((h, i) => { if (h != null && p.away[i] != null) push(p.labels?.[i] ?? `${i + 1}번째 기간`, h, p.away[i]); });
  for (const s of facts.teamStats ?? []) {
    const h = plainNums([s.home]); const a = plainNums([s.away]);
    h.forEach((x, i) => { if (a[i] != null) push(s.label, x, a[i]); });
  }
  return pairs;
}

/* 기간(쿼터·세트·이닝·전후반)별 승패 개수. 쓰는 AI·검토 AI 에 함께 건넨다 —
   #471(kbl-S49G01N61): 1·3·4쿼터를 진 팀을 AI 가 「두 쿼터」로 셌다. 기간 점수가 없으면 null. */
export function periodTally(facts) {
  const p = facts.periods;
  if (!p || !Array.isArray(p.home) || !Array.isArray(p.away)) return null;
  const t = { home: { count: 0, labels: [] }, away: { count: 0, labels: [] }, tie: { count: 0, labels: [] } };
  const num = (v) => (v == null || v === '' ? NaN : Number(v));   // Number(null) 은 0 이라 따로 거른다
  p.home.forEach((hv, i) => {
    const h = num(hv); const a = num(p.away[i]);
    if (!Number.isFinite(h) || !Number.isFinite(a)) return;
    const side = h > a ? t.home : a > h ? t.away : t.tie;
    side.count += 1;
    side.labels.push(p.labels?.[i] ?? `${i + 1}번째 기간`);
  });
  return t;
}

function allowedNumbers(facts, title) {
  const nums = new Set();
  const minutes = new Set();                // '45+9' 같은 토큰
  const add = (n) => { if (Number.isFinite(n)) nums.add(Math.round(n * 1000) / 1000); };

  const strs = [...flatten(facts.ai), ...flatten(facts.timeline), ...flatten(facts.crowd)];
  for (const s of strs) for (const t of numbersIn(s)) (t.includes('+') ? minutes.add(t) : add(Number(t)));
  for (const s of strs) for (const m of s.matchAll(/(\d+)\s*\/\s*(\d+)/g)) {
    if (Number(m[2]) > 0) add(Math.round((Number(m[1]) / Number(m[2])) * 1000) / 10);   // 백분율 소수 1자리
  }

  for (const { home, away, sum, diff } of statPairs(facts)) { add(home); add(away); add(sum); add(diff); }

  for (const n of [...nums]) add(n * 2);    // 2점 득점 등

  for (let i = 0; i <= SMALL_MAX; i += 1) add(i);
  for (const t of numbersIn(facts.date)) add(Number(t));   // 연·월·일
  /* 팀 이름 속 숫자(부천FC1995)와 제목(네이버 검색어) 속 숫자 — 프롬프트가 첫 문장에 정식 이름을 쓰게 한다. */
  const names = [facts.home, facts.away].flatMap((s) => [s?.name, s?.short, s?.full]).filter((v) => typeof v === 'string');
  for (const s of [...names, ...(typeof title === 'string' ? [title] : [])]) for (const t of plainNums([s])) add(t);
  return { nums, minutes };
}

function stripTags(html) { return String(html).replace(/<[^>]*>/g, ' '); }

const isText = (v) => typeof v === 'string' && v.trim() !== '';

export function checkDoc(doc, facts, title, expectedTitle) {
  const issues = [];
  const issue = (field, problem) => issues.push({ field, problem });

  if (!isText(title) || !isText(expectedTitle)) issue('title', '제목이 비어 있다');
  else if (title !== expectedTitle) issue('title', `제목이 기대값과 다르다: ${title}`);

  if (doc == null || typeof doc !== 'object') {
    issue('doc', '문서가 객체가 아니다');
    return { ok: false, issues };
  }
  for (const f of [...TEXT_FIELDS, ...HTML_FIELDS]) if (!isText(doc[f])) issue(f, '비어 있거나 문자열이 아니다');
  const kp = doc.key_points;
  const kpOk = Array.isArray(kp) && kp.length > 0 && kp.every(isText);
  if (!kpOk) issue('key_points', '비어 있지 않은 문자열 배열이어야 한다');

  for (const f of HTML_FIELDS) {
    if (typeof doc[f] !== 'string') continue;
    const rest = doc[f].replace(/<\/?\s*([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g, (all, name, attrs) => {
      const tag = name.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) issue(f, `허용되지 않는 태그: <${tag}>`);
      else if (attrs.trim() !== '') issue(f, `태그에 속성이 있다: <${tag}>`);
      return ' ';
    });
    if (/[<>]/.test(rest)) issue(f, '허용되지 않는 마크업(주석·CDATA·미완성 태그 등)이 있다');
  }
  const plainFields = [
    ...TEXT_FIELDS.map((f) => [f, doc[f]]),
    ...(kpOk ? kp : []).map((k, i) => [`key_points[${i}]`, k]),
  ];
  for (const [f, v] of plainFields) {
    if (/[<>]/.test(String(v ?? ''))) issue(f, '일반 문장 필드에 태그 문자가 있다');
  }
  const plain = [...plainFields, ...HTML_FIELDS.map((f) => [f, stripTags(doc[f] ?? '')])];

  const { nums, minutes } = allowedNumbers(facts, expectedTitle);
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
