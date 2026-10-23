/* K리그1 수집기 (kleague.com 공식 기록). 목록 1번(월 단위) + 경기당 3번(matchRecord·matchInfo·getMatchRecordAllDetail).
   🔴 Accept-Language: ko-KR,ko 가 없으면 팀·선수 이름이 영문으로 온다(실측). 모든 요청에 붙인다.
   본문 팀 이름 = 공식 한글 짧은 이름 그대로(`전북`). full 은 네이버 짝짓기 단계에서 채운다. */

const BASE = 'https://www.kleague.com';
const GAP_MS = 700;                      // 사이트 요청 사이 최소 간격 (공통 제약)
const SOURCE_NAME = 'K리그 공식 기록';
const HEADERS = {
  'Accept-Language': 'ko-KR,ko',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* kleague.com 으로 나가는 모든 요청 사이 GAP_MS. 호출 사이에도 이어지도록 모듈 전역에 마지막 요청 시각을 둔다. */
let lastRequestAt = -Infinity;

/** 테스트용: 전역 간격 기록을 지운다. */
export function resetKl1Throttle() { lastRequestAt = -Infinity; }

/* body: { json: {...} } 이면 JSON, 아니면 폼. 응답의 data 를 돌려준다. */
async function post(path, body, { fetchImpl, sleep, now }) {
  const wait = GAP_MS - (now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = now();
  const init = body.json
    ? { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body.json) }
    : { method: 'POST', headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body.form).toString() };
  const res = await fetchImpl(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`K리그 ${res.status}: ${path}`);
  const out = await res.json();
  if (!out || String(out.resultCode) !== '200' || !out.data) throw new Error(`K리그 응답 오류: ${path} ${out && out.resultCode}`);
  return out.data;
}

/* null·''·undefined 는 Number() 로 0 이 되므로 따로 막는다(골 칸이 빈 「종료」 경기 = 가짜 0:0). */
const isGoal = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const isoDate = (d) => String(d).replace(/\./g, '-');   // 'YYYY.MM.DD' → 'YYYY-MM-DD'

/** days(한국 날짜들)의 끝난 K리그1 경기. 달마다 한 번 요청한다. */
export async function listFinished(days, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const want = new Set(days);
  const months = [...new Set(days.map((d) => d.slice(0, 7)))];
  const games = [];
  for (const ym of months) {
    const [year, month] = ym.split('-');
    const data = await post('/getScheduleList.do', { json: { year, month, leagueId: '1' } }, { fetchImpl, sleep, now });
    for (const it of data.scheduleList || []) {
      const date = isoDate(it.gameDate);
      if (!want.has(date) || it.endYn !== 'Y' || !isGoal(it.homeGoal) || !isGoal(it.awayGoal)) continue;
      games.push({
        league: 'kl1', gameKey: `kl1-${String(it.gameId).replace(/[^0-9A-Za-z-]/g, '')}`, date,
        home: it.homeTeamName, away: it.awayTeamName,
        homeScore: Number(it.homeGoal), awayScore: Number(it.awayGoal),
        stage: null, ref: { item: it },
      });
    }
  }
  return games;
}

/** 경기당 3번: 팀 기록 · 이벤트 · 선수 기록. */
export async function fetchFacts(game, { fetchImpl = fetch, sleep = realSleep, now = Date.now } = {}) {
  const it = game.ref.item;
  const io = { fetchImpl, sleep, now };
  const base = { year: it.year, meetSeq: it.meetSeq, gameId: it.gameId };
  const record = await post('/api/ddf/match/matchRecord.do', { form: base }, io);
  const info = await post('/api/ddf/match/matchInfo.do', { form: base }, io);
  const detail = await post('/api/ddf/match/getMatchRecordAllDetail.do', {
    form: { ...base, yearTst: it.year, gameIdTst: it.gameId, homeTeam: it.homeTeam, awayTeam: it.awayTeam, roundId: it.roundId },
  }, io);
  return toFacts({ game, record, info, detail });
}

/* 하프 안 timeMin 이 45 를 넘으면 추가시간. 후반 timeMin 도 후반 시작부터 센다(교체 「후반 0분」). */
const minuteText = (m) => (m > 45 ? `45+${m - 45}` : String(m));

function eventLine(e) {
  const when = `${e.halfTypeName} ${minuteText(e.timeMin)}분`;
  // 첫 선수 = 나간 선수 (출전 시간과 일치, 실측)
  if (e.eventName === '교체') return `${when} 교체 ${e.teamName} ${e.playerName} (OUT) → ${e.playerName2} (IN)`;
  return `${when} ${e.eventName} ${e.teamName} ${e.playerName}`;
}

const TIMELINE_EVENTS = new Set(['득점', '도움', '경고', '퇴장', '교체']);

const pct = (n, d) => (d > 0 ? (Math.round((n / d) * 1000) / 10).toFixed(1) : '0.0');
const ratio = (acc, all) => `${acc}/${all} (${pct(acc, all)}%)`;

