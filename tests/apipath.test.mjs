import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ArenaPath = require('../assets/apipath.js');

test('safe: 소문자로 바꾸고 안전하지 않은 글자를 _ 로 모은다', () => {
  assert.equal(ArenaPath.safe('Manchester City'), 'manchester_city');
  assert.equal(ArenaPath.safe('American Football'), 'american_football');
  assert.equal(ArenaPath.safe('Bayer 04 Leverkusen'), 'bayer_04_leverkusen');
  assert.equal(ArenaPath.safe('  Real   Madrid  '), 'real_madrid');
  assert.equal(ArenaPath.safe('FC/Köln'), 'fc_k_ln');
  assert.equal(ArenaPath.safe('2026-08-23'), '2026-08-23');
});

test('eventsday 매핑', () => {
  assert.equal(
    ArenaPath.fileFor('eventsday.php?d=2026-08-23&s=Soccer'),
    'eventsday/2026-08-23_soccer.json'
  );
});

test('eventsday: 인자 순서가 바뀌어도 같은 파일', () => {
  assert.equal(
    ArenaPath.fileFor('eventsday.php?s=Soccer&d=2026-08-23'),
    'eventsday/2026-08-23_soccer.json'
  );
});

test('eventsday: 퍼센트 인코딩된 종목명을 되돌린다', () => {
  assert.equal(
    ArenaPath.fileFor('eventsday.php?d=2026-08-23&s=American%20Football'),
    'eventsday/2026-08-23_american_football.json'
  );
});

test('searchteams 매핑', () => {
  assert.equal(ArenaPath.fileFor('searchteams.php?t=Liverpool'), 'teams/liverpool.json');
  assert.equal(
    ArenaPath.fileFor('searchteams.php?t=Manchester%20City'),
    'teams/manchester_city.json'
  );
});

test('eventsnext 매핑', () => {
  assert.equal(ArenaPath.fileFor('eventsnext.php?id=133602'), 'eventsnext/133602.json');
});

test('lookuptable 매핑', () => {
  assert.equal(
    ArenaPath.fileFor('lookuptable.php?l=4328&s=2025-2026'),
    'table/4328_2025-2026.json'
  );
});

test('lookupevent 매핑', () => {
  assert.equal(ArenaPath.fileFor('lookupevent.php?id=2052641'), 'events/2052641.json');
});

test('모르는 엔드포인트는 null — 부르는 쪽이 하드코딩으로 되돌아간다', () => {
  assert.equal(ArenaPath.fileFor('lookuptimeline.php?id=1'), null);
  assert.equal(ArenaPath.fileFor('eventsday.php'), null);
  assert.equal(ArenaPath.fileFor(''), null);
});
