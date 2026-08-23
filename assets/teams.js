/* 바로스포츠티비 — 공용 팀 사전
   ==================================================================
   팀 이름을 쓰는 곳이 네 군데다. 사전을 한 곳에 모아 어긋나지 않게 한다.
     · search.js   상단바 검색 색인
     · user.js     「팀 추가」 자동완성 · 저장한 팀 표시
     · data.js     실제 데이터의 영문 팀명을 화면에 한글로 보여줄 때
     · 화면 마크업 하드코딩 (연동 실패 시 남는 내용)

   ⚠️ 저장·조회의 기준 이름은 **영문**(`en`)이다
     TheSportsDB 는 영문으로만 검색된다. 한글 이름을 API 에 넘기면
     팀을 못 찾아 기본 팀(Arsenal)이 뜬다 — 실제로 물렸습니다.
     그래서 localStorage 에도 영문을 넣고, 보여줄 때만 한글로 바꾼다.

   ⚠️ 사전에 없는 팀은 영문으로 남는다
     무료 테스트 키는 리그를 고를 수 없어 USL·아르헨티나 2부 팀이 섞여 온다.
     그런 팀까지 사전에 넣을 수는 없으므로 `ko()` 는 못 찾으면 원문을 돌려준다.

   한 줄 = [한글, 리그, 검색 별칭, 영문(API 기준), 약칭]
   ================================================================== */