/* 합계 행(sumH/sumA)의 pcnt* 는 선수 비율의 합이라 틀리다 — 개수 필드만 쓰고 비율은 다시 계산한다 (§7.3). */
const aiWorthy = (p) => p.goal > 0 || p.assist > 0 || p.shotOnTarget > 0 || p.exAttKeyPass >= 2 ||
  p.tackleSuccess >= 3 || p.intercept >= 3 || p.yellowCard > 0 || p.redCard > 0;
const tableWorthy = (p) => p.goal > 0 || p.assist > 0 || p.exAttKeyPass >= 2;

const aiPlayer = (p) => ({
  name: p.playerName, team: p.teamName, pos: p.playerPos, minutes: p.minutePlay,
  goals: p.goal, assists: p.assist, shots: p.shot, shotsOnTarget: p.shotOnTarget, keyPasses: p.exAttKeyPass,
  passes: ratio(p.passAcc, p.pass), tackles: p.tackleSuccess, intercepts: p.intercept,
  aerialWon: p.airChalgWon, yellow: p.yellowCard, red: p.redCard,
});

/** { game, record, info, detail } → MatchFacts. 순수 함수. record·info·detail 은 각 응답의 data. */
export function toFacts({ game, record, info, detail }) {
  const it = game.ref.item;
  const home = { name: it.homeTeamName, short: it.homeTeamName, full: null };
  const away = { name: it.awayTeamName, short: it.awayTeamName, full: null };
  const score = { home: game.homeScore, away: game.awayScore };

  const halves = [info.firstHalf || [], info.secondHalf || []];
  const timeline = halves.flat().filter((e) => TIMELINE_EVENTS.has(e.eventName)).map(eventLine);

  /* 하프별 득점은 「득점」 이벤트의 팀 기준. 합이 최종 점수와 다르면(표기가 어긋난 자책골 등)
     틀린 숫자를 내지 않고 null 로 둔다. */
  const goals = { home: [0, 0], away: [0, 0] };
  halves.forEach((half, h) => {
    for (const e of half) {
      if (e.eventName !== '득점') continue;
      if (e.teamId === it.homeTeam) goals.home[h]++;
      else if (e.teamId === it.awayTeam) goals.away[h]++;
    }
  });
  const total = (a) => a[0] + a[1];
  const consistent = total(goals.home) === score.home && total(goals.away) === score.away;
  const periods = {
    labels: ['전반', '후반'],
    home: consistent ? goals.home : [null, null],
    away: consistent ? goals.away : [null, null],
  };

  const sh = detail.sumH, sa = detail.sumA;
  const rh = record.home, ra = record.away;
  const teamStats = [
    { label: '점유율', home: `${rh.possession}%`, away: `${ra.possession}%` },
    { label: '슈팅', home: rh.attempts, away: ra.attempts },
    { label: '유효슈팅', home: rh.onTarget, away: ra.onTarget },
    { label: '패스 성공', home: ratio(sh.passAcc, sh.pass), away: ratio(sa.passAcc, sa.pass) },
    { label: '키패스', home: sh.exAttKeyPass, away: sa.exAttKeyPass },
    { label: '코너킥', home: rh.corners, away: ra.corners },
    { label: '파울', home: rh.fouls, away: ra.fouls, lowerBetter: true },
    { label: '경고', home: rh.yellowCards, away: ra.yellowCards, lowerBetter: true },
  ];

  const sides = [['home', detail.listH || []], ['away', detail.listA || []]];
  const players = [];
  for (const [side, list] of sides) {
    for (const p of list.filter(tableWorthy)) {
      players.push({
        side, name: p.playerName,
        cells: [p.playerName, p.teamName, p.minutePlay, p.goal, p.assist,
          `${p.shot}(${p.shotOnTarget})`, p.exAttKeyPass, ratio(p.passAcc, p.pass)],
      });
    }
  }

  const venue = it.fieldNameFull || it.fieldName || '';
  const crowd = it.audienceQty === null || it.audienceQty === undefined || !Number.isFinite(Number(it.audienceQty))
    ? null : Number(it.audienceQty);
  return {
    league: 'kl1', gameKey: game.gameKey, date: game.date, stage: game.stage,
    venue, crowd, home, away, score, periods, teamStats,
    playerColumns: ['선수', '팀', '출전', '골', '도움', '슈팅(유효)', '키패스', '패스 성공'],
    players, timeline,
    ai: {
      date: game.date, venue, home: home.name, away: away.name, score,
      halves: { labels: periods.labels, home: periods.home, away: periods.away },
      teamStats: teamStats.map(({ label, home: h, away: a }) => ({ label, home: h, away: a })),
      timeline,
      players: sides.flatMap(([, list]) => list.filter(aiWorthy).map(aiPlayer)),
    },
    source: { name: SOURCE_NAME, url: `https://www.kleague.com/match.do?year=${it.year}&leagueId=1&gameId=${it.gameId}&meetSeq=${it.meetSeq}` },
  };
}
