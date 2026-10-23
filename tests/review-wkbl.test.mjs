import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { listFinished, fetchFacts, toFacts, findSeasonGu, resetWkblThrottle } from '../tools/review/sources/wkbl.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';

const load = (n) => readFile(new URL(`./fixtures/review/${n}.html`, import.meta.url), 'utf8');
const resultHtml = await load('wkbl-result-046-01-89');
const boxHtml = await load('wkbl-box-046-01-89');
const listMonth = await load('wkbl-list-046-202604');
const listPlayoff = await load('wkbl-list-046-playoff');
const seasonSelect = await load('wkbl-season-select');
const emptyList = '<table><tbody><tr height=\'100\'><td colspan=\'5\'>경기 일정이 없습니다.</td></tr></tbody></table>';

const ref = { seasonGu: '046', gameType: '01', gameNo: '89', ym: '202604' };
const fx = { resultHtml, boxHtml, ref };

beforeEach(() => resetWkblThrottle());

/* 신한은행 은 목록에서 먼저 적힌 팀 = 홈이다 (실측: 인천 도원체육관 = 신한 홈, 청주체육관 = KB 홈. 사이트가 클래스 이름은 반대로 붙여 둔다). */
test('wkbl_quarters', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.periods, { labels: ['1Q', '2Q', '3Q', '4Q'], home: [15, 19, 21, 22], away: [10, 19, 11, 13] });
  assert.deepEqual(f.score, { home: 77, away: 53 });
  assert.equal(f.home.name, '신한은행'); assert.equal(f.away.name, '하나은행');
});
test('wkbl_overtime_label_only_when_extra_period_has_points', () => {
  const html = resultHtml
    .replace(/(<td>22<\/td>\s*<td>)0(<\/td>\s*<td>)77(<\/td>)/, '$18$285$3')
    .replace(/(<td>13<\/td>\s*<td>)0(<\/td>\s*<td>)53(<\/td>)/, '$17$280$3')
    .replace('<em class="txt_score">77</em>', '<em class="txt_score">85</em>')
    .replace('<em class="txt_score">53</em>', '<em class="txt_score">80</em>');
  assert.notEqual(html, resultHtml);
  const box = boxHtml.replace(/<td>77<\/td>(\s*<\/tr>\s*<\/tfoot>)/, '<td>85</td>$1').replace(/<td>53<\/td>(\s*<\/tr>\s*<\/tfoot>)/, '<td>80</td>$1');
  assert.notEqual(box, boxHtml);
  const f = toFacts({ ...fx, resultHtml: html, boxHtml: box });
  assert.deepEqual(f.periods.labels, ['1Q', '2Q', '3Q', '4Q', 'OT']);
  assert.deepEqual(f.periods.home, [15, 19, 21, 22, 8]); assert.deepEqual(f.periods.away, [10, 19, 11, 13, 7]);
});
test('wkbl_mvp_in_ai', () => {
  assert.equal(toFacts(fx).ai.mvp, '김지영');
});
test('wkbl_team_totals_two_rows', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.teamStats.map((s) => s.label), ['야투', '2점슛', '3점슛', '리바운드', '어시스트', '턴오버']);   // KBL 과 같은 이름, 값 없는 두 줄(턴오버 유도 득점·벤치 득점)은 뺀다
  const row = (l) => f.teamStats.find((s) => s.label === l);
  assert.equal(row('2점슛').home, '18/38 (47.4%)'); assert.equal(row('2점슛').away, '15/52 (28.8%)');
  assert.equal(row('3점슛').home, '10/25 (40.0%)'); assert.equal(row('3점슛').away, '4/12 (33.3%)');
  assert.equal(row('야투').home, '28/63 (44.4%)'); assert.equal(row('야투').away, '19/64 (29.7%)');
  assert.equal(row('리바운드').home, 40); assert.equal(row('리바운드').away, 30);
  assert.equal(row('어시스트').home, 25); assert.equal(row('어시스트').away, 20);
  assert.equal(row('턴오버').home, 12); assert.equal(row('턴오버').away, 11); assert.equal(row('턴오버').lowerBetter, true);
  assert.equal(f.ai.teamStats['신한은행'].points, 77); assert.equal(f.ai.teamStats['하나은행'].points, 53);
  assert.equal(f.ai.teamStats['신한은행'].freeThrows, '11/13 (84.6%)');
  assert.equal(f.ai.teamStats['하나은행'].steals, 6); assert.equal(f.ai.teamStats['하나은행'].blocks, 2);
});
test('wkbl_top5_each_side_with_kbl_columns_minus_plusminus', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.playerColumns, ['선수', '시간', '득점', '리바', '어시', '스틸', '3점']);   // KBL 열에서 +/- 만 빠진다(WKBL 기록에 없음)
  assert.equal(f.players.filter((p) => p.side === 'home').length, 5);
  assert.equal(f.players.filter((p) => p.side === 'away').length, 5);
  assert.ok(f.players.every((p) => p.cells.length === f.playerColumns.length));
  assert.deepEqual(f.players.filter((p) => p.side === 'home').map((p) => p.name), ['홍유순', '김지영', '신이슬', '미마 루이', '신지현']);   // 득점순, 동점(13)은 표 순서
  assert.deepEqual(f.players.find((p) => p.name === '김지영').cells, ['김지영', '36:02', 14, 11, 9, 0, '2/6']);
  assert.equal(f.players.find((p) => p.name === '박진영').side, 'away');
});
test('wkbl_ai_players_all_who_played', () => {
  const ai = toFacts(fx).ai;
  assert.equal(ai.players.length, 22);                                     // 신한 12 + 하나 10, 표에는 뛴 선수만 있다
  const kim = ai.players.find((p) => p.name === '김지영');
  assert.equal(kim.team, '신한은행'); assert.equal(kim.points, 14); assert.equal(kim.minutes, '36:02');
  assert.equal(kim.twoPoint, '3/8 (37.5%)'); assert.equal(kim.threePoint, '2/6 (33.3%)'); assert.equal(kim.offensiveRebounds, 3);
  assert.ok(ai.players.some((p) => p.name === '정채련' && p.minutes === '00:56'));
});
test('wkbl_no_standings_to_ai', () => {
  assert.ok(resultHtml.includes('위]'));                                   // 입력에는 순위 문자열이 있다
  const s = JSON.stringify(toFacts(fx).ai);
  assert.ok(!s.includes('위]')); assert.ok(!s.includes('승 ')); assert.ok(!s.includes('패,'));
});
test('wkbl_names_venue_source', () => {
  const f = toFacts(fx);
  assert.deepEqual(f.home, { name: '신한은행', short: '신한은행', full: null });
  assert.deepEqual(f.away, { name: '하나은행', short: '하나은행', full: null });
  assert.equal(f.venue, '인천도원체육관'); assert.equal(f.crowd, null);
  assert.equal(f.stage, '정규시즌'); assert.deepEqual(f.timeline, []);
  assert.equal(f.gameKey, 'wkbl-046-01-89'); assert.equal(f.date, '2026-04-01'); assert.equal(f.league, 'wkbl');
  assert.equal(f.source.name, 'WKBL 공식 기록');
  assert.equal(f.source.url, 'https://www.wkbl.or.kr/game/result.asp?season_gu=046&gun=1&game_type=01&game_no=89&ym=202604&viewType=1');
});
test('wkbl_playoff_stage_names', () => {
  assert.equal(toFacts({ ...fx, ref: { ...ref, gameType: '03', gameNo: '1', ym: '' } }).stage, '플레이오프');
  assert.equal(toFacts({ ...fx, ref: { ...ref, gameType: '04', gameNo: '1', ym: '' } }).stage, '챔피언결정전');
});
test('wkbl_layout_change_throws_instead_of_guessing', () => {
  assert.throws(() => toFacts({ ...fx, boxHtml: '<div>점검 중</div>' }), /WKBL/);
  assert.throws(() => toFacts({ ...fx, resultHtml: '<div>점검 중</div>' }), /WKBL/);
});
test('wkbl_aliases_match_real_team_names', () => {
  const f = toFacts(fx);
  const names = new Set([f.home.name, f.away.name]);
  for (const html of [listMonth, listPlayoff]) {
    for (const m of html.matchAll(/<strong class="team_name[^>]*>([^<]+)<\/strong>/g)) names.add(m[1].trim());
  }
  assert.ok(names.size >= 5, [...names].join(','));
  for (const n of names) assert.ok(ALIASES.wkbl[n], n);
});

function fakeClock() {
  let t = 1000;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}
const route = (table) => async (u, init) => {
  const hit = table.find(([re]) => re.test(u));
  if (!hit) throw new Error(`unexpected ${u}`);
  return { ok: true, status: 200, text: async () => hit[1], init };
};
const listRoutes = (month, playoff) => [
  [/inc_list_1_new\.asp/, month], [/inc_list_P1\.asp/, playoff], [/schedule1\.asp/, `<html>${seasonSelect}</html>`],
];

test('wkbl_find_season_gu_takes_selected_option', async () => {
  assert.equal(await findSeasonGu({ fetchImpl: route(listRoutes('', '')), ...fakeClock() }), '047');
  const noSel = seasonSelect.replace(' selected', '');
  assert.equal(await findSeasonGu({ fetchImpl: route([[/schedule1/, noSel]]), ...fakeClock() }), '047');   // 선택 표시가 없으면 맨 위(최신)
  await assert.rejects(findSeasonGu({ fetchImpl: route([[/schedule1/, '<html></html>']]), ...fakeClock() }), /season_gu/);
});
test('wkbl_list_finished_basics', async () => {
  const urls = [];
  const fetchImpl = async (u) => { urls.push(u); return route(listRoutes(listMonth, emptyList))(u); };
  const games = await listFinished(['2026-04-01'], { fetchImpl, ...fakeClock() });
  assert.deepEqual(urls, [
    'https://www.wkbl.or.kr/game/sch/schedule1.asp?gun=1',
    'https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp?season_gu=047&ym=202604&viewType=1&gun=1',
    'https://www.wkbl.or.kr/game/sch/inc_list_P1.asp?season_gu=047&ym=p',
  ]);
  assert.deepEqual(games, [{
    league: 'wkbl', gameKey: 'wkbl-047-01-89', date: '2026-04-01', home: '신한은행', away: '하나은행',
    homeScore: 77, awayScore: 53, stage: '정규시즌', ref: { seasonGu: '047', gameType: '01', gameNo: '89', ym: '202604' },
  }]);
});
test('wkbl_list_dedup', async () => {
  // 같은 목록이 여러 번(탭마다·달마다·플레이오프 목록에도) 돌아와도 (game_type, game_no) 한 번만.
  const fetchImpl = route(listRoutes(listMonth, listMonth));
  const games = await listFinished(['2026-04-01', '2026-04-03', '2026-05-02'], { fetchImpl, seasonGu: '046', ...fakeClock() });
  assert.deepEqual(games.map((g) => g.gameKey), ['wkbl-046-01-89', 'wkbl-046-01-90']);
});
test('wkbl_list_filters_other_days', async () => {
  const fetchImpl = route(listRoutes(listMonth, emptyList));
  const games = await listFinished(['2026-04-03'], { fetchImpl, seasonGu: '046', ...fakeClock() });
  assert.deepEqual(games.map((g) => g.ref.gameNo), ['90']);
  assert.equal(games[0].home, '삼성생명'); assert.equal(games[0].away, '우리은행');
  assert.deepEqual([games[0].homeScore, games[0].awayScore], [50, 61]);
});
test('wkbl_list_playoff_stages', async () => {
  const fetchImpl = route(listRoutes(emptyList, listPlayoff));
  const games = await listFinished(['2026-04-08', '2026-04-22'], { fetchImpl, seasonGu: '046', ...fakeClock() });
  assert.deepEqual(games.map((g) => [g.stage, g.ref.gameType, g.ref.gameNo, g.ref.ym]), [
    ['플레이오프', '03', '1', ''], ['챔피언결정전', '04', '1', '']]);
  assert.equal(games[0].home, 'KB스타즈'); assert.equal(games[0].away, '우리은행');   // 청주체육관 = KB 홈
});
test('wkbl_unfinished_and_cup_excluded', async () => {
  const rows = listMonth.match(/<tr id="\d+" >.*?<\/tr>/gs);
  assert.equal(rows.length, 2);
  // 합성 표본(실제 미종료 행 표본은 시즌 밖이라 구할 수 없었다): 점수 칸이 비었거나, 기록 링크가 없거나, 컵(09)·정체불명 종류.
  const noScore = rows[0].replace(/<em class="txt_score">\d+<\/em>/g, '<em class="txt_score"></em>');
  const noScoreTag = rows[0].replace(/<em class="txt_score">\d+<\/em>/g, '');
  const noRecord = rows[0].replace(/<a href="\/game\/result\.asp[^>]*>.*?<\/a>/s, '');
  const cup = rows[0].replace(/game_type=01/g, 'game_type=09');
  const odd = rows[0].replace(/game_type=01/g, 'game_type=02');
  const wrap = (...r) => listMonth.replace(/<tbody>.*<\/tbody>/s, `<tbody>${r.join('')}</tbody>`);
  for (const bad of [noScore, noScoreTag, noRecord, cup, odd]) {
    const fetchImpl = route(listRoutes(wrap(bad), emptyList));
    assert.deepEqual(await listFinished(['2026-04-01'], { fetchImpl, seasonGu: '046', ...fakeClock() }), [], bad.slice(0, 80));
  }
  const fetchImpl = route(listRoutes(wrap(noScore, rows[1]), emptyList));
  const games = await listFinished(['2026-04-01', '2026-04-03'], { fetchImpl, seasonGu: '046', ...fakeClock() });
  assert.deepEqual(games.map((g) => g.ref.gameNo), ['90']);
});
test('wkbl_http_error_throws', async () => {
  const bad = async () => ({ ok: false, status: 403, text: async () => 'no' });
  await assert.rejects(listFinished(['2026-04-01'], { fetchImpl: bad, seasonGu: '046', ...fakeClock() }), /403/);
});
test('wkbl_fetch_facts_two_calls_post_form_throttled_across_calls', async () => {
  const seen = [];
  const c = fakeClock();
  const game = { league: 'wkbl', gameKey: 'wkbl-046-01-89', date: '2026-04-01', home: '신한은행', away: '하나은행',
    homeScore: 77, awayScore: 53, stage: '정규시즌', ref };
  const fetchImpl = async (u, init = {}) => {
    seen.push({ u, t: c.now(), init });
    return { ok: true, status: 200, text: async () => (u.includes('ajax_game_result_2') ? boxHtml : resultHtml) };
  };
  const f = await fetchFacts(game, { fetchImpl, ...c });
  await fetchFacts(game, { fetchImpl, ...c });
  assert.equal(seen.length, 4);
  assert.equal(seen[0].u, 'https://www.wkbl.or.kr/game/result.asp?season_gu=046&gun=1&game_type=01&game_no=89&ym=202604&viewType=1');
  assert.equal(seen[1].u, 'https://www.wkbl.or.kr/game/ajax/ajax_game_result_2.asp');
  assert.equal(seen[1].init.method, 'POST');
  assert.equal(seen[1].init.headers.Referer, 'https://www.wkbl.or.kr/game/result.asp');
  assert.equal(seen[1].init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const form = new URLSearchParams(seen[1].init.body);
  assert.deepEqual(Object.fromEntries(form), { season_gu: '046', game_type: '01', game_no: '89', ym: '202604', h_player: '', a_player: '' });
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i].t - seen[i - 1].t >= 700, `gap ${i}`);
  assert.equal(f.score.home, 77); assert.equal(f.gameKey, 'wkbl-046-01-89');
});

/* 진행 중 경기 방어: 목록 행에는 상태 칸이 없다. 오늘(KST) 경기는 시작 시각 + 2시간 30분이 지나야 끝난 경기로 본다. */
const kst = (iso) => Date.parse(`${iso}+09:00`);
const clockAt = (iso) => { const c = fakeClock(); return { sleep: c.sleep, now: () => kst(iso) }; };
const todayList = (date, time) => listMonth.replace(/id="20260401"/, `id="${date}"`).replace(/<td>19:00<\/td>/, `<td>${time}</td>`);
const gamesAt = (list, nowIso) => listFinished(['2026-04-01'], { fetchImpl: route(listRoutes(list, emptyList)), seasonGu: '046', ...clockAt(nowIso) });

test('wkbl_today_before_start_plus_2h30_excluded', async () => {
  const g = await gamesAt(listMonth, '2026-04-01T21:29:00');
  assert.deepEqual(g.filter((x) => x.ref.gameNo === '89'), []);
});
test('wkbl_today_after_start_plus_2h30_included', async () => {
  const g = await gamesAt(listMonth, '2026-04-01T21:30:00');
  assert.deepEqual(g.map((x) => x.ref.gameNo), ['89']);
});
test('wkbl_yesterday_included_regardless_of_clock', async () => {
  const g = await gamesAt(listMonth, '2026-04-02T00:05:00');
  assert.deepEqual(g.map((x) => x.ref.gameNo), ['89']);
});
test('wkbl_today_without_parseable_time_excluded', async () => {
  const noTime = listMonth.replace(/<td>19:00<\/td>/, '<td>미정</td>');
  assert.deepEqual(await gamesAt(noTime, '2026-04-01T23:59:00'), []);
  assert.deepEqual((await gamesAt(noTime, '2026-04-02T00:05:00')).map((x) => x.ref.gameNo), ['89']);   // 다음 날엔 풀린다
});
