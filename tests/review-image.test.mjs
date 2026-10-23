import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { cardText, makeCard, bgPath, FONT_PATH, missingGlyphs } from '../tools/review/image.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';
import { LEAGUES } from '../tools/review/config.mjs';
import { toFacts as kblFacts } from '../tools/review/sources/kbl.mjs';
import { toFacts as wkblFacts } from '../tools/review/sources/wkbl.mjs';
import { toFacts as kovoFacts } from '../tools/review/sources/kovo.mjs';
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
  const sportOf = { kbo: 'baseball', kl1: 'soccer', kbl: 'basketball', wkbl: 'basketball', vm: 'volleyball', vw: 'volleyball' };
  for (const [lg, sport] of Object.entries(sportOf)) {
    assert.ok(bgPath(lg).split(/[\\/]/).slice(-4).join('/') === `assets/review/bg/${sport}.jpg`, bgPath(lg));
    assert.ok(existsSync(bgPath(lg)), `${lg} 배경 파일이 있어야 한다`);
  }
  assert.equal(bgPath('kbl'), bgPath('wkbl'));
  assert.equal(bgPath('vm'), bgPath('vw'));
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

/* ── 글꼴 글자 범위 검사 ── */
const text = (n) => readFile(new URL(`./fixtures/review/${n}`, import.meta.url), 'utf8');
const firstWord = (n) => n.split(/\s+/)[0];

test('glyph_coverage_known_names', async () => {
  const names = new Set();
  for (const map of Object.values(ALIASES)) for (const [k, v] of Object.entries(map)) { names.add(k); names.add(v); names.add(firstWord(v)); }
  for (const l of Object.values(LEAGUES)) names.add(l.titleName);
  const teams = await readFile(new URL('../assets/teams.js', import.meta.url), 'utf8');
  for (const m of teams.matchAll(/\[\s*'([^']+)',\s*'KBO'/g)) { names.add(m[1]); names.add(firstWord(m[1])); }
  assert.ok(names.size > 40);

  const rows = (await load('kovo-list')).payload.content;
  const facts = [kbo, kl1Win, kl1Draw,
    kblFacts({ game: { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC', homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } },
      match: await load('kbl-S49G01N31-match'), teamRecord: await load('kbl-S49G01N31-team-record'), playerStat: await load('kbl-S49G01N31-player-stat') }),
    wkblFacts({ resultHtml: await text('wkbl-result-046-01-89.html'), boxHtml: await text('wkbl-box-046-01-89.html'), ref: { seasonGu: '046', gameType: '01', gameNo: '89', ym: '202604' } }),
    kovoFacts({ schedule: rows.find((r) => r.gnum === 262), detail: (await load('kovo-detail-262')).payload }),
    kovoFacts({ schedule: rows.find((r) => r.gnum === 265), detail: (await load('kovo-detail-265')).payload })];
  for (const f of facts) { names.add(f.home.short); names.add(f.away.short); const t = cardText(f); names.add(t.big); names.add(t.small); }

  const bad = [...names].map((n) => [n, missingGlyphs(n)]).filter(([, m]) => m.length);
  assert.deepEqual(bad, []);
});

test('glyph_missing_detected_and_card_throws', async () => {
  assert.deepEqual(missingGlyphs('전북 3 : 2 제주 · K리그1'), []);
  assert.deepEqual(missingGlyphs('뷁'), ['뷁']);   // U+BDC1 — 글꼴에 없는 음절
  const f = structuredClone(kl1Win); f.home.short = '뷁';
  await assert.rejects(() => makeCard(f), /카드 글꼴에 없는 글자: 뷁/);
});

test('font_declares_bold_family', async () => {
  const buf = await readFile(FONT_PATH);
  const be = Buffer.from('Noto Sans KR Bold', 'utf16le').swap16();
  assert.ok(buf.includes(be), '글꼴 이름표에 「Noto Sans KR Bold」가 있어야 한다');
  assert.ok(!buf.includes(Buffer.from('Thin', 'utf16le').swap16()), '「Thin」 이름표가 남아 있으면 안 된다');
});
