import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listFinished, fetchFacts, toFacts, resetKblThrottle } from '../tools/review/sources/kbl.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const list = await load('kbl-list-20261021');
const match = await load('kbl-S49G01N31-match');
const teamRecord = await load('kbl-S49G01N31-team-record');
const playerStat = await load('kbl-S49G01N31-player-stat');
const game = { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC',
  homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } };
const fx = { game, match, teamRecord, playerStat };

beforeEach(() => resetKblThrottle());

test('kbl_quarters', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.periods, { labels: ['1Q','2Q','3Q','4Q'], home: [30,23,22,22], away: [21,28,13,24] });
  assert.deepEqual(f.score, { home: 97, away: 86 });
  assert.equal(f.home.name, '서울 삼성'); assert.equal(f.away.name, '부산 KCC');
});
test('kbl_overtime_labels', () => {
  const m = structuredClone(match);
  m.teamrecords.home.scoreeq = [8, 5]; m.teamrecords.away.scoreeq = [6, 7];
  const f = toFacts({ ...fx, match: m });
  assert.deepEqual(f.periods.labels, ['1Q','2Q','3Q','4Q','OT1','OT2']);
  assert.deepEqual(f.periods.home, [30,23,22,22,8,5]);
  assert.deepEqual(f.periods.away, [21,28,13,24,6,7]);
});
test('kbl_compare_is_8_rows', () => {
  const f = toFacts(fx);
  assert.equal(f.teamStats.length, 8);
  assert.deepEqual(f.teamStats.map(s => s.label), ['야투','2점슛','3점슛','리바운드','어시스트','턴오버','턴오버 유도 득점','벤치 득점']);
  assert.equal(f.teamStats.find(s => s.label === '2점슛').home, '32/43 (74.4%)');
  assert.equal(f.teamStats.find(s => s.label === '야투').away, '34/65 (52.3%)');
  assert.equal(f.teamStats.find(s => s.label === '3점슛').home, '9/26 (34.6%)');
  assert.equal(f.teamStats.find(s => s.label === '턴오버').lowerBetter, true);
  assert.equal(f.teamStats.find(s => s.label === '턴오버 유도 득점').home, 22);
  assert.equal(f.teamStats.find(s => s.label === '벤치 득점').away, 32);
});
test('kbl_top5_each_side', () => {
  const f = toFacts(fx);
  assert.equal(f.players.filter(p => p.side === 'home').length, 5);
  assert.equal(f.players.filter(p => p.side === 'away').length, 5);
  assert.deepEqual(f.playerColumns, ['선수','시간','득점','리바','어시','스틸','3점','+/-']);
  assert.equal(f.players.find(p => p.name === '케렘 칸터').cells[2], 30);   // 득점 열
  assert.ok(f.players.every(p => p.cells.length === f.playerColumns.length));
  assert.equal(f.players.find(p => p.name === '케렘 칸터').cells[1], '36:58');
  assert.equal(f.players.find(p => p.name === '숀 롱').side, 'away');
});
test('kbl_ai_has_maxlead', () => {
  const ai = toFacts(fx).ai;
  assert.equal(ai.teamStats['부산 KCC'].maxLead, 4);
  assert.equal(ai.teamStats['서울 삼성'].maxLead, 15);
});
test('kbl_ai_players_exclude_dnp_and_include_all_who_played', () => {
  const ai = toFacts(fx).ai;
  assert.equal(ai.players.length, 18);                       // 24명 중 0분 6명 제외
  assert.ok(ai.players.some(p => p.name === '이규태' && p.team === '서울 삼성' && p.points === 15));
  assert.ok(!ai.players.some(p => p.name === '정성조'));
});
test('kbl_names_venue_source', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.home, { name: '서울 삼성', short: '서울 삼성', full: null });
  assert.equal(f.venue, '잠실학생체육관'); assert.equal(f.crowd, 3321);
  assert.equal(f.stage, '정규시즌'); assert.equal(f.timeline.length, 0);
  assert.equal(f.source.url, 'https://www.kbl.or.kr/game/record/S49G01N31');
  assert.equal(f.gameKey, 'kbl-S49G01N31'); assert.equal(f.date, '2026-10-21');
});
test('kbl_aliases_match_real_team_names', () => {
  for (const n of [match.game.tnameH, match.game.tnameA]) assert.ok(ALIASES.kbl[n], n);
  for (const g of list.filter(g => g.seasonCategoryName === '정규시즌')) {
    assert.ok(ALIASES.kbl[g.tnameH], g.tnameH); assert.ok(ALIASES.kbl[g.tnameA], g.tnameA);
  }
});

