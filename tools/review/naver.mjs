/* 네이버 검색 결과의 「일정 카드」에서 경기 검색어만 뽑아 우리 경기와 짝짓는다.
   검색어는 글 제목에 한 바이트도 바꾸지 않고 들어간다 (설계 §6). 본문 재료로는 쓰지 않는다. */
import { LEAGUES } from './config.mjs';
import { ALIASES } from './aliases.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const GAP_MS = 700;   // 사이트 요청 사이 최소 간격 (공통 제약)

/* 일정 카드 컨테이너 판별 — 2026-10-22 에 받은 실제 마크업 기준 (tests/fixtures/review/naver-*.html).
   - 야구·농구·축구: 일정 카드는 <div id="myschedule"> 안의 <table class="tb_type"> 하나. 경기 한 줄마다
     <td class="score"> 또는 <td class="date"> 안의 <a href="?...&query=YYYY년..."> 가 사용자가 카드를
     눌렀을 때의 검색어다. 같은 표의 「알림」 칸에는 같은 경기를 날짜를 띄어 쓴 다른 형식으로 담은
     onclick="CSSJS.callCalendarScrap('...query=2026년 10월 23일 ...')" 가 있는데 href 가 아니라 속성
     문자열이라 <a href> 만 읽으면 걸러진다. 표 바깥에는 「2026년 프로야구 일정」「2026년 4월 26일
     여자프로농구 경기일정」 같은 다른 링크가 있어 표 안으로만 자른다.
   - 배구: <div class="mflick"> 안의 .match_wrap 목록 (<a class="match_title">·<a class="match_link"> 가
     경기당 두 번 같은 검색어를 가리킨다 → 중복 제거). 끝은 <div class="more_wrap"> 직전.
   어느 표식도 없으면 빈 문자열 → 0개를 돌려주고, 부르는 쪽(Task 13)이 구조 변경 오류로 처리한다. */
function scheduleRegion(html) {
  let s = html.indexOf('id="myschedule"');
  if (s >= 0) {
    const e = html.indexOf('</table>', s);
    return e < 0 ? html.slice(s) : html.slice(s, e);
  }
  s = html.indexOf('class="mflick"');
  if (s >= 0) {
    const e = html.indexOf('class="more_wrap"', s);
    return e < 0 ? html.slice(s) : html.slice(s, e);
  }
  return '';
}

const QUERY_RE = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(.+)$/;

/** @returns {{query:string, date:string, text:string}[]} 카드에 나온 순서, 검색어 중복 없음 */
export function parseNaverSchedule(html) {
  const region = scheduleRegion(String(html ?? ''));
  const out = [];
  const seen = new Set();
  for (const a of region.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const m = a[1].replace(/&amp;/g, '&').match(/[?&]query=([^&]*)/);
    if (!m) continue;
    let query;
    try { query = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch { continue; }
    const p = query.match(QUERY_RE);
    if (!p || seen.has(query)) continue;
    seen.add(query);
    const date = `${p[1]}-${p[2].padStart(2, '0')}-${p[3].padStart(2, '0')}`;
    out.push({ query, date, text: p[4].trim() });
  }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 리그의 질의어마다 네이버 검색 결과를 받아 합친다(검색어 중복 제거). HTTP 오류는 던진다. */
export async function fetchNaverEntries(league, fetchImpl = fetch) {
  const cfg = LEAGUES[league];
  if (!cfg) throw new Error(`알 수 없는 리그: ${league}`);
  const merged = [];
  const seen = new Set();
  for (let i = 0; i < cfg.naverQueries.length; i++) {
    if (i > 0) await sleep(GAP_MS);
    const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(cfg.naverQueries[i])}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } });
    if (!res.ok) throw new Error(`네이버 ${res.status}: ${cfg.naverQueries[i]}`);
    for (const e of parseNaverSchedule(await res.text())) {
      if (seen.has(e.query)) continue;
      seen.add(e.query);
      merged.push(e);
    }
  }
  return merged;
}

function tokensOf(game) {
  const table = ALIASES[game.league];
  const home = table?.[game.home];
  const away = table?.[game.away];
  return home && away && home !== away ? { home, away } : null;
}

/* 같은 날짜 + 두 팀 토큰이 둘 다 text 에 있는 항목이 정확히 하나일 때만 돌려준다.
   0개(못 찾음)·2개 이상(더블헤더처럼 같은 두 팀이 하루 두 경기)이면 null → 부르는 쪽이 건너뛴다. */
export function pairQuery(game, entries) {
  const tok = tokensOf(game);
  if (!tok) return null;
  const hits = entries.filter(e => e.date === game.date && e.text.includes(tok.home) && e.text.includes(tok.away));
  return hits.length === 1 ? hits[0] : null;
}

function wordStart(text, i) {
  while (i > 0 && text[i - 1] !== ' ') i--;
  return i;
}

/* 네이버 text(「팀A 정식명 팀B 정식명」)를 두 팀의 정식명으로 나눈다. 순서는 네이버가 정하므로 토큰 위치로
   누가 앞인지 판단한다. 두 정식명 사이 어디서 끊을지는, 뒤 팀의 원본 이름(예 「부산 KCC」)이 토큰 앞에
   이어 붙어 있으면 거기서, 아니면 뒤 토큰이 든 낱말의 앞에서 끊는다. 나눌 수 없으면 둘 다 null. */
export function splitFullNames(entry, game) {
  const none = { home: null, away: null };
  const tok = tokensOf(game);
  if (!tok) return none;
  const text = entry.text;
  const hi = text.indexOf(tok.home);
  const ai = text.indexOf(tok.away);
  if (hi < 0 || ai < 0) return none;
  const homeFirst = hi < ai;
  const firstIdx = homeFirst ? hi : ai;
  const firstEnd = firstIdx + (homeFirst ? tok.home : tok.away).length;
  const laterIdx = homeFirst ? ai : hi;
  if (firstEnd > laterIdx) return none;
  const laterSource = homeFirst ? game.away : game.home;
  const si = text.indexOf(laterSource, firstEnd);
  let cut = si >= 0 && si <= laterIdx ? wordStart(text, si) : wordStart(text, laterIdx);
  if (cut < firstEnd) cut = laterIdx;
  const first = text.slice(0, cut).trim();
  const later = text.slice(cut).trim();
  if (!first || !later) return none;
  return homeFirst ? { home: first, away: later } : { home: later, away: first };
}
