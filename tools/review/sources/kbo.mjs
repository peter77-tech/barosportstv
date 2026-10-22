/* KBO 수집기. 재료는 TheSportsDB 뿐이다 — koreabaseball.com 에는 요청을 보내지 않고 링크(source.url)만 만든다 (§3, §5.2).
   TheSportsDB 는 포스트시즌 여부를 알려 주지 않으므로 stage 는 null 이다. */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const KBO_LEAGUE_ID = 4830;
const GAP_MS = 700;                     // 사이트 요청 사이 최소 간격
const FINISHED = ['FT', 'AOT'];         // 실측: 끝난 경기 strStatus = 'FT'. AOT 는 연장 종료 표기(data.js FINISHED 와 같은 뜻)
const SOURCE_NAME = 'TheSportsDB';

/* assets/teams.js 는 window 에 ArenaTeams 를 거는 브라우저 IIFE 다 — 빈 window 를 주고 vm 으로 돌린다. */
const ArenaTeams = (() => {
  const win = {};
  win.window = win;
  const file = fileURLToPath(new URL('../../../assets/teams.js', import.meta.url));
  vm.runInNewContext(readFileSync(file, 'utf8'), win, { filename: file });
  return win.ArenaTeams;
})();

/* TheSportsDB 구장 영문 → 한글. 표에 없으면 원문을 쓴다. */
const VENUES = {
  'Jamsil Baseball Stadium': '잠실야구장',
  'Gocheok Sky Dome': '고척스카이돔',
  'Incheon SSG Landers Field': '인천SSG랜더스필드',
  'Suwon KT Wiz Park': '수원KT위즈파크',
  'Daejeon Hanwha Life Ballpark': '대전한화생명볼파크',
  'Daegu Samsung Lions Park': '대구삼성라이온즈파크',
  'Gwangju-Kia Champions Field': '광주-기아 챔피언스 필드',
  'Sajik Baseball Stadium': '사직야구장',
  'Changwon NC Park': '창원NC파크',
};

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const dateOf = (e) => e.dateEventLocal || e.dateEvent;   // 한국 현지 날짜

function isFinished(e) {
  return FINISHED.includes(String(e.strStatus || '').toUpperCase()) &&
    e.strPostponed !== 'yes' && isNum(e.intHomeScore) && isNum(e.intAwayScore);
}

function toGame(e) {
  return {
    league: 'kbo', gameKey: `kbo-${String(e.idEvent).replace(/[^0-9A-Za-z-]/g, '')}`,
    date: dateOf(e), home: e.strHomeTeam, away: e.strAwayTeam,
    homeScore: Number(e.intHomeScore), awayScore: Number(e.intAwayScore),
    stage: null, ref: { event: e },
  };
}

/** days(한국 날짜들)의 끝난 KBO 경기. 날짜마다 한 번 요청하고 요청 사이 700ms 를 둔다. */
export async function listFinished(days, { key, fetchImpl = fetch, sleep = realSleep } = {}) {
  const games = [];
  for (let i = 0; i < days.length; i++) {
    if (i > 0) await sleep(GAP_MS);
    const url = `https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${days[i]}&l=${KBO_LEAGUE_ID}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`TheSportsDB ${res.status}: KBO ${days[i]}`);
    const json = await res.json();
    for (const e of (json && json.events) || []) {
      if (dateOf(e) === days[i] && isFinished(e)) games.push(toGame(e));
    }
  }
  return games;
}

/* "<팀> Innings:<br>0 0 ...<br>Hits: 8 - Errors: 1<br><br><팀> Innings:..." 첫 블록 = 홈. 못 읽으면 null. */
function parseLineScore(text) {
  const blocks = String(text || '').split(/<br\s*\/?>\s*<br\s*\/?>/);
  const rows = [];
  for (const b of blocks) {
    const m = b.match(/Innings:\s*<br\s*\/?>\s*([\dxX\s-]*?)\s*<br\s*\/?>\s*Hits:\s*(\d+)\s*-\s*Errors:\s*(\d+)/);
    if (!m) return null;
    const runs = m[1].trim().split(/\s+/).filter(Boolean).map((t) => (/^\d+$/.test(t) ? Number(t) : null));
    rows.push({ runs, hits: Number(m[2]), errors: Number(m[3]) });
  }
  return rows.length === 2 ? { home: rows[0], away: rows[1] } : null;
}

const firstWord = (s) => String(s).split(/\s+/)[0];

function sideOf(english) {
  const name = ArenaTeams.ko(english);
  return { name, short: firstWord(name), full: null };
}

/** TheSportsDB 이벤트 하나 → MatchFacts. 순수 함수. */
export function toFacts(e) {
  const home = sideOf(e.strHomeTeam);
  const away = sideOf(e.strAwayTeam);
  const score = { home: Number(e.intHomeScore), away: Number(e.intAwayScore) };
  const ls = parseLineScore(e.strResult);
  const n = ls ? Math.max(ls.home.runs.length, ls.away.runs.length) : 0;
  const pad = (runs) => Array.from({ length: n }, (_, i) => (i < runs.length ? runs[i] : null));
  const periods = ls
    ? { labels: Array.from({ length: n }, (_, i) => String(i + 1)), home: pad(ls.home.runs), away: pad(ls.away.runs) }
    : { labels: [], home: [], away: [] };
  const scoring = (runs) => runs.filter((r) => r > 0).length;
  const teamStats = [{ label: '득점', home: score.home, away: score.away }];
  if (ls) {
    teamStats.push({ label: '안타', home: ls.home.hits, away: ls.away.hits });
    teamStats.push({ label: '실책', home: ls.home.errors, away: ls.away.errors, lowerBetter: true });
    teamStats.push({ label: '득점 이닝', home: scoring(ls.home.runs), away: scoring(ls.away.runs) });
  }
  const date = dateOf(e);
  const venue = VENUES[e.strVenue] || e.strVenue || '';
  return {
    league: 'kbo', gameKey: toGame(e).gameKey, date, stage: null,
    venue, crowd: isNum(e.intSpectators) ? Number(e.intSpectators) : null,
    home, away, score, periods, teamStats,
    playerColumns: [], players: [], timeline: [],
    ai: {
      date, venue, home: home.name, away: away.name, score,
      innings: { labels: periods.labels, home: periods.home, away: periods.away },
      hits: ls ? { home: ls.home.hits, away: ls.away.hits } : null,
      errors: ls ? { home: ls.home.errors, away: ls.away.errors } : null,
    },
    source: { name: SOURCE_NAME, url: `https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameDate=${date.replace(/-/g, '')}` },
  };
}

/** 목록 단계에서 이미 받은 이벤트를 쓰므로 추가 요청은 없다. */
export async function fetchFacts(game) {
  return toFacts(game.ref.event);
}
