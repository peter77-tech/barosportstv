/* 바로스포츠티비 — 엔드포인트 → 프리베이크 파일 경로
   ==================================================================
   ⚠️ 이 파일이 파일 이름 규칙의 **유일한 출처**입니다.
     브라우저(`assets/data.js`)와 프리베이크 스크립트(`tools/prebake.mjs`)가
     둘 다 이걸 씁니다. 한쪽만 고치면 브라우저가 404 만 받고 사이트가
     조용히 하드코딩으로 되돌아갑니다 — 화면은 멀쩡해 보이므로 알아채기 어렵습니다.

   ⚠️ 로드 순서: 이 파일은 **맨 앞**입니다 (규칙 ⑧).
     의존성이 없고, 이걸 쓰는 것은 `data.js` 뿐입니다.

   브라우저에서는 `window.ArenaPath`, Node 에서는 `require()` 로 같은 객체가 나옵니다.
   ================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ArenaPath = factory();
}(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* 파일 이름으로 안전한 문자열. 팀명에 공백·점·슬래시·한글이 섞여 와도 안전하다. */
  function safe(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  /* 'a=1&b=2' → { a: '1', b: '2' }. 값은 퍼센트 디코딩한다
     (부르는 쪽이 encodeURIComponent 로 감싸므로 되돌려야 프리베이크와 이름이 맞는다). */
  function query(text) {
    var out = {};
    String(text || '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i < 0) return;
      var k = pair.slice(0, i);
      if (!k) return;
      try { out[k] = decodeURIComponent(pair.slice(i + 1)); }
      catch (e) { out[k] = pair.slice(i + 1); }
    });
    return out;
  }

  function fileFor(path) {
    var m = /^([A-Za-z]+)\.php\?(.+)$/.exec(String(path || ''));
    if (!m) return null;
    var endpoint = m[1].toLowerCase();
    var q = query(m[2]);

    if (endpoint === 'eventsday') {
      if (!q.d || !q.s) return null;
      return 'eventsday/' + safe(q.d) + '_' + safe(q.s) + '.json';
    }
    if (endpoint === 'searchteams') {
      if (!q.t) return null;
      return 'teams/' + safe(q.t) + '.json';
    }
    if (endpoint === 'eventsnext') {
      if (!q.id) return null;
      return 'eventsnext/' + safe(q.id) + '.json';
    }
    if (endpoint === 'lookuptable') {
      if (!q.l || !q.s) return null;
      return 'table/' + safe(q.l) + '_' + safe(q.s) + '.json';
    }
    if (endpoint === 'lookupevent') {
      if (!q.id) return null;
      return 'events/' + safe(q.id) + '.json';
    }
    return null;                    // 프리베이크하지 않는 엔드포인트
  }

  return { safe: safe, fileFor: fileFor };
}));
