/* ARENA LIVE — 프리베이크
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

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ArenaPath = require(join(ROOT, 'assets/apipath.js'));

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
    const json = await limit(async () => {
      const res = await fetch(BASE + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    await write(file, json);
    return json;
  } catch (err) {
    failed.push(`${path} → ${err.message}`);
    return null;
  }
}

async function write(file, json) {
  const full = join(OUT, file);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(json), 'utf8');
}

/* ── 본체 ─────────────────────────────────────────────── */
await rm(OUT, { recursive: true, force: true });   // 지난 회차 잔재를 남기지 않는다
await mkdir(OUT, { recursive: true });

const days = [-1, 0, 1].map(utcKey);
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
const cap = Number(process.env.PREBAKE_TEAM_CAP || 60);
const { events, teams, skippedTeams } = collectTargets(lists, dict, cap);
console.log(`② 경기 ${events.length}건 · 구울 팀 ${teams.length}팀 (사전 ${dict.length} + 등장 ${teams.length - dict.length}) · 상한 초과 ${skippedTeams.length}팀`);

/* ③ 경기 상세 — API 를 부르지 않는다. ①에서 받은 응답을 id 별로 쪼개 쓴다.
   data-pages.js 는 ?event= 가 「오늘 목록」에 없을 때만 lookupevent 를 부르는데,
   어제·내일 경기가 그 경우다. 그 정보는 ①의 응답에 이미 들어 있다. */
for (const ev of events) {
  await write(ArenaPath.fileFor(`lookupevent.php?id=${ev.idEvent}`), { events: [ev] });
}
console.log(`③ 경기 상세 ${events.length}건 (추가 호출 0건)`);

/* ④ 팀 허브 — searchteams → eventsnext, 그리고 리그 순위표 */
const leagues = new Map();
let teamHit = 0;
for (const name of teams) {
  const json = await bake(`searchteams.php?t=${encodeURIComponent(name)}`);
  const team = json && json.teams && json.teams[0];
  if (!team) continue;
  teamHit++;
  if (team.idTeam) await bake(`eventsnext.php?id=${team.idTeam}`);
  if (team.idLeague && !leagues.has(team.idLeague)) leagues.set(team.idLeague, true);
}
console.log(`④ 팀 ${teamHit}/${teams.length}팀 · 리그 ${leagues.size}개`);

/* ⑤ 리그 순위표. 시즌 추정값은 data-pages.js:334 의 기존 로직과 같게 둔다. */
const year = new Date().getUTCFullYear();
const seasons = [`${year}-${year + 1}`, String(year), `${year - 1}-${year}`];
let tableHit = 0;
for (const leagueId of leagues.keys()) {
  for (const season of seasons) {
    const json = await bake(`lookuptable.php?l=${leagueId}&s=${season}`);
    if (json && json.table && json.table.length) { tableHit++; break; }
  }
}
console.log(`⑤ 순위표 ${tableHit}/${leagues.size}개`);

/* ⑥ manifest — 못 구운 것을 반드시 남긴다 */
await write('manifest.json', {
  generatedAt: new Date().toISOString(),
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
