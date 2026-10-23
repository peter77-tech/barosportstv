import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { cardText, makeCard, bgPath, FONT_PATH } from '../tools/review/image.mjs';
import { toFacts as kboFacts } from '../tools/review/sources/kbo.mjs';
import { toFacts as kl1Facts } from '../tools/review/sources/kl1.mjs';

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

const kbo = kboFacts((await load('tsdb-kbo-20261020')).events[0]);   // 원정 KIA 13 : 홈 LG 1
const kl1Win = kl1Facts(await bundle(190));
const kl1Draw = kl1Facts(await bundle(187));                          // 2 : 2

test('card_text_winner_first', () => {
  assert.deepEqual(cardText(kbo), {
    big: 'KIA 13 : 1 LG',
    small: '2026.10.20 · KBO리그',
    alt: 'KIA 13 : 1 LG · 2026.10.20 · KBO리그',
  });
});

test('card_text_home_win_keeps_home_first', () => {
  const f = structuredClone(kbo);
  f.score = { home: 5, away: 2 };
  assert.equal(cardText(f).big, 'LG 5 : 2 KIA');
});

test('card_text_draw', () => {
  const t = cardText(kl1Draw);
  assert.equal(t.big, `${kl1Draw.home.short} 2 : 2 ${kl1Draw.away.short}`);
  assert.equal(t.small, `${kl1Draw.date.replace(/-/g, '.')} · K리그1`);
  assert.equal(t.alt, `${t.big} · ${t.small}`);
});

test('card_text_kl1_winner_first', () => {
  const t = cardText(kl1Win);
  const { home, away } = kl1Win.score;
  const w = home >= away ? kl1Win.home : kl1Win.away;
  assert.ok(t.big.startsWith(`${w.short} `), t.big);
});

test('card_uses_league_bg', () => {
  for (const lg of ['kbo', 'kl1', 'kbl', 'wkbl', 'vm', 'vw']) {
    assert.ok(bgPath(lg).split(/[\\/]/).slice(-4).join('/') === `assets/review/bg/${lg}.jpg`, bgPath(lg));
    assert.ok(existsSync(bgPath(lg)), `${lg} 배경 파일이 있어야 한다`);
  }
  assert.ok(existsSync(FONT_PATH));
  assert.throws(() => bgPath('xx'));
});

test('card_is_1200x630', async () => {
  const buf = await makeCard(kbo);
  const m = await sharp(buf).metadata();
  assert.equal(m.format, 'jpeg');
  assert.equal(m.width, 1200);
  assert.equal(m.height, 630);
});

test('card_renders_korean_glyphs', async () => {
  // 글꼴이 한글을 못 그리면 글자 자리가 빈 칸이라 배경만 남는다 — 같은 팀 이름이 다른 점수 카드와 달라야 한다.
  const a = await sharp(await makeCard(kl1Win)).raw().toBuffer();
  const f = structuredClone(kl1Win); f.home.short = '가'; f.away.short = '나';
  const b = await sharp(await makeCard(f)).raw().toBuffer();
  assert.notDeepEqual(a, b);
});
