/* WKBL 수집기 (www.wkbl.or.kr 공식 기록, 서버 렌더링 HTML — API 없음).
   목록(달 1번 + 플레이오프 1번) + 경기당 2번(결과 페이지 · 박스 ajax). 응답은 UTF-8 이다.

   🔴 실측한 구조 (2026-10-23, 2025-26 시즌 game_type 01 / game_no 89):
   - 시즌 값(season_gu)은 일정 페이지 select#season_gu 의 selected 옵션(없으면 맨 위 = 최신). 하드코딩하지 않는다.
   - 정규시즌 목록 `inc_list_1_new.asp?season_gu&ym=YYYYMM&viewType=1&gun=1`, 플레이오프·챔프전 목록 `inc_list_P1.asp?season_gu&ym=p`
     (플레이오프 목록의 링크는 ym 이 비어 있다). 목록 행 = `<tr id="YYYYMMDD">`, 안에 `.info_team` 둘(팀 이름 strong.team_name,
     점수 em.txt_score), 장소 td, 「경기기록」 a(result.asp?…game_type=NN&game_no=N&ym=…).
   - 🔴 먼저 적힌 팀이 홈이다. 사이트는 먼저 적힌 쪽에 class="away" 를 붙이지만, 장소가 첫 팀의 홈구장이다
     (인천도원체육관=신한은행, 청주체육관=KB스타즈, 용인실내체육관=삼성생명).
   - game_type: 01 정규시즌 · 03 플레이오프 · 04 챔피언결정전 · 09 박신자컵(컵대회, §3 제외). 그 밖의 값은 쓰지 않는다.
   - 결과 페이지 `result.asp` 의 div#cMain: p.info_game 의 span 셋(날짜 · 시각 · 장소), .info_team 둘(이름 · 점수),
     `#gameDetails` 첫 표 = 쿼터 점수(thead: 팀명 1Q 2Q 3Q 4Q EQ TOTAL / tbody 팀당 1행, 첫 칸에 팀명 + 「[9승 21패, 6위]」 순위),
     div.info_mvp strong = 「오늘의 MVP : 이름」. 🔴 순위 문자열은 읽지 않는다(§7.2). 관중 수는 없다.
   - 박스 `POST ajax/ajax_game_result_2.asp`: 팀마다 h4.tit_area(팀명) 다음 표. thead 는 두 줄, tbody 는 뛴 선수만
     (선수 · POS · MIN · 2PM-A · 3PM-A · FTM-A · OFF · DEF · TOT · AST · PF · ST · TO · BS · PTS 15칸),
     tfoot 한 줄이 팀 합계(「팀합계」 칸이 colspan=2 라서 14칸 — 선수 표보다 POS 한 칸이 적다).
   - 결과·박스 구조를 못 찾으면 추측하지 않고 던진다(조용히 틀린 글이 나가는 것보다 낫다). */

const ORIGIN = 'https://www.wkbl.or.kr';
const GAP_MS = 700;                      // 사이트 요청 사이 최소 간격 (공통 제약)
const SOURCE_NAME = 'WKBL 공식 기록';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const STAGES = { '01': '정규시즌', '03': '플레이오프', '04': '챔피언결정전' };

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* wkbl.or.kr 로 나가는 모든 요청 사이 GAP_MS. 호출 사이에도 이어지도록 모듈 전역에 마지막 요청 시각을 둔다. */
let lastRequestAt = -Infinity;

/** 테스트용: 전역 간격 기록을 지운다. */
export function resetWkblThrottle() { lastRequestAt = -Infinity; }

