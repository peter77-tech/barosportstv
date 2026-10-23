import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listFinished, fetchFacts, toFacts, resetKl1Throttle } from '../tools/review/sources/kl1.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const schedule = await load('kl1-schedule-2026-10');
const item = (id) => schedule.data.scheduleList.find((x) => x.gameId === id);
const gameOf = (it) => ({ league: 'kl1', gameKey: `kl1-${it.gameId}`, date: it.gameDate.replace(/\./g, '-'),
  home: it.homeTeamName, away: it.awayTeamName, homeScore: it.homeGoal, awayScore: it.awayGoal, stage: null, ref: { item: it } });
const bundle = async (id) => ({
  game: gameOf(item(id)),
  record: (await load(`kl1-${id}-record`)).data,
  info: (await load(`kl1-${id}-info`)).data,
  detail: (await load(`kl1-${id}-detail`)).data,
});
const fx190 = await bundle(190);
const fx187 = await bundle(187);

beforeEach(() => resetKl1Throttle());

test('kl1_stoppage_time_format', () => {
  const f = toFacts(fx190);
  assert.ok(f.timeline.includes('전반 45+9분 득점 제주 네게바'));
  assert.ok(f.timeline.includes('후반 45+1분 득점 제주 네게바'));
});
test('kl1_sub_direction', () => {
  assert.ok(toFacts(fx190).timeline.includes('후반 0분 교체 전북 이동준 (OUT) → 이승우 (IN)'));
});
test('kl1_halves_from_goals', () => {
  const f = toFacts(fx190);
  assert.deepEqual(f.periods, { labels: ['전반','후반'], home: [1,2], away: [1,1] });
  assert.deepEqual(f.score, { home: 3, away: 2 });
});
test('kl1_halves_null_when_goals_disagree_with_score', () => {
  const bad = { ...fx190, game: { ...fx190.game, homeScore: 4 } };
  assert.deepEqual(toFacts(bad).periods.home, [null, null]);
});
test('kl1_pass_pct_recomputed', () => {
  assert.equal(toFacts(fx190).teamStats.find(s => s.label === '패스 성공').home, '332/389 (85.3%)');
});
test('kl1_team_stats_eight_rows', () => {
  const s = toFacts(fx190).teamStats;
  assert.deepEqual(s.map(x => x.label), ['점유율','슈팅','유효슈팅','패스 성공','키패스','코너킥','파울','경고']);
  assert.equal(s.find(x => x.label === '점유율').home, '51%');
  assert.equal(s.find(x => x.label === '파울').lowerBetter, true);
  assert.equal(s.find(x => x.label === '경고').lowerBetter, true);
});
test('kl1_players_trimmed', () => {
  const f = toFacts(fx190);
  assert.ok(f.ai.players.length < 33);
  assert.ok(f.ai.players.some(p => p.name === '티아고' && p.goals === 2));
  assert.ok(f.players.every(p => p.cells.length === f.playerColumns.length));
  assert.ok(f.players.some(p => p.name === '네게바'));
});
test('kl1_draw_score', () => assert.deepEqual(toFacts(fx187).score, { home: 2, away: 2 }));

test('kl1_names_venue_source', () => {
  const f = toFacts(fx190);
  assert.deepEqual(f.home, { name: '전북', short: '전북', full: null });
  assert.deepEqual(f.away, { name: '제주', short: '제주', full: null });
  assert.equal(f.venue, '전주 월드컵 경기장'); assert.equal(f.crowd, 11469);
  assert.equal(f.source.url, 'https://www.kleague.com/match.do?year=2026&leagueId=1&gameId=190&meetSeq=1');
  assert.equal(f.gameKey, 'kl1-190'); assert.equal(f.date, '2026-10-18');
});

test('kl1_aliases_match_real_team_names', () => {
  for (const it of schedule.data.scheduleList) {
    assert.ok(ALIASES.kl1[it.homeTeamName], it.homeTeamName);
    assert.ok(ALIASES.kl1[it.awayTeamName], it.awayTeamName);
  }
});

function fakeClock() {
  let t = 1000;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

test('kl1_list_finished_filters_and_sends_korean_header', async () => {
  const calls = [];
  const fetchImpl = async (u, init) => { calls.push({ u, init }); return { ok: true, json: async () => schedule }; };
  const games = await listFinished(['2026-10-18', '2026-10-19'], { fetchImpl, ...fakeClock() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].u, 'https://www.kleague.com/getScheduleList.do');
  assert.equal(calls[0].init.headers['Accept-Language'], 'ko-KR,ko');
  assert.deepEqual(JSON.parse(calls[0].init.body), { year: '2026', month: '10', leagueId: '1' });
  const ids = games.map(g => g.gameKey);
  assert.ok(ids.includes('kl1-190') && ids.includes('kl1-187'));
  assert.ok(games.every(g => g.date === '2026-10-18' || g.date === '2026-10-19'));
  const g190 = games.find(g => g.gameKey === 'kl1-190');
  assert.equal(g190.home, '전북'); assert.equal(g190.homeScore, 3);
});

test('kl1_unfinished_excluded', async () => {
  const base = item(190);
  const mk = (id, over) => ({ ...base, gameId: id, ...over });
  const data = { scheduleList: [mk(1, {}), mk(2, { endYn: 'N', gameStatus: null, homeGoal: null, awayGoal: null }), mk(3, { gameDate: '2026.10.20' })] };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ resultCode: '200', data }) });
  const games = await listFinished(['2026-10-18'], { fetchImpl, ...fakeClock() });
  assert.deepEqual(games.map(g => g.gameKey), ['kl1-1']);
});

test('kl1_http_error_throws', async () => {
  const bad = async () => ({ ok: false, status: 503, json: async () => null });
  await assert.rejects(listFinished(['2026-10-18'], { fetchImpl: bad, ...fakeClock() }), /503/);
});

test('kl1_fetch_facts_three_calls_korean_header_throttled_across_calls', async () => {
  const seen = [];
  const c = fakeClock();
  const fetchImpl = async (u, init) => {
    seen.push({ u, t: c.now(), lang: init.headers['Accept-Language'], body: init.body });
    const name = u.includes('matchRecord.do') ? 'record' : u.includes('matchInfo.do') ? 'info' : 'detail';
    return { ok: true, json: async () => load(`kl1-190-${name}`) };
  };
  const game = fx190.game;
  const f = await fetchFacts(game, { fetchImpl, ...c });
  await fetchFacts(game, { fetchImpl, ...c });          // 두 번째 호출의 첫 요청도 직전 요청에서 700ms 뒤여야 한다
  assert.equal(seen.length, 6);
  assert.ok(seen.every(s => s.lang === 'ko-KR,ko'));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].t - seen[i - 1].t >= 700, `gap ${i}`);
  assert.match(seen[2].body, /gameId=190/); assert.match(seen[2].body, /homeTeam=K05/); assert.match(seen[2].body, /roundId=32/);
  assert.equal(f.score.home, 3);
});
