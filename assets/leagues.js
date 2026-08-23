/* 바로스포츠티비 — 리그 등급
   ==================================================================
   유료급 키는 그날 전 세계 경기를 다 줍니다 — 실측 3,960경기 · 337리그.
   등급 없이 「진행중 → 예정 → 종료」로만 줄을 세우면 호주 3부리그가
   EPL·KBO 보다 앞에 옵니다(실측: 홈 헤드라인이 Australia Northern NSW NPL).

   그래서 정렬 기준을 ① 리그 등급 → ② 진행중/예정/종료 → ③ 시각 으로 둡니다.

   ⚠️ 모르는 리그는 **2군**입니다. 3군으로 밀면 새로 생긴 리그나 이름이 바뀐
     리그가 화면에서 사라집니다 — 아무도 알아채지 못합니다.

   브라우저에서는 `window.ArenaLeagues`, Node 에서는 `require()` 로 같은 객체가 나옵니다.
   ================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArenaLeagues = factory();
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* 1군 — 한국 시청자가 찾는 리그. 이름이 조금씩 달리 와도 잡히게 조각으로 본다. */
  var TOP = [
    'kbo',                      // Korean KBO League
    'k league 1', 'k-league 1',
    'english premier league',   // ⚠️ `premier league` 만 보면 홍콩·몰타까지 1군이 된다
    'spanish la liga', 'italian serie a', 'german bundesliga', 'french ligue 1',
    'nba', 'wnba', 'mlb', 'nfl', 'nhl',
    'champions league', 'europa league', 'world cup', 'nippon baseball'
  ];

  /* 3군 — 하부·마이너·유소년·예비. 위 조각과 겹쳐도 이쪽이 이긴다. */
  var LOWER = [
    'u21', 'u23', 'u19', 'u18', 'youth', 'reserve', 'academy',
    'northern premier', 'southern premier', 'isthmian', 'npl',
    'division 2', 'division 3', 'division two', 'division three',
    '2. ', 'ii division', 'liga 2', 'league two', 'league 2',
    'international league', 'pacific coast league', 'eastern league',
    'texas league', 'southern league', 'midwest league', 'california league',
    'florida state league', 'carolina league', 'sally league',
    'trophy', 'vanarama', 'regionalliga', 'oberliga', 'serie c', 'serie d',
    'lowland', 'derde divisie', 'tweede divisie', 'primera b', 'primera c',
    'segunda', 'tercera', 'liga 3', 'j3 league', 'k league 2'
  ];

  function has(haystack, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (needles[i] && haystack.indexOf(needles[i]) !== -1) return true;
    }
    return false;
  }

  /* 1 = 앞, 2 = 보통(모르는 리그 포함), 3 = 뒤 */
  function tier(league) {
    var name = String(league || '').toLowerCase();
    if (!name) return 2;
    if (has(name, LOWER)) return 3;
    if (has(name, TOP)) return 1;
    return 2;
  }

  return { tier: tier };
}));