function fakeClock() {
  let t = 1000;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('kbl_list_finished_filters_and_sends_headers', async () => {
  const calls = [];
  const fetchImpl = async (u, init) => { calls.push({ u, init }); return { ok: true, json: async () => list }; };
  const games = await listFinished(['2026-10-21'], { fetchImpl, ...fakeClock() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u, 'https://api.kbl.or.kr/match/list?fromDate=20261021&toDate=20261021');
  const h = calls[0].init.headers;
  assert.equal(h.Channel, 'WEB'); assert.equal(h.TeamCode, 'XX'); assert.equal(h.lang, 'ko');
  assert.equal(h.Origin, 'https://www.kbl.or.kr'); assert.equal(h.Referer, 'https://www.kbl.or.kr/');
  assert.deepEqual(games.map(g => g.gameKey), ['kbl-S49G01N31']);     // EASL 경기 제외
  assert.deepEqual(games[0], game);
});
test('kbl_list_spans_min_to_max_day_and_filters_to_wanted_days', async () => {
  const calls = [];
  const fetchImpl = async (u) => { calls.push(u); return { ok: true, json: async () => list }; };
  const games = await listFinished(['2026-10-20', '2026-10-22'], { fetchImpl, ...fakeClock() });
  assert.equal(calls[0], 'https://api.kbl.or.kr/match/list?fromDate=20261020&toDate=20261022');
  assert.deepEqual(games, []);                                        // 21일은 원하는 날이 아님
});
test('kbl_unfinished_and_other_categories_excluded', async () => {
  const base = list[0];
  const mk = (gmkey, over) => ({ ...base, gmkey, ...over });
  const data = [mk('A1', {}), mk('A2', { isEnded: 0 }), mk('A3', { seasonCategoryName: '컵대회' }),
    mk('A4', { seasonCategoryName: '플레이오프' }), mk('A5', { seasonCategoryName: '챔피언결정전' }),
    mk('A6', { seasonCategoryName: '시범경기' })];
  const fetchImpl = async () => ({ ok: true, json: async () => data });
  const games = await listFinished(['2026-10-21'], { fetchImpl, ...fakeClock() });
  assert.deepEqual(games.map(g => g.gameKey), ['kbl-A1', 'kbl-A4', 'kbl-A5']);
  assert.equal(games[1].stage, '플레이오프');
});
test('kbl_http_error_throws', async () => {
  const bad = async () => ({ ok: false, status: 400, json: async () => null });
  await assert.rejects(listFinished(['2026-10-21'], { fetchImpl: bad, ...fakeClock() }), /400/);
});
test('kbl_fetch_facts_three_calls_headers_throttled_across_calls', async () => {
  const seen = [];
  const c = fakeClock();
  const fetchImpl = async (u, init) => {
    seen.push({ u, t: c.now(), ch: init.headers.Channel });
    const name = u.endsWith('/team-record') ? 'team-record' : u.endsWith('/player-stat') ? 'player-stat' : 'match';
    return { ok: true, json: async () => load(`kbl-S49G01N31-${name}`) };
  };
  const f = await fetchFacts(game, { fetchImpl, ...c });
  await fetchFacts(game, { fetchImpl, ...c });
  assert.equal(seen.length, 6);
  assert.deepEqual(seen.slice(0, 3).map(s => s.u), [
    'https://api.kbl.or.kr/match/S49G01N31', 'https://api.kbl.or.kr/match/S49G01N31/team-record', 'https://api.kbl.or.kr/match/S49G01N31/player-stat']);
  assert.ok(seen.every(s => s.ch === 'WEB'));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].t - seen[i - 1].t >= 700, `gap ${i}`);
  assert.equal(f.score.home, 97);
});
