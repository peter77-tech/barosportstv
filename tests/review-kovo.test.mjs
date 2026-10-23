import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listFinished, fetchFacts, toFacts, resetKovoThrottle } from '../tools/review/sources/kovo.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const list = await load('kovo-list');                      // 실측 행 6개: 2025-26 남 262·여 265·남 정규 20·올스타, 2026-27 개막전(미진행) 남·여
const men = (await load('kovo-detail-262')).payload;       // 2026-04-02 대한항공 3:2 현대캐피탈
const women = (await load('kovo-detail-265')).payload;     // 2026-04-05 GS칼텍스 3:1 한국도로공사
const rows = list.payload.content;
const menRow = rows.find((r) => r.gnum === 262), womenRow = rows.find((r) => r.gnum === 265);

function fakeClock(start = 1e12) {
  let t = start;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const okJson = (body) => async () => ({ ok: true, json: async () => body });

beforeEach(() => resetKovoThrottle());

test('kovo_sets', () => {
  const f = toFacts({ schedule: menRow, detail: men });
  assert.deepEqual(f.periods.labels, ['1세트', '2세트', '3세트', '4세트', '5세트']);
  assert.deepEqual(f.periods.home, [25, 19, 23, 25, 15]);
  assert.deepEqual(f.periods.away, [19, 25, 25, 20, 11]);
  assert.equal(f.home.name, '대한항공'); assert.equal(f.home.short, '대한항공'); assert.equal(f.away.name, '현대캐피탈');
  assert.equal(f.date, '2026-04-02'); assert.equal(f.venue, '인천계양체육관'); assert.equal(f.crowd, 2256);
  assert.equal(f.stage, '챔피언결정전'); assert.equal(f.league, 'vm'); assert.equal(f.gameKey, 'vm-022-262');
});
test('kovo_set_count_follows_sets_played', () => {
  const f = toFacts({ schedule: womenRow, detail: women });   // 3:1 → 4세트만
  assert.deepEqual(f.periods.labels, ['1세트', '2세트', '3세트', '4세트']);
  assert.deepEqual(f.periods.home, [25, 19, 25, 25]); assert.deepEqual(f.periods.away, [15, 25, 20, 20]);
});
test('kovo_set_score_is_score', () => {
  assert.deepEqual(toFacts({ schedule: menRow, detail: men }).score, { home: 3, away: 2 });
  assert.deepEqual(toFacts({ schedule: womenRow, detail: women }).score, { home: 3, away: 1 });
});
test('kovo_gender_split', async () => {
  const fetchImpl = okJson(list);
  const days = ['2026-04-02', '2026-04-05'];
  const m = await listFinished(days, { gender: '1', fetchImpl, ...fakeClock() });
  const w = await listFinished(days, { gender: '2', fetchImpl, ...fakeClock() });
  assert.deepEqual(m.map((g) => [g.league, g.gameKey]), [['vm', 'vm-022-262']]);
  assert.deepEqual(w.map((g) => [g.league, g.gameKey]), [['vw', 'vw-022-265']]);
  assert.equal(toFacts({ schedule: womenRow, detail: women }).league, 'vw');
  await assert.rejects(listFinished(days, { gender: '3', fetchImpl, ...fakeClock() }), /gender/);
});
test('kovo_player_columns', () => {
  const f = toFacts({ schedule: menRow, detail: men });
  assert.deepEqual(f.playerColumns, ['선수', '팀', '득점', '공격 성공률', '서브', '블로킹']);
  const home = f.players.filter((p) => p.side === 'home'), away = f.players.filter((p) => p.side === 'away');
  assert.equal(home.length, 5); assert.equal(away.length, 5);
  assert.deepEqual(home[0].cells, ['임동혁', '대한항공', 22, '54.1%', 2, 0]);   // 득점 순
  assert.deepEqual(home[1].cells, ['마쏘', '대한항공', 18, '71.4%', 1, 2]);
  assert.ok(away.every((p, i) => i === 0 || p.cells[2] <= away[i - 1].cells[2]));
  assert.ok(away.every((p) => p.cells[1] === '현대캐피탈'));
  assert.ok(f.players.every((p) => p.cells.length === 6 && p.name === p.cells[0]));
});
test('kovo_team_stats', () => {
  const f = toFacts({ schedule: menRow, detail: men });
  assert.deepEqual(f.teamStats.map((s) => s.label), ['공격 성공률', '득점', '서브', '블로킹', '리시브 효율', '디그', '범실', '상대 범실 득점']);
  const r = (l) => f.teamStats.find((s) => s.label === l);
  assert.deepEqual([r('공격 성공률').home, r('공격 성공률').away], ['55.0%', '47.7%']);
  assert.deepEqual([r('득점').home, r('득점').away], [107, 100]);
  assert.deepEqual([r('서브').home, r('서브').away], [4, 4]);
  assert.deepEqual([r('블로킹').home, r('블로킹').away], [9, 9]);
  assert.deepEqual([r('리시브 효율').home, r('리시브 효율').away], ['38.6%', '30.4%']);
  assert.deepEqual([r('디그').home, r('디그').away], [38, 47]);
  assert.deepEqual([r('범실').home, r('범실').away], [34, 33]); assert.equal(r('범실').lowerBetter, true);
  assert.deepEqual([r('상대 범실 득점').home, r('상대 범실 득점').away], [33, 34]);   // 대한항공 107 = 공격 61 + 서브 4 + 블로킹 9 + 상대 범실 33
  assert.ok(f.teamStats.length <= 8);
});
test('kovo_ai_and_source', () => {
  const f = toFacts({ schedule: menRow, detail: men });
  assert.equal(f.ai.date, '2026-04-02'); assert.deepEqual(f.ai.score, { home: 3, away: 2 });
  assert.equal(f.ai.sets.length, 5); assert.deepEqual(f.ai.sets[2], { set: 3, home: 23, away: 25, minutes: 30 });
  assert.ok(f.ai.players.some((p) => p.name === '임동혁' && p.team === '대한항공' && p.points === 22));
  assert.ok(f.ai.players.every((p) => p.name));
  assert.equal(f.source.name, 'KOVO 공식 기록'); 
  assert.equal(f.source.url, 'https://kovo.co.kr/games/v-leagues/schedules/262?gcode=001&seasonCode=022&leagueCode=203&round=1');   // 사이트 일정 화면의 「상세 결과」 버튼이 여는 주소
  assert.deepEqual(f.timeline, []);
});
test('kovo_mismatch_throws_instead_of_guessing', () => {
  assert.throws(() => toFacts({ schedule: menRow, detail: { ...men, game: { ...men.game, gnum: 1 } } }), /KOVO/);
  assert.throws(() => toFacts({ schedule: { ...menRow, hspoint: 2, aspoint: 3 }, detail: men }), /KOVO/);   // 세트 점수가 세트 승수와 어긋남
  assert.throws(() => toFacts({ schedule: menRow, detail: { ...men, team: [men.team[0]] } }), /KOVO/);
});

/* 🔴 실측: 컵대회는 이 API 의 gcode=001(V-리그)에 없다. 올스타전(leagueCode 801)도 쓰지 않는다. */
test('kovo_cup_excluded', async () => {
  const cup = { ...menRow, gnum: 900, leagueCode: '301', leagueName: 'KOVO Cup' };   // 합성 표본: 실제 API 에서 컵 행을 받지 못해 정규 행에서 만든 것
  const fetchImpl = okJson({ payload: { content: [...rows, cup] } });
  const g = await listFinished(['2026-01-25', '2026-04-02'], { gender: '1', fetchImpl, ...fakeClock() });
  assert.deepEqual(g.map((x) => x.gameKey), ['vm-022-262']);               // 올스타(801)·컵(301) 빠짐
});
test('kovo_unfinished_excluded', async () => {
  const bad = [
    { result: '', score: '', getime: '', hspoint: 0, aspoint: 0 },          // 개막전 미진행 행 모양
    { hspoint: 2, aspoint: 1 },                                               // 진행 중(3세트 승자 없음)
    { getime: '' },                                                           // 종료 시각 없음
    { result: '' },
  ];
  for (const patch of bad) {
    const fetchImpl = okJson({ payload: { content: [{ ...menRow, ...patch }] } });
    assert.deepEqual(await listFinished(['2026-04-02'], { gender: '1', fetchImpl, ...fakeClock() }), [], JSON.stringify(patch));
  }
  const open = rows.filter((r) => r.gdate === '2026-10-31');
  assert.equal(open.length, 2);
  assert.deepEqual(await listFinished(['2026-10-31'], { gender: '1', fetchImpl: okJson({ payload: { content: open } }), ...fakeClock() }), []);
  assert.deepEqual(await listFinished(['2026-10-31'], { gender: '2', fetchImpl: okJson({ payload: { content: open } }), ...fakeClock() }), []);
});
test('kovo_list_game_fields_and_filters_days', async () => {
  const fetchImpl = okJson(list);
  assert.deepEqual(await listFinished(['2026-04-03'], { gender: '1', fetchImpl, ...fakeClock() }), []);
  const [g] = await listFinished(['2026-04-02'], { gender: '1', fetchImpl, ...fakeClock() });
  assert.deepEqual(g, {
    league: 'vm', gameKey: 'vm-022-262', date: '2026-04-02', home: '대한항공', away: '현대캐피탈',
    homeScore: 3, awayScore: 2, stage: '챔피언결정전', ref: { gnum: 262, gcode: '001', seasonCode: '022' },
  });
});
test('kovo_next_season_failure_keeps_current_season_games', async () => {
  for (const next of [{ ok: false, status: 404 }, { ok: false, status: 500 }, { ok: true, json: async () => ({ result: { status: 404 } }) }, { ok: true, json: async () => { throw new Error('bad json'); } }]) {
    const fetchImpl = async (u) => (/seasonCode=024/.test(u) ? next : { ok: true, json: async () => list });
    const g = await listFinished(['2026-04-02'], { gender: '1', fetchImpl, ...fakeClock() });
    assert.deepEqual(g.map((x) => x.gameKey), ['vm-022-262']);
  }
  const bad = async (u) => (/seasonCode=023/.test(u) ? { ok: false, status: 404 } : { ok: true, json: async () => list });
  await assert.rejects(listFinished(['2026-04-02'], { gender: '1', fetchImpl: bad, ...fakeClock() }), /404/);   // 현재 시즌 실패는 그대로 던진다
});
test('kovo_http_error_throws', async () => {
  const bad = async () => ({ ok: false, status: 404 });
  await assert.rejects(listFinished(['2026-04-02'], { gender: '1', fetchImpl: bad, ...fakeClock() }), /404/);
  await assert.rejects(fetchFacts({ gameKey: 'x', ref: { gnum: 1, gcode: '001', seasonCode: '022' } }, { fetchImpl: bad, ...fakeClock() }), /404/);
});
test('kovo_requests_exact_urls_origin_header_throttled_across_calls', async () => {
  const c = fakeClock(); const seen = [];
  const fetchImpl = async (u, init = {}) => {
    seen.push({ u, t: c.now(), h: init.headers });
    return { ok: true, json: async () => (/game-schedule\/262/.test(u) ? { payload: men } : { payload: { content: [] } }) };
  };
  await listFinished(['2026-10-31'], { gender: '1', fetchImpl, ...c });
  const f = await fetchFacts({ gameKey: 'vm-022-262', ref: { gnum: 262, gcode: '001', seasonCode: '022' } }, { fetchImpl, ...c });
  assert.equal(f.score.home, 3);
  assert.deepEqual(seen.map((s) => s.u), [
    'https://user-api.kovo.co.kr/stat/game-schedule?gcode=001&seasonCode=023&size=500',
    'https://user-api.kovo.co.kr/stat/game-schedule?gcode=001&seasonCode=024&size=500',   // 다음 시즌이 열렸는지 탐지(비어 있으면 그대로 지나간다)
    'https://user-api.kovo.co.kr/stat/game-schedule/262?gcode=001&seasonCode=022',        // 🔴 쿼리에 다른 값을 더하면 404
  ]);
  assert.ok(seen.every((s) => s.h.Origin === 'https://kovo.co.kr' && /ko/.test(s.h['Accept-Language'])));
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].t - seen[i - 1].t >= 700, `gap ${i}`);
});

