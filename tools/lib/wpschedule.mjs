/* 바로스포츠티비 — 워드프레스용 일정 JSON (data/wp/)
   ==================================================================
   barosportstv.com 은 워드프레스다. 그쪽 테마가 이 파일들을 받아 PHP 로 일정 화면을 그린다.

   ⚠️ 판정(상태·시각·한글 팀명·리그 등급·정렬)은 여기서 다시 쓰지 않는다.
     정적 사이트의 assets/data.js 를 vm 에서 **그대로** 돌려 그 결과만 옮긴다.
     PHP 나 여기에 같은 규칙을 한 벌 더 두면 반드시 어긋난다 — 연기 경기 점수,
     여자부 팀명, 「시간 미정」 같은 규칙이 실측으로 하나씩 쌓인 것이다.

   ⚠️ 시간대는 Asia/Seoul 고정이다. data.js 는 「브라우저 현지 시각」으로 날짜를 나누므로
     돌리는 동안만 process.env.TZ 를 바꾸고 끝나면 되돌린다.
   ================================================================== */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';

const TIMEZONE = 'Asia/Seoul';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;   // 서머타임 없음

function pad(n) { return String(n).padStart(2, '0'); }

/* now 가 한국에서 며칠인지 — 프로세스 시간대와 무관하게 계산한다 */
function kstDayKeys(now, days) {
  const base = new Date(now.getTime() + KST_OFFSET_MS);
  const keys = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    keys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
  }
  return keys;
}

/* data.js 를 브라우저처럼 돌린다. 네트워크 대신 dataDir 의 프리베이크 파일을 읽는다. */
async function loadArena(root, dataDir) {
  const win = {
    fetch: async (url) => {
      const file = String(url).replace(/^\.\/data\//, '');
      try {
        const text = await readFile(join(dataDir, file), 'utf8');
        return { ok: true, json: async () => JSON.parse(text) };
      } catch {
        return { ok: false, json: async () => null };
      }
    },
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, readyState: 'complete', title: '' },
    location: { search: '', pathname: '/schedule.html', href: 'http://x/schedule.html' },
    console
  };
  win.window = win; win.self = win; win.globalThis = win;
  win.Promise = Promise; win.URLSearchParams = URLSearchParams; win.Date = Date;
  const ctx = vm.createContext(win);
  for (const f of ['assets/apipath.js', 'assets/leagues.js', 'assets/teams.js', 'assets/data.js']) {
    vm.runInContext(await readFile(join(root, f), 'utf8'), ctx, { filename: f });
  }
  if (!win.ArenaData || !win.ArenaLeagues) throw new Error('data.js 를 vm 에 올리지 못했다');
  return win;
}

function hasScore(v) {
  return v !== null && v !== undefined && v !== '';
}

function toRow(A, L, ev) {
  const state = A.statusOf(ev);
  const clock = A.clockText(ev);
  /* 종료로 판정돼도 점수가 비어 오는 경기가 있다 — String(null) 이 「null - null」 로 찍히지 않게 */
  const scored = (state === 'live' || state === 'finished') &&
                 hasScore(ev.intHomeScore) && hasScore(ev.intAwayScore);
  /* 시각을 모르는 경기(「시간 미정」)와 연기·취소 경기는 시각을 내보내지 않는다.
     API 는 00:00 을 채워 보내는데, 그대로 두면 <time>·JSON-LD 가 검색엔진에 거짓 시각을 알린다. */
  const t = (state === 'postponed' || clock === '시간 미정') ? null : A.localTime(ev);
  return {
    id: String(ev.idEvent || ''),
    sport: ev.strSport || '',
    league: ev.strLeague || '',
    leagueLabel: A.leagueLabel(ev.strLeague),
    slug: A.leagueSlug(ev.strLeague),
    tier: L.tier(ev.strLeague),
    state,
    clock,
    home: A.teamName(ev.strHomeTeam),
    away: A.teamName(ev.strAwayTeam),
    homeScore: scored ? String(ev.intHomeScore) : null,
    awayScore: scored ? String(ev.intAwayScore) : null,
    kickoff: t ? t.toISOString() : null
  };
}

async function writeJson(file, json) {
  await writeFile(file, JSON.stringify(json), 'utf8');
}

/* 경기 목록(eventsday) 굽기가 하나라도 실패했으면 이번 회차는 워드프레스용을 만들지 않는다.
   만들면 한 종목이 통째로 빠진 날 파일이 「정상」으로 넘어가 워드프레스의 멀쩡한 사본을 덮는다.
   안 만들면 워드프레스는 index 404 를 받고 지난 데이터를 그대로 둔다(2시간이 지나면 안내를 띄운다). */
export function incompleteInput(failed) {
  const miss = (failed || []).filter((f) => String(f).startsWith('eventsday.php'));
  return miss.length ? `eventsday 실패 ${miss.length}건` : null;
}

/* 프리베이크가 부르는 입구. 여기서 무엇이 터져도 배포 전체(정적 사이트·데이터)를 멈추지 않는다. */
export async function tryBuildWpSchedule(opts) {
  try {
    return { ok: true, ...(await buildWpSchedule(opts)) };
  } catch (err) {
    await rm(join(opts.dataDir, 'wp'), { recursive: true, force: true });   // 반쪽 파일을 남기지 않는다
    return { ok: false, error: String((err && err.message) || err), days: [], counts: [] };
  }
}

export async function buildWpSchedule({ root, dataDir, now = new Date(), days = 5 }) {
  const before = process.env.TZ;
  process.env.TZ = TIMEZONE;
  try {
    const win = await loadArena(root, dataDir);
    const A = win.ArenaData;
    const keys = kstDayKeys(now, days);
    const out = join(dataDir, 'wp');
    await rm(out, { recursive: true, force: true });   // 지난 회차 날짜 파일을 남기지 않는다 (quick 회차는 data/ 를 통째로 지우지 않는다)
    await mkdir(out, { recursive: true });

    const counts = [];
    for (const key of keys) {
      const [y, m, d] = key.split('-').map(Number);
      const events = A.byInterest(await A.eventsForLocalDay(new Date(y, m - 1, d)));
      const rows = events.map((ev) => toRow(A, win.ArenaLeagues, ev));
      await writeJson(join(out, `day-${key}.json`), { date: key, events: rows });
      counts.push(rows.length);
    }
    await writeJson(join(out, 'index.json'), { generatedAt: now.toISOString(), timezone: TIMEZONE, days: keys });
    return { days: keys, counts };
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
