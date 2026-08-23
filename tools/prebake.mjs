/* 바로스포츠티비 — 프리베이크
   ==================================================================
   GitHub Actions 가 10분마다 이 스크립트를 돌려 data/**.json 을 만든다.
   브라우저는 그 JSON 만 읽으므로 API 키가 브라우저에 나가지 않는다.

   ⚠️ 파일 이름 규칙은 assets/apipath.js 가 유일한 출처다. 여기서 직접
     경로를 만들지 마십시오 — 한쪽만 고치면 브라우저가 404 만 받고
     화면은 멀쩡한 채 하드코딩으로 되돌아갑니다.
   ================================================================== */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

import { createLimiter } from './lib/limiter.mjs';
import { collectTargets } from './lib/collect.mjs';
import { withRetry } from './lib/retry.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ArenaPath = require(join(ROOT, 'assets/apipath.js'));
const ArenaLeagues = require(join(ROOT, 'assets/leagues.js'));   // 리그 등급 — 굽는 범위를 좁히는 데 쓴다

const OUT = join(ROOT, 'data');
const SPORTS = ['Soccer', 'Basketball', 'Baseball', 'American Football'];

/* assets/teams.js 의 사전을 그대로 읽는다. 팀 목록을 두 번 적지 않기 위해서다.
   이 파일은 window 만 건드리고 DOM 을 쓰지 않으므로 vm 으로 안전하게 돈다. */
