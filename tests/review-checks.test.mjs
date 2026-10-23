import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkDoc } from '../tools/review/checks.mjs';
import { toFacts as kblFacts } from '../tools/review/sources/kbl.mjs';
import { toFacts as kl1Facts } from '../tools/review/sources/kl1.mjs';
import { titleFor } from '../tools/review/config.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const F = kblFacts({
  game: { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC',
    homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } },
  match: await load('kbl-S49G01N31-match'),
  teamRecord: await load('kbl-S49G01N31-team-record'),
  playerStat: await load('kbl-S49G01N31-player-stat'),
});
const EXP = titleFor('kbl', '2026년 10월21일 서울 삼성 vs 부산 KCC');
const good = {
  meta_description: '서울 삼성이 부산 KCC를 97-86으로 꺾었다.',
  answer: '서울 삼성이 부산 KCC를 97-86으로 이겼다.',
  key_points: ['어시스트 27-16', '2점슛 성공률 74.4%'],
  body_html: '<h2>경기 흐름</h2><p>1쿼터 30-21로 앞선 서울 삼성은 4쿼터까지 격차를 지켰다.</p><ul><li><strong>케렘 칸터</strong> 30점</li></ul>',
  verdict_html: '<p>서울 삼성의 어시스트와 2점슛이 앞선 경기였다.</p>',
};

const sched = await load('kl1-schedule-2026-10');
const it187 = sched.data.scheduleList.find((x) => x.gameId === 187);
const FD = kl1Facts({
  game: { league: 'kl1', gameKey: 'kl1-187', date: it187.gameDate.replace(/\./g, '-'), home: it187.homeTeamName,
    away: it187.awayTeamName, homeScore: it187.homeGoal, awayScore: it187.awayGoal, stage: null, ref: { item: it187 } },
  record: (await load('kl1-187-record')).data, info: (await load('kl1-187-info')).data, detail: (await load('kl1-187-detail')).data,
});

test('good_doc_passes', () => {
  const r = checkDoc(good, F, EXP, EXP);
  assert.deepEqual(r.issues, []);
  assert.equal(r.ok, true);
});
test('title_must_match_exactly', () => assert.equal(checkDoc(good, F, 'KBL 2026년 10월21일 서울 삼성 썬더스 부산 KCC 이지스 경기 리뷰', EXP).ok, false));
test('only_allowed_tags', () => {
  for (const bad of ['<table></table>', '<a href="x">x</a>', '<script></script>', '<p style="x">x</p>'])
    assert.equal(checkDoc({ ...good, body_html: bad }, F, EXP, EXP).ok, false);
});
test('unknown_number_flagged', () => {
  const d = { ...good, answer: '서울 삼성이 99-86으로 이겼다.' };
  assert.ok(checkDoc(d, F, EXP, EXP).issues.some(i => /99/.test(i.problem)));
});
test('derived_numbers_allowed', () => {
  const d = { ...good, answer: '서울 삼성이 97-86, 11점 차로 이겼다. 어시스트 27-16, 2점 득점 64-50, 3쿼터 22-13.' };
  assert.equal(checkDoc(d, F, EXP, EXP).ok, true);
});
test('banned_phrases', () => {
  for (const p of ['기록에 없다', '데이터상', '때문에 이겼다', '점수 차를 설명한다', '경기 내내 앞섰다'])
    assert.equal(checkDoc({ ...good, verdict_html: `<p>${p}</p>` }, F, EXP, EXP).ok, false);
});
test('draw_no_winner_words', () => {
  assert.equal(FD.score.home, FD.score.away);
  const ok = { ...good, meta_description: '2-2 무승부.', key_points: ['2-2'], answer: '2-2로 비겼다.', body_html: '<p>양 팀이 2-2로 맞섰다.</p>', verdict_html: '<p>승부는 갈리지 않았다.</p>' };
  assert.equal(checkDoc(ok, FD, EXP, EXP).ok, true);
  for (const w of ['서울이 이겼다', '서울의 승리였다', '서울이 김천을 꺾었다'])
    assert.equal(checkDoc({ ...ok, answer: w }, FD, EXP, EXP).ok, false);
});
test('stoppage_minute_is_one_token', () => {
  const fx = { ...FD, ai: { ...FD.ai, timeline: ['전반 45+9분 득점 제주 네게바'] } };
  const ok = { ...good, meta_description: '2-2 무승부.', key_points: ['2-2'], answer: '2-2로 비겼다.', body_html: '<p>전반 45+9분에 골이 나왔다.</p>', verdict_html: '<p>무승부.</p>' };
  assert.equal(checkDoc(ok, fx, EXP, EXP).ok, true);
  const bad = { ...ok, body_html: '<p>전반 45+7분에 골이 나왔다.</p>' };
  assert.ok(checkDoc(bad, fx, EXP, EXP).issues.some(i => /45\+7/.test(i.problem)));
});
test('missing_or_malformed_fields_fail_not_throw', () => {
  assert.equal(checkDoc({}, F, EXP, EXP).ok, false);
  assert.equal(checkDoc(null, F, EXP, EXP).ok, false);
  for (const f of ['meta_description', 'answer', 'body_html', 'verdict_html'])
    for (const v of ['', '  ', undefined, 5])
      assert.equal(checkDoc({ ...good, [f]: v }, F, EXP, EXP).ok, false, `${f}=${v}`);
  for (const v of [undefined, 'x', [], [''], [1], {}])
    assert.equal(checkDoc({ ...good, key_points: v }, F, EXP, EXP).ok, false);
  assert.equal(checkDoc(good, F, undefined, undefined).ok, false);
  assert.equal(checkDoc(good, F, '', '').ok, false);
});
test('hidden_markup_rejected', () => {
  for (const bad of ['<p>a</p><!-- 99점 -->', '<![CDATA[x]]>', '<?php echo 1 ?>', '<p>x</p><img src=x onerror=alert(1)', '<p>1 < 2</p>'])
    assert.equal(checkDoc({ ...good, body_html: bad }, F, EXP, EXP).ok, false, bad);
});
test('negative_cases_in_other_fields', () => {
  assert.ok(checkDoc({ ...good, body_html: '<p>99점을 넣었다.</p>' }, F, EXP, EXP).issues.some(i => /99/.test(i.problem)));
  assert.ok(checkDoc({ ...good, key_points: ['99점'] }, F, EXP, EXP).issues.some(i => /99/.test(i.problem)));
  assert.equal(checkDoc({ ...good, verdict_html: '<p class="a">x</p>' }, F, EXP, EXP).ok, false);
  assert.equal(checkDoc({ ...good, verdict_html: '<a href="x">x</a>' }, F, EXP, EXP).ok, false);
  const ok = { ...good, meta_description: '2-2 무승부.', key_points: ['2-2'], answer: '2-2로 비겼다.', verdict_html: '<p>무승부.</p>' };
  assert.equal(checkDoc({ ...ok, body_html: '<p>서울이 이겼다.</p>' }, FD, EXP, EXP).ok, false);
});
