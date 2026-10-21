/* 워드프레스 일정 JSON(data/wp/). 판정은 data.js 실물이 한다 — 여기서는 그 결과가
   한국 시각 기준 날짜 파일로 제대로 나뉘어 나가는지 본다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';

import { buildWpSchedule } from '../tools/lib/wpschedule.mjs';

const require = createRequire(import.meta.url);
const ArenaPath = require('../assets/apipath.js');

const NOW = new Date('2026-10-21T03:00:00Z');   // 한국 2026-10-21 12:00

/* 실측 응답과 같은 모양의 합성 경기 */
function ev(id, over) {
  return Object.assign({
    idEvent: id, strSport: 'Baseball', strLeague: 'Korean KBO League',
    strHomeTeam: 'Kiwoom Heroes', strAwayTeam: 'Doosan Bears',
    strStatus: 'NS', strTime: '09:30:00', strTimestamp: '2026-10-21T09:30:00',
    dateEvent: '2026-10-21', intHomeScore: null, intAwayScore: null
  }, over);
}

async function fixture(byUtcDay) {
  const dir = await mkdtemp(join(tmpdir(), 'wpsched-'));
  for (const [day, events] of Object.entries(byUtcDay)) {
    const sports = {};
    for (const e of events) (sports[e.strSport] = sports[e.strSport] || []).push(e);
    for (const [sport, list] of Object.entries(sports)) {
      const file = join(dir, ArenaPath.fileFor(`eventsday.php?d=${day}&s=${encodeURIComponent(sport)}`));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ events: list }));
    }
  }
  return dir;
}

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

test('writes_five_days — 오늘(한국)부터 5일, 경기가 없는 날도 빈 파일', async () => {
  const dir = await fixture({ '2026-10-21': [ev('1')] });
  await buildWpSchedule({ root: process.cwd(), dataDir: dir, now: NOW });

  const index = await readJson(join(dir, 'wp', 'index.json'));
  assert.deepEqual(index.days, ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.equal(index.timezone, 'Asia/Seoul');
  assert.equal(index.generatedAt, NOW.toISOString());

  const files = (await readdir(join(dir, 'wp'))).filter((f) => f.startsWith('day-')).sort();
  assert.equal(files.length, 5);
  const empty = await readJson(join(dir, 'wp', 'day-2026-10-25.json'));
  assert.deepEqual(empty, { date: '2026-10-25', events: [] });
});

test('kst_midnight — UTC 15:30 경기는 한국 다음 날 00:30', async () => {
  const dir = await fixture({ '2026-10-21': [ev('9', { strTime: '15:30:00', strTimestamp: '2026-10-21T15:30:00' })] });
  await buildWpSchedule({ root: process.cwd(), dataDir: dir, now: NOW });

  const d21 = await readJson(join(dir, 'wp', 'day-2026-10-21.json'));
  const d22 = await readJson(join(dir, 'wp', 'day-2026-10-22.json'));
  assert.equal(d21.events.length, 0);
  assert.equal(d22.events.length, 1);
  assert.equal(d22.events[0].clock, '00:30');
  assert.equal(d22.events[0].kickoff, '2026-10-21T15:30:00.000Z');
});

test('korean_names_and_tier_first — 한글 팀명, 등급이 상태보다 먼저', async () => {
  const dir = await fixture({ '2026-10-21': [
    ev('low', { strLeague: 'English League Two', strSport: 'Soccer', strHomeTeam: 'Foo', strAwayTeam: 'Bar',
      strStatus: '2H', intHomeScore: 1, intAwayScore: 0 }),
    ev('top', { strStatus: 'FT', intHomeScore: 3, intAwayScore: 2 })
  ] });
  await buildWpSchedule({ root: process.cwd(), dataDir: dir, now: NOW });

  const { events } = await readJson(join(dir, 'wp', 'day-2026-10-21.json'));
  assert.deepEqual(events.map((e) => e.id), ['top', 'low']);
  assert.equal(events[0].home, '키움 히어로즈');
  assert.equal(events[0].tier, 1);
  assert.equal(events[0].state, 'finished');
  assert.equal(events[0].homeScore, '3');
  assert.equal(events[1].tier, 3);
  assert.equal(events[1].state, 'live');
  assert.equal(events[1].home, 'Foo');           // 모르는 팀은 영문 그대로
});

test('states — 연기는 점수 없이 「연기」, 시각 모르는 경기는 「시간 미정」', async () => {
  const dir = await fixture({ '2026-10-21': [
    ev('post', { strStatus: 'POST', intHomeScore: '', intAwayScore: '' }),
    ev('tbd', { strTime: '00:00:00', strTimestamp: '2026-10-21T00:00:00' })
  ] });
  await buildWpSchedule({ root: process.cwd(), dataDir: dir, now: NOW });

  const { events } = await readJson(join(dir, 'wp', 'day-2026-10-21.json'));
  const post = events.find((e) => e.id === 'post');
  const tbd = events.find((e) => e.id === 'tbd');
  assert.equal(post.state, 'postponed');
  assert.equal(post.clock, '연기');
  assert.equal(post.homeScore, null);
  assert.equal(post.awayScore, null);
  assert.equal(tbd.state, 'upcoming');
  assert.equal(tbd.clock, '시간 미정');
});

test('restores_tz — 끝나면 프로세스 시간대를 되돌린다', async () => {
  const before = process.env.TZ;
  const dir = await fixture({});
  await buildWpSchedule({ root: process.cwd(), dataDir: dir, now: NOW });
  assert.equal(process.env.TZ, before);
});
