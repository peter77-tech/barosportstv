import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ArenaLeagues = require('../assets/leagues.js');

test('1군 리그가 가장 앞이다', () => {
  assert.equal(ArenaLeagues.tier('English Premier League'), 1);
  assert.equal(ArenaLeagues.tier('Korean KBO League'), 1);
  assert.equal(ArenaLeagues.tier('MLB'), 1);
  assert.equal(ArenaLeagues.tier('NBA'), 1);
  assert.equal(ArenaLeagues.tier('NFL'), 1);
  assert.equal(ArenaLeagues.tier('South Korean K League 1'), 1);
  assert.equal(ArenaLeagues.tier('UEFA Champions League'), 1);
});

test('그 밖의 1부리그는 2군이다', () => {
  assert.equal(ArenaLeagues.tier('Dutch Eredivisie'), 2);
  assert.equal(ArenaLeagues.tier('Portuguese Primeira Liga'), 2);
});

test('하부·마이너·유소년 리그는 3군으로 뒤로 밀린다', () => {
  assert.equal(ArenaLeagues.tier('Australia Northern NSW NPL'), 3);
  assert.equal(ArenaLeagues.tier('English Northern Premier League Premier Division'), 3);
  assert.equal(ArenaLeagues.tier('International League'), 3, '마이너리그(AAA)');
  assert.equal(ArenaLeagues.tier('Pacific Coast League'), 3, '마이너리그(AAA)');
  assert.equal(ArenaLeagues.tier('English U21 Premier League'), 3);
});

test('모르는 리그는 2군으로 둔다 — 3군으로 밀면 새 리그가 사라진다', () => {
  assert.equal(ArenaLeagues.tier('Something Brand New Cup'), 2);
  assert.equal(ArenaLeagues.tier(''), 2);
  assert.equal(ArenaLeagues.tier(undefined), 2);
});

test('한국·주요 리그는 이름이 조금 달라도 잡는다', () => {
  assert.equal(ArenaLeagues.tier('KBO League'), 1);
  assert.equal(ArenaLeagues.tier('K League 1'), 1);
});

/* 실측 2026-08-23: `premier league` 조각만 보면 「Hong-Kong Premier League」·
   「Malta Premier League」 같은 리그가 1군으로 올라와 홈 카드를 차지한다.
   EPL 은 응답에 항상 `English Premier League` 로 온다 — 그 이름으로 잡는다. */
test('이름에 premier league 가 들어간 다른 나라 리그는 1군이 아니다', () => {
  assert.equal(ArenaLeagues.tier('Hong-Kong Premier League'), 2);
  assert.equal(ArenaLeagues.tier('Malta Premier League'), 2);
  assert.equal(ArenaLeagues.tier('English Premier League'), 1, 'EPL 은 그대로 1군');
});

/* 실측 2026-08-23: 리그 이름 조각이 느슨하면 같은 이름을 쓰는 다른 나라 리그가
   1군으로 올라온다 (Hong-Kong Premier League · Tunisian Ligue 1 이 실제로 홈에 떴다).
   TheSportsDB 는 유럽 5대 리그를 항상 국가명과 함께 준다 — 그 이름으로 잡는다. */
test('같은 이름을 쓰는 다른 나라 리그는 1군이 아니다', () => {
  assert.equal(ArenaLeagues.tier('Tunisian Ligue 1'), 2);
  assert.equal(ArenaLeagues.tier('Austrian Bundesliga'), 2);
  assert.equal(ArenaLeagues.tier('Brazilian Serie A'), 2);
  assert.equal(ArenaLeagues.tier('Venezuelan La Liga'), 2);
});

test('유럽 5대 리그는 국가명이 붙은 이름으로 1군이다', () => {
  assert.equal(ArenaLeagues.tier('English Premier League'), 1);
  assert.equal(ArenaLeagues.tier('Spanish La Liga'), 1);
  assert.equal(ArenaLeagues.tier('Italian Serie A'), 1);
  assert.equal(ArenaLeagues.tier('German Bundesliga'), 1);
  assert.equal(ArenaLeagues.tier('French Ligue 1'), 1);
});