(function () {
  'use strict';

  var ROWS = [
    ['아스날',       'Premier League', 'arsenal',              'Arsenal',              'ARS'],
    ['첼시',         'Premier League', 'chelsea',              'Chelsea',              'CHE'],
    ['리버풀',       'Premier League', 'liverpool',            'Liverpool',            'LIV'],
    ['맨시티',       'Premier League', 'man city manchester',  'Manchester City',      'MCI'],
    ['맨유',         'Premier League', 'man utd manchester united', 'Manchester United', 'MUN'],
    ['토트넘',       'Premier League', 'tottenham spurs',      'Tottenham',            'TOT'],
    ['뉴캐슬',       'Premier League', 'newcastle',            'Newcastle',            'NEW'],
    ['브라이턴',     'Premier League', 'brighton',             'Brighton',             'BHA'],
    ['바르셀로나',   'La Liga',        'barcelona barca',      'Barcelona',            'FCB'],
    ['세비야',       'La Liga',        'sevilla',              'Sevilla',              'SEV'],
    ['레알 마드리드', 'La Liga',       'real madrid',          'Real Madrid',          'RMA'],
    ['아틀레티코',   'La Liga',        'atletico',             'Atletico Madrid',      'ATM'],
    ['레이커스',     'NBA',            'lakers',               'Los Angeles Lakers',   'LAL'],
    ['워리어스',     'NBA',            'warriors',             'Golden State Warriors','GSW'],
    ['셀틱스',       'NBA',            'celtics',              'Boston Celtics',       'BOS'],
    ['히트',         'NBA',            'heat',                 'Miami Heat',           'MIA'],
    ['다저스',       'MLB',            'dodgers',              'Los Angeles Dodgers',  'LAD'],
    ['양키스',       'MLB',            'yankees',              'New York Yankees',     'NYY'],
    ['울산',         'K-League',       'ulsan',                'Ulsan Hyundai',        'ULS'],
    ['전북',         'K-League',       'jeonbuk',              'Jeonbuk Motors',       'JBM'],
    ['LG 트윈스',    'KBO',            'lg twins 엘지',        'LG Twins',             'LG'],

    /* KBO·NPB — 리그 등급 1군에 올라와 홈 첫 화면을 차지하므로 사전에 넣는다.
       영문 이름은 추측하지 않고 프리베이크 데이터에서 그대로 옮겼다
       (2026-08-23 실측). API 이름과 한 글자라도 다르면 팀을 못 찾는다. */
    ['두산 베어스',  'KBO',            'doosan bears 두산',    'Doosan Bears',         'OB'],
    ['KT 위즈',      'KBO',            'kt wiz 케이티',        'KT Wiz',               'KT'],
    ['SSG 랜더스',   'KBO',            'ssg landers 랜더스',   'SSG Landers',          'SSG'],
    ['NC 다이노스',  'KBO',            'nc dinos 엔씨',        'NC Dinos',             'NC'],
    ['KIA 타이거즈', 'KBO',            'kia tigers 기아',      'Kia Tigers',           'KIA'],
    ['삼성 라이온즈', 'KBO',           'samsung lions 삼성',   'Samsung Lions',        'SS'],
    ['롯데 자이언츠', 'KBO',           'lotte giants 롯데',    'Lotte Giants',         'LOT'],
    ['한화 이글스',  'KBO',            'hanwha eagles 한화',   'Hanwha Eagles',        'HH'],
    ['키움 히어로즈', 'KBO',           'kiwoom heroes 키움',   'Kiwoom Heroes',        'KIW'],

    ['요미우리',     'NPB',            'yomiuri giants 자이언츠', 'Yomiuri Giants',    'YOM'],
    ['한신',         'NPB',            'hanshin tigers 타이거스', 'Hanshin Tigers',    'HAN'],
    ['주니치',       'NPB',            'chunichi dragons 드래곤즈', 'Chunichi Dragons', 'CHU'],
    ['히로시마',     'NPB',            'hiroshima carp 카프',  'Hiroshima Toyo Carp',  'HIR'],
    ['야쿠르트',     'NPB',            'yakult swallows 스왈로즈', 'Tokyo Yakult Swallows', 'YAK'],
    ['요코하마',     'NPB',            'yokohama dena baystars 베이스타즈', 'Yokohama DeNA BayStars', 'YOK'],
    ['소프트뱅크',   'NPB',            'softbank hawks 호크스', 'Fukuoka SoftBank Hawks', 'SFT'],
    ['세이부',       'NPB',            'seibu lions 라이온즈', 'Saitama Seibu Lions',  'SEI'],
    ['라쿠텐',       'NPB',            'rakuten eagles 이글스', 'Tohoku Rakuten Golden Eagles', 'RAK'],
    ['지바 롯데',    'NPB',            'chiba lotte marines 마린스', 'Chiba Lotte Marines', 'CLM'],
    ['오릭스',       'NPB',            'orix buffaloes 버팔로즈', 'Orix Buffaloes',    'ORI'],
    ['니혼햄',       'NPB',            'nippon ham fighters 파이터즈', 'Hokkaido Nippon-Ham Fighters', 'NIP']
  ];

  var LIST = ROWS.map(function (r) {
    return { ko: r[0], league: r[1], alias: r[2], en: r[3], abbr: r[4] };
  });

  function norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, ''); }

  var BY_EN = {};
  LIST.forEach(function (t) { BY_EN[norm(t.en)] = t; });

  /* 영문 팀명 → 사전 항목. 없으면 null.
     API 가 'Arsenal FC' 처럼 접미사를 붙여 오는 경우가 있어 부분 일치도 본다. */
  function get(name) {
    var n = norm(name);
    if (!n) return null;
    if (BY_EN[n]) return BY_EN[n];
    for (var i = 0; i < LIST.length; i++) {
      var e = norm(LIST[i].en);
      if (n.indexOf(e) === 0 || e.indexOf(n) === 0) return LIST[i];
    }
    return null;
  }

  /* 화면에 보여줄 이름. 사전에 없으면 원문을 그대로 돌려준다. */
  function ko(name) {
    var t = get(name);
    return t ? t.ko : String(name || '');
  }

  /* 약칭. 사전에 없으면 null (부르는 쪽에서 API 값이나 자동 약칭을 쓴다) */
  function abbr(name) {
    var t = get(name);
    return t ? t.abbr : null;
  }

  /* 「팀 추가」 자동완성 — 한글·영문·별칭·리그 전부로 찾는다 */
  function find(query, max) {
    var n = norm(query);
    if (!n) return [];
    var hits = [];
    for (var i = 0; i < LIST.length && hits.length < (max || 6); i++) {
      var t = LIST[i];
      if (norm(t.ko).indexOf(n) >= 0 || norm(t.en).indexOf(n) >= 0 ||
          norm(t.alias).indexOf(n) >= 0 || norm(t.league).indexOf(n) >= 0) {
        hits.push(t);
      }
    }
    return hits;
  }

  window.ArenaTeams = { list: LIST, get: get, ko: ko, abbr: abbr, find: find };
})();