async function dictionaryTeams() {
  const src = await readFile(join(ROOT, 'assets/teams.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'teams.js' });
  const list = sandbox.window.ArenaTeams && sandbox.window.ArenaTeams.list;
  if (!Array.isArray(list) || !list.length) {
    throw new Error('assets/teams.js 에서 사전을 읽지 못했다');
  }
  return list.map((t) => t.en);
}

if (process.argv[2] === '--dict') {
  const names = await dictionaryTeams();
  console.log(`사전 ${names.length}팀:`, names.join(', '));
  process.exit(0);
}

/* ── UTC 날짜 ─────────────────────────────────────────── */
function utcKey(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/* ── 호출 ─────────────────────────────────────────────── */
const KEY = process.env.SPORTSDB_KEY;
if (!KEY) {
  console.error('SPORTSDB_KEY 가 없다. 무료 키로 조용히 떨어지지 않기 위해 중단한다.');
  process.exit(1);
}
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}/`;

const limit = createLimiter({ perMinute: Number(process.env.PREBAKE_PER_MINUTE || 90) });
const failed = [];

/* API 를 부르고 결과를 apipath 가 정한 파일에 쓴다.
   실패하면 파일을 만들지 않고 이름만 남긴다 — 브라우저는 404 를 받고
   하드코딩 화면을 그대로 둔다 (점진적 향상). */
async function bake(path) {
  const file = ArenaPath.fileFor(path);
  if (!file) throw new Error(`프리베이크하지 않는 엔드포인트: ${path}`);
  try {
    /* 429 는 기다리면 풀리므로 두 번까지 다시 부른다.
       재시도도 호출이니 제한기 **안쪽**에서 센다 — 바깥에 두면 재시도가
       분당 한도를 넘겨 429 를 더 부른다. */
    const json = await withRetry(() => limit(async () => {
      const res = await fetch(BASE + path);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }), { baseMs: Number(process.env.PREBAKE_RETRY_MS || 3000) });
    await write(file, json);
    return json;
  } catch (err) {
    failed.push(`${path} → ${err.message}`);
    return null;
  }
}

/* V2 는 키를 URL 이 아니라 헤더로 받는다. 경기 기록·주요 장면은 V1 이 어떤 경기에도
   주지 않아(실측 6건 전부 null) V2 로만 받을 수 있다.
   파일 이름은 apipath 가 정한 그대로다 — 브라우저는 지금처럼 V1 형태 키로 부른다. */
const V2 = 'https://www.thesportsdb.com/api/v2/json/';

async function bake2(v2path, keyPath) {
  const file = ArenaPath.fileFor(keyPath);
  if (!file) throw new Error(`프리베이크하지 않는 엔드포인트: ${keyPath}`);
  try {
    const json = await withRetry(() => limit(async () => {
      const res = await fetch(V2 + v2path, { headers: { 'X-API-KEY': KEY } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }), { baseMs: Number(process.env.PREBAKE_RETRY_MS || 3000) });
    /* 데이터가 없는 경기는 `{"Message":"No data found"}` 를 준다 — 파일을 만들지 않는다.
       브라우저는 404 를 받고 그 구역을 감춘다. */
    const rows = json && Array.isArray(json.lookup) ? json.lookup : null;
    if (!rows || !rows.length) return null;
    await write(file, { rows: rows });
    return rows;
  } catch (err) {
    failed.push(`${v2path} → ${err.message}`);
    return null;
  }
}

async function write(file, json) {
  const full = join(OUT, file);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(json), 'utf8');
}

/* ── 회차 모드 ─────────────────────────────────────────
   full  : 전부 굽는다. 호출 약 1,900건 · 실측 29분.
   quick : 경기·기록만 굽고 **팀·순위표는 지난 회차 파일을 그대로 쓴다.**
           호출 약 650건 · 실측 6분대.

   왜 나눴나: 팀 로고·이름·순위는 30분마다 바뀌는 값이 아니다. 그런데 사전이
   208팀으로 늘면서 팀 단계만 1,216건(608팀 × 2)이 되어 회차가 29분이 됐고
   30분 크론과 겹쳤다. 자주 바뀌는 것(점수·기록)만 자주 굽는다.

   ⚠️ quick 은 팀·순위표 폴더를 **지우지 않는다.** 배포 워크플로가 캐시에서
     되살려 주지 않으면 그 화면들이 하드코딩으로 돌아간다. */
const MODE = process.argv.includes('--quick') ? 'quick' : 'full';
const FRESH = ['eventsday', 'events', 'stats', 'timeline'];   // 매 회차 다시 굽는 것

/* ── 본체 ─────────────────────────────────────────────── */
if (MODE === 'full') {
  await rm(OUT, { recursive: true, force: true });   // 지난 회차 잔재를 남기지 않는다
} else {
  for (const dir of FRESH) await rm(join(OUT, dir), { recursive: true, force: true });
}
await mkdir(OUT, { recursive: true });
console.log(`회차 모드: ${MODE}`);

/* 경기 일정 화면은 날짜 칩 5개(오늘~+4일)를 쓰고, 한 번에 이틀씩 그린다(offset, offset+1).
   현지 하루는 UTC 사흘에 걸치므로 마지막 칩까지 누르면 UTC +6일까지 필요하다.
   여기를 좁히면 브라우저에 404 가 뜨고 다음 날 목록이 하드코딩으로 되돌아간다. */
const days = [-1, 0, 1, 2, 3, 4, 5, 6].map(utcKey);
console.log(`① 경기 목록 — 종목 ${SPORTS.length} × UTC ${days.length}일 (${days.join(', ')})`);

const lists = [];
for (const day of days) {
  for (const sport of SPORTS) {
    const json = await bake(`eventsday.php?d=${day}&s=${encodeURIComponent(sport)}`);
    lists.push((json && json.events) || []);
  }
}

const gotAny = lists.some((l) => l.length);
if (!gotAny) {
  console.error('경기 목록이 12건 전부 비었다. 키가 죽었을 가능성이 높아 배포를 중단한다.');
  process.exit(1);
}

const dict = await dictionaryTeams();
/* 팀 상한. 유료급 키로는 등장 팀이 4,700팀을 넘으므로 상한이 실제로 물린다.
   여기서 잘린 팀은 로고·한글명·순위가 없어 영문 그대로 나온다.
   올릴 때는 호출 수(팀당 2건: searchteams + eventsnext)와 크론 주기를 함께 본다. */
const cap = Number(process.env.PREBAKE_TEAM_CAP || 400);
const { events, teams, skippedTeams } = collectTargets(lists, dict, cap);
console.log(`② 경기 ${events.length}건 · 구울 팀 ${teams.length}팀 (사전 ${dict.length} + 등장 ${teams.length - dict.length}) · 상한 초과 ${skippedTeams.length}팀`);

/* ③ 경기 상세 — API 를 부르지 않는다. ①에서 받은 응답을 id 별로 쪼개 쓴다.
   data-pages.js 는 ?event= 가 「오늘 목록」에 없을 때만 lookupevent 를 부르는데,
   어제·내일 경기가 그 경우다. 그 정보는 ①의 응답에 이미 들어 있다. */
for (const ev of events) {
  await write(ArenaPath.fileFor(`lookupevent.php?id=${ev.idEvent}`), { events: [ev] });
}
console.log(`③ 경기 상세 ${events.length}건 (추가 호출 0건)`);

/* ④ 팀 허브 — searchteams → eventsnext, 그리고 리그 순위표.
   quick 회차에서는 건너뛰고 지난 회차 파일을 그대로 쓴다. */
const leagues = new Map();
let teamHit = 0;
for (const name of (MODE === 'quick' ? [] : teams)) {
  const json = await bake(`searchteams.php?t=${encodeURIComponent(name)}`);
  const team = json && json.teams && json.teams[0];
  if (!team) continue;
  teamHit++;
  if (team.idTeam) await bake(`eventsnext.php?id=${team.idTeam}`);
  if (team.idLeague && !leagues.has(team.idLeague)) leagues.set(team.idLeague, true);
}
console.log(MODE === 'quick'
  ? '④⑤ 팀·순위표 — 건너뜀 (지난 회차 파일을 그대로 쓴다)'
  : `④ 팀 ${teamHit}/${teams.length}팀 · 리그 ${leagues.size}개`);

/* ⑤ 리그 순위표. 시즌 추정값은 data-pages.js:334 의 기존 로직과 같게 둔다. */
const year = new Date().getUTCFullYear();
const seasons = [`${year}-${year + 1}`, String(year), `${year - 1}-${year}`];
let tableHit = 0;
for (const leagueId of leagues.keys()) {
  let hit = null;
  for (const season of seasons) {
    const json = await bake(`lookuptable.php?l=${leagueId}&s=${season}`);
    if (json && json.table && json.table.length) { hit = json; tableHit++; break; }
  }
  /* 브라우저는 시즌을 모른 채 후보를 앞에서부터 찔러 본다(data-pages.js:334).
     맞은 시즌 파일만 두면 앞의 후보에서 404 가 나 콘솔에 오류가 쌓이고
     Lighthouse Best Practices 가 떨어진다. 그래서 후보 **전부**에 같은 표를
     둔다. 하나도 못 구했으면 빈 표를 둬서 404 대신 200 을 주게 한다 —
     행이 비면 브라우저는 다음 후보로 넘어가고 결국 하드코딩을 유지한다. */
  const body = hit || { table: [] };
  for (const season of seasons) {
    await write(ArenaPath.fileFor(`lookuptable.php?l=${leagueId}&s=${season}`), body);
  }
}
if (MODE !== 'quick') console.log(`⑤ 순위표 ${tableHit}/${leagues.size}개`);

/* ⑥ 경기 기록·주요 장면 (V2). 축구에만 있고 유럽 리그 위주다 —
   K리그·MLB·NPB 는 「No data found」 다(실측). 그래서 굽는 대상을 좁힌다:
     · 축구
     · 이미 열린 경기(진행 중·종료) — 시작 전에는 기록이 없다
     · 리그 등급 1~2군 (3군 하부리그까지 굽으면 호출이 수백 건 늘고 대개 비어 있다)
   경기당 2건을 부르므로 상한을 둔다. 넘치면 그 사실을 로그에 남긴다. */
const statsCap = Number(process.env.PREBAKE_STATS_CAP || 150);
const played = ['FT', 'AET', 'PEN', 'AOT', 'FINAL', 'MATCH FINISHED', 'ENDED'];
const detailTargets = events.filter((ev) =>
  ev.strSport === 'Soccer' &&
  (played.includes(String(ev.strStatus)) || (ev.intHomeScore !== null && ev.intHomeScore !== '')) &&
  ArenaLeagues.tier(ev.strLeague) <= 2
);
const detailPick = detailTargets.slice(0, statsCap);
if (detailTargets.length > detailPick.length) {
  console.log(`   ⚠️ 기록 대상 ${detailTargets.length}건 중 ${detailPick.length}건만 굽는다 (PREBAKE_STATS_CAP)`);
}
let statHit = 0, lineHit = 0;
const statIds = [], lineIds = [];
for (const ev of detailPick) {
  if (await bake2(`lookup/event_stats/${ev.idEvent}`, `lookupeventstats.php?id=${ev.idEvent}`)) { statHit++; statIds.push(String(ev.idEvent)); }
  if (await bake2(`lookup/event_timeline/${ev.idEvent}`, `lookuptimeline.php?id=${ev.idEvent}`)) { lineHit++; lineIds.push(String(ev.idEvent)); }
}
/* 있는 것만 브라우저가 요청하도록 목록을 남긴다. 대상이 0건이어도 **반드시** 쓴다 —
   이 파일이 없으면 브라우저가 목록부터 404 를 받는다. */
await write(ArenaPath.fileFor('detailindex.php?x=1'), { stats: statIds, timeline: lineIds });
console.log(`⑥ 경기 기록 ${statHit}건 · 주요 장면 ${lineHit}건 (대상 ${detailPick.length}경기)`);

/* ⑥ manifest — 못 구운 것을 반드시 남긴다 */
await write('manifest.json', {
  generatedAt: new Date().toISOString(),
  mode: MODE,
  days,
  counts: {
    eventsday: lists.filter((l) => l.length).length,
    events: events.length,
    teamsRequested: teams.length,
    teamsFound: teamHit,
    table: tableHit
  },
  skippedTeams,
  failed
});

console.log(`\n완료. 실패 ${failed.length}건 · 상한 초과 ${skippedTeams.length}팀`);
if (skippedTeams.length) console.log('상한에 걸려 못 구운 팀:', skippedTeams.join(', '));
if (failed.length) console.log('실패한 호출:\n  ' + failed.join('\n  '));
