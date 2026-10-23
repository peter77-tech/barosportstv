/* KBL 수집기 (api.kbl.or.kr 공식 기록). 목록 1번(날짜 범위) + 경기당 3번(match · team-record · player-stat).
   🔴 Channel·TeamCode·lang·Origin·Referer 헤더가 없으면 400 (실측). 모든 요청에 붙인다.
   본문 팀 이름 = 공식 짧은 이름 그대로(`서울 삼성`). full 은 네이버 짝짓기 단계에서 채운다. */

const BASE = 'https://api.kbl.or.kr';
const GAP_MS = 700;                      // 사이트 요청 사이 최소 간격 (공통 제약)
const SOURCE_NAME = 'KBL 공식 기록';
const HEADERS = {
  Channel: 'WEB', TeamCode: 'XX', lang: 'ko',
  Origin: 'https://www.kbl.or.kr', Referer: 'https://www.kbl.or.kr/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
/* 컵·시범·EASL(아시아 클럽전) 같은 나머지는 쓰지 않는다 (§3). seasonCategoryName 실측값 기준. */
const STAGES = new Set(['정규시즌', '플레이오프', '챔피언결정전']);

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* api.kbl.or.kr 로 나가는 모든 요청 사이 GAP_MS. 호출 사이에도 이어지도록 모듈 전역에 마지막 요청 시각을 둔다. */
let lastRequestAt = -Infinity;

/** 테스트용: 전역 간격 기록을 지운다. */
export function resetKblThrottle() { lastRequestAt = -Infinity; }

async function get(path, { fetchImpl, sleep, now }) {
  const wait = GAP_MS - (now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = now();
  const res = await fetchImpl(`${BASE}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`KBL ${res.status}: ${path}`);
  return res.json();
}

const compact = (d) => d.replace(/-/g, '');                            // 'YYYY-MM-DD' → 'YYYYMMDD'
const isoDate = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/** days(한국 날짜들)의 끝난 KBL 경기(정규시즌·플레이오프·챔피언결정전). 가장 이른 날~늦은 날을 한 번에 요청한다. */
export async function listFinished(days, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const want = new Set(days);
  const sorted = [...want].sort();
  const rows = await get(`/match/list?fromDate=${compact(sorted[0])}&toDate=${compact(sorted[sorted.length - 1])}`, { fetchImpl, sleep, now });
  const games = [];
  for (const it of rows) {
    const date = isoDate(String(it.gameDate));
    if (!want.has(date) || it.isEnded !== 1 || !STAGES.has(it.seasonCategoryName)) continue;
    games.push({
      league: 'kbl', gameKey: `kbl-${String(it.gmkey).replace(/[^0-9A-Za-z-]/g, '')}`, date,
      home: it.tnameH, away: it.tnameA,
      homeScore: Number(it.scoreH), awayScore: Number(it.scoreA),
      stage: it.seasonCategoryName, ref: { gmkey: it.gmkey },
    });
  }
  return games;
}

/** 경기당 3번: 경기 정보(쿼터 점수) · 팀 기록 · 선수 기록. */
export async function fetchFacts(game, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const io = { fetchImpl, sleep, now };
  const p = `/match/${game.ref.gmkey}`;
  const match = await get(p, io);
  const teamRecord = await get(`${p}/team-record`, io);
  const playerStat = await get(`${p}/player-stat`, io);
  return toFacts({ game, match, teamRecord, playerStat });
}

const pct = (n, d) => (d > 0 ? (Math.round((n / d) * 1000) / 10).toFixed(1) : '0.0');
const ratio = (acc, all) => `${acc}/${all} (${pct(acc, all)}%)`;
const clock = (r) => `${r.playMin}:${String(r.playSec).padStart(2, '0')}`;
const played = (p) => p.records.playMin > 0 || p.records.playSec > 0;

/* 기록의 fg 는 2점(fgt 는 야투 전체, fgt = fg + threep — 실측). */
const teamRow = (name, r) => ({
  name, score: r.score,
  fieldGoals: ratio(r.fgt, r.fgtA), twoPoint: ratio(r.fg, r.fgA), threePoint: ratio(r.threep, r.threepA),
  freeThrows: ratio(r.ft, r.ftA),
  rebounds: r.rb, offensiveRebounds: r.offr, assists: r.ast, steals: r.stl, blocks: r.bs,
  turnovers: r.to, fouls: r.foul,
  pointsInPaint: r.pscore, fastBreakPoints: r.fbScoreCn, pointsOffTurnovers: r.turnoverScoreCn,
  secondChancePoints: r.secChanceScoreCn, benchPoints: r.benchScoreCn,
  maxLead: r.maxLeadScoreCn, maxRun: r.maxContiScoreCn,
});

/* KBL 은 +/- 를 모를 때 999 를 넣는다(실측: 뛴 선수에게도 나온다). 표에는 '-', AI 에는 null. */
const NO_MARGIN = 999;
const margin = (v) => (v === NO_MARGIN || v === null || v === undefined ? null : v);

const aiPlayer = (p) => {
  const r = p.records;
  return {
    name: p.player.pname, team: p.player.tname, pos: p.player.pos, starter: p.startFlag === 1, minutes: clock(r),
    points: r.score, rebounds: r.rb, assists: r.ast, steals: r.stl, blocks: r.bs, turnovers: r.to, fouls: r.foul,
    twoPoint: ratio(r.fg, r.fgA), threePoint: ratio(r.threep, r.threepA), freeThrows: ratio(r.ft, r.ftA),
    plusMinus: margin(r.marginCn),
  };
};

const playerRow = (p) => {
  const r = p.records;
  return {
    side: p.homeAway === '1' ? 'home' : 'away', name: p.player.pname,
    cells: [p.player.pname, clock(r), r.score, r.rb, r.ast, r.stl, `${r.threep}/${r.threepA}`, margin(r.marginCn) ?? '-'],
  };
};

/** { game, match, teamRecord, playerStat } → MatchFacts. 순수 함수. 각 인자는 해당 API 응답 그대로. */
export function toFacts({ game, match, teamRecord, playerStat }) {
  const g = match.game;
  const home = { name: g.tnameH, short: g.tnameH, full: null };
  const away = { name: g.tnameA, short: g.tnameA, full: null };
  const score = { home: game.homeScore, away: game.awayScore };

  const qh = match.teamrecords.home, qa = match.teamrecords.away;
  const ot = Math.max((qh.scoreeq || []).length, (qa.scoreeq || []).length);
  const labels = ['1Q', '2Q', '3Q', '4Q', ...Array.from({ length: ot }, (_, i) => `OT${i + 1}`)];
  const line = (q) => [q.scoreq1, q.scoreq2, q.scoreq3, q.scoreq4, ...Array.from({ length: ot }, (_, i) => (q.scoreeq || [])[i] ?? null)];
  const periods = { labels, home: line(qh), away: line(qa) };

  const byCode = (code) => teamRecord.find((t) => t.tcode === code).records;
  const h = byCode(g.tcodeH), a = byCode(g.tcodeA);
  const row = (label, f, extra) => ({ label, home: f(h), away: f(a), ...extra });
  const teamStats = [
    row('야투', (r) => ratio(r.fgt, r.fgtA)),
    row('2점슛', (r) => ratio(r.fg, r.fgA)),
    row('3점슛', (r) => ratio(r.threep, r.threepA)),
    row('리바운드', (r) => r.rb),
    row('어시스트', (r) => r.ast),
    row('턴오버', (r) => r.to, { lowerBetter: true }),
    row('턴오버 유도 득점', (r) => r.turnoverScoreCn),
    row('벤치 득점', (r) => r.benchScoreCn),
  ];

  const sideOf = (p) => (p.homeAway === '1' ? 'home' : 'away');
  const top5 = (side) => playerStat.filter((p) => sideOf(p) === side)
    .sort((x, y) => y.records.score - x.records.score).slice(0, 5);
  const players = [...top5('home'), ...top5('away')].map(playerRow);

  const crowd = Number.isFinite(Number(g.crowds)) && g.crowds !== null ? Number(g.crowds) : null;
  const venue = g.stadiumnameF || g.stadiumname || '';
  return {
    league: 'kbl', gameKey: game.gameKey, date: game.date, stage: game.stage,
    venue, crowd, home, away, score, periods, teamStats,
    playerColumns: ['선수', '시간', '득점', '리바', '어시', '스틸', '3점', '+/-'],
    players, timeline: [],
    ai: {
      date: game.date, stage: game.stage, venue, home: home.name, away: away.name, score,
      quarters: { labels, home: periods.home, away: periods.away },
      teamStats: { [home.name]: teamRow(home.name, h), [away.name]: teamRow(away.name, a) },
      players: playerStat.filter(played).map(aiPlayer),
    },
    source: { name: SOURCE_NAME, url: `https://www.kbl.or.kr/game/record/${g.gmkey}` },
  };
}
