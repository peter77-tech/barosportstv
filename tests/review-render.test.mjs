import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toFacts as kboFacts } from '../tools/review/sources/kbo.mjs';
import { toFacts as kblFacts } from '../tools/review/sources/kbl.mjs';
import { toFacts as kl1Facts } from '../tools/review/sources/kl1.mjs';
import { renderPost } from '../tools/review/render.mjs';
import { internalLinks, sportsEventJsonLd } from '../tools/review/links.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const KBO_FACTS = kboFacts((await load('tsdb-kbo-20261020')).events[0]);   // LG 트윈스(홈) vs KIA 타이거즈
const F = kblFacts({
  game: { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC',
    homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } },
  match: await load('kbl-S49G01N31-match'),
  teamRecord: await load('kbl-S49G01N31-team-record'),
  playerStat: await load('kbl-S49G01N31-player-stat'),
});
const sched = await load('kl1-schedule-2026-10');
const it187 = sched.data.scheduleList.find((x) => x.gameId === 187);
const FD = kl1Facts({
  game: { league: 'kl1', gameKey: 'kl1-187', date: it187.gameDate.replace(/\./g, '-'), home: it187.homeTeamName,
    away: it187.awayTeamName, homeScore: it187.homeGoal, awayScore: it187.awayGoal, stage: null, ref: { item: it187 } },
  record: (await load('kl1-187-record')).data, info: (await load('kl1-187-info')).data, detail: (await load('kl1-187-detail')).data,
});
const DOC = {
  meta_description: '서울 삼성이 부산 KCC를 97-86으로 꺾었다.',
  answer: '서울 삼성이 부산 KCC를 97-86으로 이겼다.',
  key_points: ['어시스트 27-16', '2점슛 성공률 74.4%'],
  body_html: '<h2>경기 흐름</h2><p>1쿼터 30-21로 앞선 서울 삼성은 4쿼터까지 격차를 지켰다.</p><ul><li><strong>케렘 칸터</strong> 30점</li></ul>',
  verdict_html: '<h2>총평</h2><p>서울 삼성의 어시스트와 2점슛이 앞선 경기였다.</p>',
};
const named = (f, h, a) => ({ ...f, home: { ...f.home, name: h }, away: { ...f.away, name: a } });