/* 교차 점검: 수집기가 내는 팀 이름이 모두 ALIASES 키여야 네이버 짝짓기가 된다. */
test('kovo_aliases_cover_every_fixture_team_name', () => {
  for (const r of rows.filter((x) => x.leagueCode !== '801')) {
    const league = r.gender === '1' ? 'vm' : 'vw';
    for (const n of [r.hsname, r.asname]) assert.ok(n in ALIASES[league], `${league} 별칭에 ${n} 없음`);
  }
  for (const [d, r] of [[men, menRow], [women, womenRow]]) {
    const f = toFacts({ schedule: r, detail: d });
    for (const n of [f.home.name, f.away.name]) assert.ok(n in ALIASES[f.league], `${f.league} 별칭에 ${n} 없음`);
  }
  // 2025-26 목록 전체(268행)에서 실측한 팀 이름 열네 개
  const real = {
    vm: ['한국전력', '우리카드', '삼성화재', 'OK저축은행', '현대캐피탈', 'KB손해보험', '대한항공'],
    vw: ['흥국생명', '정관장', 'GS칼텍스', 'IBK기업은행', '페퍼저축은행', '한국도로공사', '현대건설'],
  };
  for (const [league, names] of Object.entries(real)) for (const n of names) assert.ok(n in ALIASES[league], n);
});