/* 모든 요청이 지나는 단 하나의 길목: 간격 대기 → 요청 → res.ok 확인 → 본문 글자. */
async function request(path, init, { fetchImpl, sleep, now }) {
  const wait = GAP_MS - (now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = now();
  const res = await fetchImpl(`${ORIGIN}${path}`, { ...init, headers: { ...HEADERS, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`WKBL ${res.status}: ${path}`);
  return res.text();
}

const fail = (what) => new Error(`WKBL 페이지 구조를 읽지 못했다: ${what}`);

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
/** 태그를 지우고 글자만. */
const text = (html) => html.replace(/<!--.*?-->/gs, '').replace(/<[^>]*>/g, '')
  .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e]).replace(/\s+/g, ' ').trim();
const rowsOf = (html) => [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) => m[1]);
const cellsOf = (rowHtml) => [...rowHtml.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((m) => text(m[1]));
const isoOf = (compact) => `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

/** 일정 페이지의 시즌 선택 상자에서 지금 시즌 값(예: '047'). 선택 표시가 없으면 맨 위(최신) 옵션. */
export async function findSeasonGu(io = {}) {
  const { fetchImpl = fetch, sleep = realSleep, now = Date.now } = io;
  const html = await request('/game/sch/schedule1.asp?gun=1', undefined, { fetchImpl, sleep, now });
  const select = html.match(/<select[^>]*id="season_gu"[^>]*>(.*?)<\/select>/s)?.[1] ?? '';
  const options = [...select.matchAll(/<option value="(\d+)"([^>]*)>/g)];
  const pick = options.find((o) => /\bselected\b/.test(o[2])) ?? options[0];
  if (!pick) throw new Error('WKBL season_gu 선택 상자를 찾지 못했다');
  return pick[1];
}

/* 목록 한 장 → 끝난 경기 행. 끝남 = 두 팀 점수가 모두 숫자이고 「경기기록」 링크가 있다. */
function parseList(html, seasonGu) {
  const games = [];
  for (const m of html.matchAll(/<tr id="(\d{8})"[^>]*>(.*?)<\/tr>/gs)) {
    const [, compact, body] = m;
    const teams = [...body.matchAll(/<strong class="team_name[^>]*>(.*?)<\/strong>\s*<em class="txt_score">(.*?)<\/em>/gs)]
      .map((t) => ({ name: text(t[1]), score: text(t[2]) }));
    const link = body.match(/result\.asp\?[^"]*?game_type=(\d+)&(?:amp;)?game_no=(\d+)&(?:amp;)?ym=(\w*)/);
    if (teams.length !== 2 || !link || !teams.every((t) => /^\d+$/.test(t.score))) continue;
    const [, gameType, gameNo, ym] = link;
    const stage = STAGES[gameType];
    if (!stage) continue;                                   // 컵대회(09)·정체불명 종류는 쓰지 않는다 (§3)
    const [home, away] = teams;                             // 먼저 적힌 팀 = 홈 (파일 머리 주석)
    const time = cellsOf(body).find((c) => /^\d{1,2}:\d{2}$/.test(c)) ?? null;   // 경기 시작 시각(KST)
    games.push({ time, game: {
      league: 'wkbl', gameKey: `wkbl-${seasonGu}-${gameType}-${gameNo}`, date: isoOf(compact),
      home: home.name, away: away.name, homeScore: Number(home.score), awayScore: Number(away.score),
      stage, ref: { seasonGu, gameType, gameNo, ym },
    } });
  }
  return games;
}

const GAME_LENGTH_MS = 2.5 * 3600e3;
/* 목록 행에는 진행 상태 칸이 없어 경기 중에도 부분 점수 + 기록 링크가 보일 수 있다. 오늘 경기는 시작 + 2시간 30분이 지나야
   끝난 것으로 본다. 시작 시각을 못 읽으면 건너뛴다(다음 회차 windowDays 안에서 다시 잡힌다). */
function startedLongAgo(date, time, nowMs) {
  if (!time) return false;
  const start = Date.parse(`${date}T${time.padStart(5, '0')}:00+09:00`);
  return Number.isFinite(start) && nowMs >= start + GAME_LENGTH_MS;
}

/** days(한국 날짜들)의 끝난 WKBL 경기(정규시즌·플레이오프·챔피언결정전). 달마다 1번 + 플레이오프 목록 1번. */
export async function listFinished(days, { fetchImpl = fetch, sleep = realSleep, now = Date.now, seasonGu } = {}) {
  const io = { fetchImpl, sleep, now };
  const season = seasonGu ?? await findSeasonGu(io);
  const want = new Set(days);
  const nowMs = now();
  const today = new Date(nowMs + 9 * 3600e3).toISOString().slice(0, 10);   // 오늘(KST)
  const months = [...new Set(days.map((d) => d.slice(0, 7).replace('-', '')))].sort();
  const pages = [];
  for (const ym of months) pages.push(await request(`/game/sch/inc_list_1_new.asp?season_gu=${season}&ym=${ym}&viewType=1&gun=1`, undefined, io));
  pages.push(await request(`/game/sch/inc_list_P1.asp?season_gu=${season}&ym=p`, undefined, io));
  const seen = new Set();                                   // 같은 경기가 여러 목록에 반복된다 → (game_type, game_no) 로 한 번만
  const games = [];
  for (const html of pages) {
    for (const { game: g, time } of parseList(html, season)) {
      if (g.date === today && !startedLongAgo(g.date, time, nowMs)) continue;
      const id = `${g.ref.gameType}-${g.ref.gameNo}`;
      if (!want.has(g.date) || seen.has(id)) continue;
      seen.add(id);
      games.push(g);
    }
  }
  return games;
}

const resultPath = (r) => `/game/result.asp?season_gu=${r.seasonGu}&gun=1&game_type=${r.gameType}&game_no=${r.gameNo}&ym=${r.ym}&viewType=1`;

/** 경기당 2번: 결과 페이지(점수·쿼터·MVP) · 박스(선수·팀 합계). */
export async function fetchFacts(game, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const io = { fetchImpl, sleep, now };
  const r = game.ref;
  const resultHtml = await request(resultPath(r), undefined, io);
  const boxHtml = await request('/game/ajax/ajax_game_result_2.asp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${ORIGIN}/game/result.asp` },
    body: new URLSearchParams({ season_gu: r.seasonGu, game_type: r.gameType, game_no: r.gameNo, ym: r.ym, h_player: '', a_player: '' }).toString(),
  }, io);
  return toFacts({ resultHtml, boxHtml, ref: r });
}