test('order_of_sections', () => {
  const h = renderPost(F, DOC, internalLinks(F, []));
  const keys = ['bstv-meta', 'bstv-answer', 'bstv-sb', '경기 흐름', 'bstv-cmp', 'bstv-pt', '총평', 'bstv-links', 'bstv-src'].map((k) => h.indexOf(k));
  assert.ok(keys.every((i) => i >= 0), JSON.stringify(keys));
  assert.deepEqual([...keys].sort((a, b) => a - b), keys);
  assert.equal(h.split('<h2>총평</h2>').length, 2);
});
test('timeline_after_player_table_for_kl1', () => {
  assert.ok(FD.timeline.length > 0);
  const h = renderPost(FD, DOC, []);
  assert.ok(h.indexOf('bstv-tl') > h.indexOf('bstv-cmp'));
  assert.ok(h.indexOf('bstv-tl') < h.indexOf('총평'));
  assert.ok(!renderPost(F, DOC, []).includes('bstv-tl'));
});
test('scoreboard_from_facts_not_ai', () => {
  const h = renderPost(F, { ...DOC, answer: '99-99', body_html: '<p>99</p>' }, []);
  const sb = h.slice(h.indexOf('bstv-sb'), h.indexOf('</table>', h.indexOf('bstv-sb')));
  for (const n of [...F.periods.home, ...F.periods.away, F.score.home, F.score.away]) assert.ok(sb.includes(`>${n}<`), String(n));
  assert.ok(!sb.includes('99'));
});
test('winner_badge_only_for_winner', () => {
  const h = renderPost(F, DOC, []);
  assert.equal((h.match(/<b>승<\/b>/g) || []).length, 1);
});
test('draw_has_no_winner_badge', () => {
  assert.equal(FD.score.home, FD.score.away);
  assert.ok(!/<b>승<\/b>/.test(renderPost(FD, { ...DOC, answer: '2-2로 비겼다.' }, [])));
});
test('links_only_from_table', () => {
  const l = internalLinks(KBO_FACTS, []);
  assert.ok(l.every(x => x.url.startsWith('https://barosportstv.com/')));
  assert.ok(l.length >= 3 && l.length <= 4);
  assert.ok(l.some(x => x.url === 'https://barosportstv.com/kbo/'));
  const withRel = internalLinks(KBO_FACTS, [
    { url: 'https://barosportstv.com/a/', title: 'A' }, { url: 'https://barosportstv.com/b/', title: 'B' },
    { url: 'https://barosportstv.com/c/', title: 'C' }, { url: 'https://evil.example/x/', title: 'X' }]);
  assert.equal(withRel.filter(x => ['A', 'B', 'C', 'X'].includes(x.label)).length, 2);
  assert.ok(withRel.every(x => x.url.startsWith('https://barosportstv.com/')));
});
test('team_page_only_when_known', () => {
  assert.ok(internalLinks(named(KBO_FACTS, '삼성 라이온즈', 'KIA 타이거즈'), []).some(x => x.url === 'https://barosportstv.com/samsung/'));
  assert.ok(!internalLinks(KBO_FACTS, []).some(x => /samsung|hanwha/.test(x.url)));
  assert.ok(internalLinks(named(KBO_FACTS, 'LG 트윈스', '한화 이글스'), []).some(x => x.url === 'https://barosportstv.com/hanwha/'));
});
test('wkbl_has_no_schedule_page', () => {
  const l = internalLinks({ ...F, league: 'wkbl' }, []);
  assert.ok(!l.some(x => /\/wkbl\/|\/kbl\//.test(x.url)));
});
test('external_link_is_official_once', () => {
  const h = renderPost(KBO_FACTS, DOC, internalLinks(KBO_FACTS, []));
  const src = h.slice(h.indexOf('bstv-src'));
  assert.equal(src.split(`href="${KBO_FACTS.source.url}"`).length - 1, 1);
  assert.equal((src.match(/<a /g) || []).length, 1);
  assert.equal((h.match(/href="https?:\/\/(?!barosportstv\.com)/g) || []).length, 1);
});
test('source_line_text', () => {
  assert.match(renderPost(F, DOC, []), /KBL 공식 기록을 바탕으로 자동 작성·사실 검수/);
  assert.match(renderPost(KBO_FACTS, DOC, []), /TheSportsDB 기록을 바탕으로 자동 작성·사실 검수/);
});
test('jsonld_sportsevent_only', () => {
  const j = sportsEventJsonLd(KBO_FACTS);
  assert.equal(j['@type'], 'SportsEvent');
  assert.equal(j.homeTeam.name, KBO_FACTS.home.full ?? KBO_FACTS.home.name);
  const withFull = sportsEventJsonLd({ ...KBO_FACTS, home: { ...KBO_FACTS.home, full: 'LG 트윈스 정식' } });
  assert.equal(withFull.homeTeam.name, 'LG 트윈스 정식');
  const s = JSON.stringify(j);
  assert.ok(!s.includes('NewsArticle') && !s.includes('FAQPage'));
  assert.ok(!('eventStatus' in j));
  const h = renderPost(KBO_FACTS, DOC, []);
  assert.ok(!h.includes('application/ld+json') && !h.includes('<script'));
});
test('escapes_html_in_names', () => {
  const h = renderPost(named(F, '<b>', 'A&B'), DOC, []);
  assert.ok(h.includes('&lt;b&gt;') && h.includes('A&amp;B'));
  const f2 = { ...F, venue: '<script>x</script>' };
  assert.ok(!renderPost(f2, DOC, []).includes('<script>x'));
});
test('bars_follow_lower_better', () => {
  const f = { ...F, teamStats: [{ label: '실책', home: 1, away: 3, lowerBetter: true }, { label: '3점슛', home: '8/20 (40.0%)', away: '5/10 (50.0%)' }] };
  const h = renderPost(f, DOC, []);
  const cmp = h.slice(h.indexOf('bstv-cmp'), h.indexOf('</table>', h.indexOf('bstv-cmp')));
  assert.match(cmp, /<strong>1<\/strong>/);
  assert.match(cmp, /<strong>5\/10 \(50\.0%\)<\/strong>/);
  assert.match(cmp, /width:25%/);
  assert.match(cmp, /<span class="bstv-bar" aria-hidden="true">/);
});
test('crowd_only_when_positive', () => {
  assert.ok(!/관중/.test(renderPost({ ...F, crowd: 0 }, DOC, [])));
  assert.match(renderPost({ ...F, crowd: 1234 }, DOC, []), /관중 1,234명/);
});
const ptHead = (h) => {
  const t = h.slice(h.indexOf('bstv-pt'), h.indexOf('</table>', h.indexOf('bstv-pt')));
  const head = t.slice(t.indexOf('<thead>'), t.indexOf('</thead>'));
  return [...head.matchAll(/<th scope="col">(.*?)<\/th>/g)].map((m) => m[1]);
};
test('player_table_one_name_and_team_column_kbl', () => {
  const h = renderPost(F, DOC, []);
  const cols = ptHead(h);
  assert.equal(cols.filter((c) => c === '선수').length, 1);
  assert.equal(cols.filter((c) => c === '팀').length, 1);
  assert.deepEqual(cols, ['선수', '팀', '시간', '득점', '리바', '어시', '스틸', '3점', '+/-']);
  const t = h.slice(h.indexOf('bstv-pt'), h.indexOf('</table>', h.indexOf('bstv-pt')));
  const row = t.slice(t.indexOf('<tbody>')).split('</tr>')[0];
  const cells = [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((m) => m[1]);
  assert.equal(cells.length, cols.length);
  assert.equal(cells.filter((c) => c === F.players[0].name).length, 1);
});
test('player_table_no_duplicate_team_column_kl1', () => {
  const cols = ptHead(renderPost(FD, DOC, []));
  assert.equal(cols.filter((c) => c === '선수').length, 1);
  assert.equal(cols.filter((c) => c === '팀').length, 1);
  assert.deepEqual(cols, FD.playerColumns);
});
