/* V리그(KOVO) 수집기 — 남자부(gender '1' → vm) · 여자부(gender '2' → vw). 공식 user-api, JSON.

   🔴 실측한 구조 (2026-10-23, 2025-26 시즌 gnum 262 · 265 / 2026-27 개막 전 목록):
   - 목록 `GET /stat/game-schedule?gcode=001&seasonCode=NNN&size=500` 한 번에 남·여 전 경기가 같이 온다(행의 gender 로 가른다).
     상세 `GET /stat/game-schedule/{gnum}?gcode=001&seasonCode=NNN` → payload { game, player[], team[], ranking }.
     🔴 쿼리에 다른 값(gender·round 등)을 더하면 404 라고 했으므로 위 두 모양만 쓴다. 헤더 `Origin: https://kovo.co.kr` 필요.
   - 🔴 `Accept-Language: ko-KR` 를 주면 hsname/asname/tsname 이 「대한항공」 같은 한글 짧은 이름이고 선수 이름(pname)도 한글이다
     (안 주면 「KOREAN AIR」·「Dong Hyeok Im」). 짧은 표기는 hsname/asname, 정식 이름 hname/aname 은 쓰지 않는다.
   - gnum 은 시즌 안에서 남·여를 통틀어 겹치지 않는다(올스타전만 둘 다 1·2). 그래서 상세는 gnum 하나로 찾고, 올스타는 목록에서 뺀다.
   - 시즌 코드: 2025-26 = 022, 2026-27 = 023. 새 시즌은 10월에 열리므로 다음 코드(024…)도 같이 물어 비어 있으면 넘어간다.
   - leagueCode: 201 정규시즌 · 204 준플레이오프 · 202 플레이오프 · 203 챔피언결정전 · 801 올스타전(쓰지 않음).
     🔴 컵대회(KOVO컵)는 gcode=001 목록에 없다(gcode 001~300 × 시즌 018~023 을 훑어 001 만 비어 있지 않았다). 그래서 gcode 는 001 하나만
     쓰고, 알려진 leagueCode 가 아닌 행(컵이 섞여 들어와도)도 버린다 (§3).
   - 끝남: 명시 상태 칸은 없지만 끝난 행은 result 가 W/L, getime(끝난 시각)이 차고 세트 점수(hspoint:aspoint)에서 한쪽이 3 이다.
     예정 행은 result·getime·score 가 빈 문자열 · 세트 0:0. 이 셋이 모두 맞아야 끝난 경기로 본다(시각 추정은 쓰지 않는다).
   - 세트 점수 hs1point..hs5point / as1point..as5point(안 한 세트는 0). 선수·팀 기록 칸: point 득점, att/ats 공격 시도/성공, atsp 성공률,
     ss 서브 득점, bs 블로킹 득점, rt/rs/rf 리시브 시도/정확/실패(효율 = (rs-rf)/rt), ds 디그 성공, err 범실.
     팀 득점 = 공격 득점 + 서브 득점 + 블로킹 득점 + 상대 범실 (262: 107 = 61+4+9+33).
   - 구조가 기대와 다르면 추측하지 않고 던진다. */

const ORIGIN = 'https://user-api.kovo.co.kr';
const GAP_MS = 700;                      // 사이트 요청 사이 최소 간격 (공통 제약)
const GCODE = '001';                     // V-리그. 컵대회 gcode 는 쓰지 않는다
const SEASON_CODE = '023';               // 2026-27
const SOURCE_NAME = 'KOVO 공식 기록';
/* 경기별 기록 페이지: 사이트 일정 화면의 「상세 결과」 버튼이 여는 주소를 사이트 번들(index-*.js)에서 읽어 그대로 만든다
   (끝난 경기 → `/games/v-leagues/schedules/{gnum}?gcode&seasonCode&leagueCode&round`). */
