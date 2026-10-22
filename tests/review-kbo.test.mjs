import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listFinished, fetchFacts, toFacts } from '../tools/review/sources/kbo.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';

const fx = JSON.parse(await readFile(new URL('./fixtures/review/tsdb-kbo-20261020.json', import.meta.url), 'utf8'));
const noSleep = async () => {};

test('kbo_line_score_parsed', () => {
  const f = toFacts(fx.events[0]);
  assert.deepEqual(f.periods.labels, ['1','2','3','4','5','6','7','8','9']);
  assert.deepEqual(f.periods.away, [0,7,0,0,1,1,1,3,0]);
  assert.deepEqual(f.periods.home, [0,0,0,0,0,1,0,0,0]);
  assert.deepEqual(f.score, { home: 1, away: 13 });
  assert.equal(f.home.name, 'LG 트윈스'); assert.equal(f.home.short, 'LG');
  assert.equal(f.away.name, 'KIA 타이거즈'); assert.equal(f.away.short, 'KIA');
  assert.equal(f.venue, '잠실야구장');
  assert.deepEqual(f.teamStats.find(s => s.label === '안타'), { label: '안타', home: 8, away: 16 });
  assert.deepEqual(f.teamStats.find(s => s.label === '실책'), { label: '실책', home: 1, away: 0, lowerBetter: true });
  assert.deepEqual(f.teamStats.find(s => s.label === '득점 이닝'), { label: '득점 이닝', home: 1, away: 5 });
  assert.equal(f.players.length, 0);
  assert.equal(f.timeline.length, 0);
  assert.match(f.source.url, /^https:\/\/www\.koreabaseball\.com\//);
  assert.equal(f.source.name, 'TheSportsDB');
  assert.equal(f.league, 'kbo'); assert.equal(f.gameKey, 'kbo-2618676');
  assert.equal(f.date, '2026-10-20'); assert.equal(f.stage, null);
  assert.equal(f.ai.venue, '잠실야구장');
});

test('kbo_aliases_match_real_event_names', () => {
  const e = fx.events[0];
  assert.ok(ALIASES.kbo[e.strHomeTeam]); assert.ok(ALIASES.kbo[e.strAwayTeam]);
});

test('kbo_list_finished_shape_and_fetch_facts', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return { ok: true, json: async () => fx }; };
  const games = await listFinished(['2026-10-20'], { key: 'K', fetchImpl, sleep: noSleep });
  assert.equal(games.length, 1);
  assert.match(urls[0], /eventsday\.php\?d=2026-10-20&l=4830$/);
  const g = games[0];
  assert.deepEqual({ ...g, ref: undefined }, { league: 'kbo', gameKey: 'kbo-2618676', date: '2026-10-20',
    home: 'LG Twins', away: 'Kia Tigers', homeScore: 1, awayScore: 13, stage: null, ref: undefined });
  const before = urls.length;
  const f = await fetchFacts(g, { key: 'K', fetchImpl, sleep: noSleep });
  assert.equal(f.score.away, 13);
  assert.equal(urls.length, before);
});

test('kbo_unfinished_excluded', async () => {
  const base = fx.events[0];
  const mk = (id, over) => ({ ...base, idEvent: id, ...over });
  const events = [
    mk('1', {}),
    mk('2', { strStatus: 'NS', intHomeScore: null, intAwayScore: null }),
    mk('3', { strStatus: 'Postponed' }),
    mk('4', { strStatus: 'FT', intHomeScore: null, intAwayScore: '3' }),
    mk('5', { strPostponed: 'yes' }),
    mk('6', { dateEventLocal: '2026-10-19' }),
  ];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ events }) });
  const games = await listFinished(['2026-10-20'], { key: 'K', fetchImpl, sleep: noSleep });
  assert.deepEqual(games.map(g => g.gameKey), ['kbo-1']);
});

test('kbo_null_events_and_http_error', async () => {
  const none = async () => ({ ok: true, json: async () => ({ events: null }) });
  assert.deepEqual(await listFinished(['2026-10-21'], { key: 'K', fetchImpl: none, sleep: noSleep }), []);
  const bad = async () => ({ ok: false, status: 429, json: async () => null });
  await assert.rejects(listFinished(['2026-10-21'], { key: 'K', fetchImpl: bad, sleep: noSleep }), /429/);
});

test('kbo_requests_spaced_700ms', async () => {
  const sleeps = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ events: null }) });
  await listFinished(['2026-10-20', '2026-10-21', '2026-10-22'], { key: 'K', fetchImpl, sleep: async (ms) => { sleeps.push(ms); } });
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps.every(ms => ms >= 700));
});

test('kbo_extra_innings', () => {
  const e = { ...fx.events[0], strResult: ' LG Twins Innings:<br>0 0 0 0 0 1 0 0 0 0 0 1 <br>Hits: 8 - Errors: 1<br><br>Kia Tigers Innings:<br>0 7 0 0 1 1 1 0 0 0 0 0 <br>Hits: 16 - Errors: 0' };
  const f = toFacts(e);
  assert.deepEqual(f.periods.labels, ['1','2','3','4','5','6','7','8','9','10','11','12']);
  assert.equal(f.periods.home.length, 12);
  assert.equal(f.periods.home[11], 1);
});

test('kbo_missing_line_score_degrades', () => {
  const f = toFacts({ ...fx.events[0], strResult: '' });
  assert.deepEqual(f.periods, { labels: [], home: [], away: [] });
  assert.equal(f.teamStats.find(s => s.label === '안타'), undefined);
  assert.deepEqual(f.score, { home: 1, away: 13 });
});

test('kbo_draw_keeps_equal_score', () => {
  const f = toFacts({ ...fx.events[0], intHomeScore: '4', intAwayScore: '4' });
  assert.deepEqual(f.score, { home: 4, away: 4 });
});