const pct = (n, d) => (d > 0 ? (Math.round((n / d) * 1000) / 10).toFixed(1) : '0.0');
const ratio = (acc, all) => `${acc}/${all} (${pct(acc, all)}%)`;
const made = (s) => { const [a, b] = s.split('-').map(Number); return { a, b }; };   // '3-8' → 성공 3, 시도 8
const num = (s) => Number(s);

/* 결과 페이지 → { date, venue, teams:[{name,score}×2], quarters:[{name,cells,total}×2], mvp } */
function parseResult(html) {
  const info = html.match(/<p class="info_game">(.*?)<\/p>/s)?.[1];
  const date = info?.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
  const spans = info ? [...info.matchAll(/<span[^>]*>(.*?)<\/span>/gs)].map((s) => text(s[1])).filter(Boolean) : [];
  if (!date || spans.length < 3) throw fail('경기 정보(날짜·장소)');
  const teams = [...html.matchAll(/<div class="info_team[^"]*">.*?<strong class="team_name[^>]*>(.*?)<\/strong>.*?<em class="txt_score">(\d+)<\/em>/gs)]
    .map((t) => ({ name: text(t[1]), score: Number(t[2]) }));
  if (teams.length !== 2) throw fail('두 팀 점수');
  const table = html.match(/id="gameDetails".*?<table>(.*?)<\/table>/s)?.[1];
  const rows = table ? rowsOf(table) : [];
  const head = rows[0] ? cellsOf(rows[0]) : [];
  if (rows.length !== 3 || head.slice(1).join(',') !== '1Q,2Q,3Q,4Q,EQ,TOTAL') throw fail('쿼터 점수 표');
  // 첫 칸 = 「팀명 [순위]」 — 순위는 버리고 팀명 span 만 쓴다(§7.2).
  const quarters = rows.slice(1).map((r) => {
    const name = text(r.match(/<span[^>]*>(.*?)<\/span>/s)?.[1] ?? '');
    const cells = cellsOf(r).slice(1).map(num);
    if (!name || cells.length !== 6 || cells.some(Number.isNaN)) throw fail('쿼터 점수 행');
    return { name, cells: cells.slice(0, 5), total: cells[5] };
  });
  // 사이트가 data-kr=">김지영" 처럼 속성값 안에 > 를 넣어 두므로 따옴표 안은 건너뛰며 태그 끝을 찾는다.
  const mvp = html.match(/<div class="info_mvp">\s*<strong>.*?:\s*<span(?:[^>"]|"[^"]*")*>(.*?)<\/span>/s);
  return {
    date: `${date[1]}-${String(date[2]).padStart(2, '0')}-${String(date[3]).padStart(2, '0')}`,
    venue: spans[spans.length - 1], teams, quarters, mvp: mvp ? text(mvp[1]) : null,
  };
}

/* 박스 → { 팀명: { players:[{name,pos,min,p2,p3,ft,off,def,reb,ast,pf,stl,to,blk,pts}], total:{…} } } */
function parseBox(html) {
  const out = {};
  for (const m of html.matchAll(/<h4 class="tit_area[^>]*>(.*?)<\/h4>\s*<div class="info_table01 type_record">\s*<table>(.*?)<\/table>/gs)) {
    const body = m[2].match(/<tbody>(.*?)<\/tbody>/s)?.[1];
    const foot = m[2].match(/<tfoot>(.*?)<\/tfoot>/s)?.[1];
    if (!body || !foot) throw fail('선수 표');
    const stat = (c, off) => ({
      min: c[off], p2: made(c[off + 1]), p3: made(c[off + 2]), ft: made(c[off + 3]),
      off: num(c[off + 4]), def: num(c[off + 5]), reb: num(c[off + 6]), ast: num(c[off + 7]),
      pf: num(c[off + 8]), stl: num(c[off + 9]), to: num(c[off + 10]), blk: num(c[off + 11]), pts: num(c[off + 12]),
    });
    const players = rowsOf(body).map(cellsOf).map((c) => {
      if (c.length !== 15) throw fail('선수 행 열 수');
      return { name: c[0], pos: c[1], ...stat(c, 2) };
    });
    const footCells = rowsOf(foot).map(cellsOf)[0];
    if (!footCells || footCells.length !== 14) throw fail('팀 합계 행');
    out[text(m[1])] = { players, total: stat(footCells, 1) };
  }
  if (Object.keys(out).length !== 2) throw fail('팀별 선수 표 두 개');
  return out;
}

const teamRow = (name, t) => ({
  name, points: t.pts,
  fieldGoals: ratio(t.p2.a + t.p3.a, t.p2.b + t.p3.b), twoPoint: ratio(t.p2.a, t.p2.b), threePoint: ratio(t.p3.a, t.p3.b),
  freeThrows: ratio(t.ft.a, t.ft.b),
  rebounds: t.reb, offensiveRebounds: t.off, defensiveRebounds: t.def, assists: t.ast, steals: t.stl, blocks: t.blk,
  turnovers: t.to, fouls: t.pf,
});

const aiPlayer = (p, team) => ({
  name: p.name, team, pos: p.pos, minutes: p.min,
  points: p.pts, rebounds: p.reb, offensiveRebounds: p.off, assists: p.ast, steals: p.stl, blocks: p.blk, turnovers: p.to, fouls: p.pf,
  twoPoint: ratio(p.p2.a, p.p2.b), threePoint: ratio(p.p3.a, p.p3.b), freeThrows: ratio(p.ft.a, p.ft.b),
});

/* KBL 과 같은 열에서 +/- 만 뺀다(WKBL 기록에 없다). */
const playerRow = (side, p) => ({
  side, name: p.name, cells: [p.name, p.min, p.pts, p.reb, p.ast, p.stl, `${p.p3.a}/${p.p3.b}`],
});

/** { resultHtml, boxHtml, ref } → MatchFacts. 순수 함수. ref = { seasonGu, gameType, gameNo, ym }. */
export function toFacts({ resultHtml, boxHtml, ref }) {
  const r = parseResult(resultHtml);
  const box = parseBox(boxHtml);
  const stage = STAGES[ref.gameType] ?? null;
  const [homeT, awayT] = r.teams;                           // 먼저 적힌 팀 = 홈
  const [homeQ, awayQ] = r.quarters;
  if (homeQ.name !== homeT.name || awayQ.name !== awayT.name || homeQ.total !== homeT.score || awayQ.total !== awayT.score) {
    throw fail('쿼터 표와 점수가 어긋남');
  }
  const homeBox = box[homeT.name], awayBox = box[awayT.name];
  if (!homeBox || !awayBox) throw fail('박스의 팀 이름이 결과와 다름');
  if (homeBox.total.pts !== homeT.score || awayBox.total.pts !== awayT.score) throw fail('박스 득점이 점수와 어긋남');

  const home = { name: homeT.name, short: homeT.name, full: null };
  const away = { name: awayT.name, short: awayT.name, full: null };
  const score = { home: homeT.score, away: awayT.score };

  const hasExtra = homeQ.cells[4] > 0 || awayQ.cells[4] > 0;   // EQ 열 = 연장 합계(실측: 정규 경기는 0)
  const n = hasExtra ? 5 : 4;
  const periods = {
    labels: ['1Q', '2Q', '3Q', '4Q', 'OT'].slice(0, n), home: homeQ.cells.slice(0, n), away: awayQ.cells.slice(0, n),
  };

  const h = homeBox.total, a = awayBox.total;
  const row = (label, f, extra) => ({ label, home: f(h), away: f(a), ...extra });
  const teamStats = [
    row('야투', (t) => ratio(t.p2.a + t.p3.a, t.p2.b + t.p3.b)),
    row('2점슛', (t) => ratio(t.p2.a, t.p2.b)),
    row('3점슛', (t) => ratio(t.p3.a, t.p3.b)),
    row('리바운드', (t) => t.reb),
    row('어시스트', (t) => t.ast),
    row('턴오버', (t) => t.to, { lowerBetter: true }),
  ];

  const top5 = (side, b) => [...b.players].sort((x, y) => y.pts - x.pts).slice(0, 5).map((p) => playerRow(side, p));
  const played = (p) => p.min !== '00:00';
  return {
    league: 'wkbl', gameKey: `wkbl-${ref.seasonGu}-${ref.gameType}-${ref.gameNo}`, date: r.date, stage,
    venue: r.venue, crowd: null, home, away, score, periods, teamStats,
    playerColumns: ['선수', '시간', '득점', '리바', '어시', '스틸', '3점'],
    players: [...top5('home', homeBox), ...top5('away', awayBox)], timeline: [],
    ai: {
      date: r.date, stage, venue: r.venue, home: home.name, away: away.name, score, mvp: r.mvp,
      quarters: { labels: periods.labels, home: periods.home, away: periods.away },
      teamStats: { [home.name]: teamRow(home.name, h), [away.name]: teamRow(away.name, a) },
      players: [...homeBox.players.filter(played).map((p) => aiPlayer(p, home.name)), ...awayBox.players.filter(played).map((p) => aiPlayer(p, away.name))],
    },
    source: { name: SOURCE_NAME, url: `${ORIGIN}${resultPath(ref)}` },
  };
}