const recordUrl = (g) => `https://kovo.co.kr/games/v-leagues/schedules/${g.gnum}?gcode=${GCODE}&seasonCode=${g.seasonCode}&leagueCode=${g.leagueCode}&round=${g.round}`;
const HEADERS = {
  Origin: 'https://kovo.co.kr',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const STAGES = { 201: '정규시즌', 204: '준플레이오프', 202: '플레이오프', 203: '챔피언결정전' };
const LEAGUE_OF = { 1: 'vm', 2: 'vw' };

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* user-api.kovo.co.kr 로 나가는 모든 요청 사이 GAP_MS. 호출 사이에도 이어지도록 모듈 전역에 마지막 요청 시각을 둔다. */
let lastRequestAt = -Infinity;

/** 테스트용: 전역 간격 기록을 지운다. */
export function resetKovoThrottle() { lastRequestAt = -Infinity; }

/* 모든 요청이 지나는 단 하나의 길목: 간격 대기 → 요청 → res.ok 확인 → payload. */
async function request(path, { fetchImpl, sleep, now }) {
  const wait = GAP_MS - (now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = now();
  const res = await fetchImpl(`${ORIGIN}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`KOVO ${res.status}: ${path}`);
  const body = await res.json();
  if (!body || typeof body !== 'object' || !('payload' in body)) throw fail('payload');
  return body.payload;
}

const fail = (what) => new Error(`KOVO 응답 구조를 읽지 못했다: ${what}`);

const nextSeason = (code) => String(Number(code) + 1).padStart(3, '0');
const SET_NUMBERS = [1, 2, 3, 4, 5];
const setPoints = (g, side) => SET_NUMBERS.map((n) => g[`${side}${n}point`]);
const wonSets = (g) => SET_NUMBERS.filter((n) => g[`hs${n}point`] > g[`as${n}point`]).length;

/* 끝난 경기: result W/L · 끝난 시각 · 한쪽 3세트 승 (파일 머리 주석). */
function isFinished(r) {
  return (r.result === 'W' || r.result === 'L') && typeof r.getime === 'string' && r.getime.trim() !== ''
    && Math.max(r.hspoint, r.aspoint) === 3 && Math.min(r.hspoint, r.aspoint) <= 2;
}

const gameKeyOf = (league, seasonCode, gnum) => `${league}-${seasonCode}-${gnum}`;

/** days(한국 날짜들)의 끝난 V리그 경기. gender '1' = 남(vm), '2' = 여(vw). 시즌 코드당 1번 요청(다음 시즌 확인 포함 2번). */
export async function listFinished(days, { gender, fetchImpl = fetch, sleep = realSleep, now = Date.now, seasonCode = SEASON_CODE } = {}) {
  const league = LEAGUE_OF[gender];
  if (!league) throw new Error(`KOVO gender 는 '1'(남) 또는 '2'(여): ${gender}`);
  const io = { fetchImpl, sleep, now };
  const want = new Set(days);
  const games = [];
  const seen = new Set();
  const pull = async (code) => {
    const payload = await request(`/stat/game-schedule?gcode=${GCODE}&seasonCode=${code}&size=500`, io);
    if (!Array.isArray(payload?.content)) throw fail('경기 목록');
    return payload.content;
  };
  for (const code of [seasonCode, nextSeason(seasonCode)]) {
    let content;
    if (code === seasonCode) content = await pull(code);       // 현재 시즌 실패는 그대로 던진다
    else {
      try { content = await pull(code); } catch { continue; }  // 아직 열리지 않은 다음 시즌은 404·빈 응답일 수 있다 → 건너뛴다
    }
    for (const r of content) {
      if (String(r.gender) !== gender || !STAGES[r.leagueCode] || !want.has(r.gdate) || !isFinished(r)) continue;
      const gameKey = gameKeyOf(league, r.seasonCode, r.gnum);
      if (seen.has(gameKey)) continue;                        // 같은 경기가 두 시즌 요청에 다시 나와도 한 번만
      seen.add(gameKey);
      games.push({
        league, gameKey, date: r.gdate,
        home: r.hsname, away: r.asname, homeScore: r.hspoint, awayScore: r.aspoint,
        stage: STAGES[r.leagueCode], ref: { gnum: r.gnum, gcode: GCODE, seasonCode: r.seasonCode },
      });
    }
  }
  return games;
}

/** 경기당 1번: 상세(경기·선수·팀 기록). 목록 행과 같은 내용이 detail.game 에 들어 있어 그것을 쓴다. */
export async function fetchFacts(game, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const r = game.ref;
  const detail = await request(`/stat/game-schedule/${r.gnum}?gcode=${r.gcode}&seasonCode=${r.seasonCode}`, { fetchImpl, sleep, now });
  return toFacts({ schedule: detail?.game, detail });
}

const pct = (n, d) => (d > 0 ? `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%` : '-');
const receptionEff = (t) => pct(t.rs - t.rf, t.rt);   // 리시브 효율 = (정확 - 실패) / 시도 (분자가 음수면 음수 % 로 나온다)

/** { schedule: 목록 행, detail: 상세 payload } → MatchFacts. 순수 함수. */
export function toFacts({ schedule: s, detail }) {
  const g = detail?.game;
  if (!s || !g || g.gnum !== s.gnum || String(g.gender) !== String(s.gender)) throw fail('목록 행과 상세 경기가 다름');
  const league = LEAGUE_OF[s.gender];
  const stage = STAGES[s.leagueCode];
  if (!league || !stage) throw fail('남녀·대회 구분');
  const played = s.hspoint + s.aspoint;
  const hs = setPoints(s, 'hs').slice(0, played), as = setPoints(s, 'as').slice(0, played);
  const homeSets = hs.filter((p, i) => p > as[i]).length;
  if (played < 3 || played > 5 || hs.some((p, i) => !(p > 0 || as[i] > 0)) || homeSets !== s.hspoint || played - homeSets !== s.aspoint) {
    throw fail('세트 점수가 세트 승수와 어긋남');
  }
  const home = { name: s.hsname, short: s.hsname, full: null };
  const away = { name: s.asname, short: s.asname, full: null };
  const teamOf = (code) => detail.team?.find((t) => t.tcode === code);
  const ht = teamOf(s.hcode), at = teamOf(s.acode);
  if (!ht || !at) throw fail('팀 기록');
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  if (ht.point !== sum(hs) || at.point !== sum(as)) throw fail('팀 득점이 세트 점수 합과 어긋남');

  const row = (label, f, extra) => ({ label, home: f(ht, at), away: f(at, ht), ...extra });
  const teamStats = [
    row('공격 성공률', (t) => pct(t.ats, t.att)),
    row('득점', (t) => t.point),
    row('서브', (t) => t.ss),
    row('블로킹', (t) => t.bs),
    row('리시브 효율', (t) => receptionEff(t)),
    row('디그', (t) => t.ds),
    row('범실', (t) => t.err, { lowerBetter: true }),
    row('상대 범실 득점', (_t, o) => o.err),   // 상대가 범한 실수로 얻은 득점 = 상대 범실
  ];

  const side = (code) => (code === s.hcode ? 'home' : code === s.acode ? 'away' : null);
  const roster = (detail.player ?? []).map((p) => ({ ...p, side: side(p.tcode) }));
  if (roster.some((p) => !p.side)) throw fail('선수의 팀');
  const nameOf = (sd) => (sd === 'home' ? home.name : away.name);
  const top5 = (sd) => roster.filter((p) => p.side === sd).sort((a, b) => b.point - a.point).slice(0, 5)
    .map((p) => ({ side: sd, name: p.pname, cells: [p.pname, nameOf(sd), p.point, pct(p.ats, p.att), p.ss, p.bs] }));
  const active = (p) => p.point > 0 || p.att > 0 || p.st > 0 || p.bt > 0 || p.rt > 0 || p.dt > 0;
  const aiPlayer = (p) => ({
    name: p.pname, team: nameOf(p.side), position: p.position, points: p.point,
    attackAttempts: p.att, attackKills: p.ats, attackRate: pct(p.ats, p.att), serveAces: p.ss, blocks: p.bs,
    receptions: p.rt, receptionEfficiency: receptionEff(p), digs: p.ds, errors: p.err,
  });
  const aiTeam = (t, o, name) => ({
    name, points: t.point, attackRate: pct(t.ats, t.att), attackKills: t.ats, serveAces: t.ss, blocks: t.bs,
    receptionEfficiency: receptionEff(t), digs: t.ds, errors: t.err, opponentErrors: o.err,
  });

  return {
    league, gameKey: gameKeyOf(league, s.seasonCode, s.gnum), date: s.gdate, stage,
    venue: s.place, crowd: s.spectators > 0 ? s.spectators : null, home, away,
    score: { home: s.hspoint, away: s.aspoint },
    periods: { labels: SET_NUMBERS.slice(0, played).map((n) => `${n}세트`), home: hs, away: as },
    teamStats,
    playerColumns: ['선수', '팀', '득점', '공격 성공률', '서브', '블로킹'],
    players: [...top5('home'), ...top5('away')], timeline: [],
    ai: {
      date: s.gdate, stage, round: s.roundName, venue: s.place, crowd: s.spectators > 0 ? s.spectators : null,
      home: home.name, away: away.name, score: { home: s.hspoint, away: s.aspoint },
      sets: hs.map((p, i) => ({ set: i + 1, home: p, away: as[i], minutes: Number(s[`s${i + 1}Ptime`]) })),
      teamStats: { [home.name]: aiTeam(ht, at, home.name), [away.name]: aiTeam(at, ht, away.name) },
      players: roster.filter(active).map(aiPlayer),
    },
    source: { name: SOURCE_NAME, url: recordUrl(s) },
  };
}
