/* 바로스포츠티비 — 구조화 데이터 (JSON-LD)
   ==================================================================
   각 화면의 `<head>` 에는 사이트 전체를 설명하는 `WebSite` 만 정적으로 넣어 둔다.
   경기·팀 정보는 **실제 데이터가 온 뒤에** 이 파일이 만들어 붙인다.

   ⚠️ 왜 정적으로 안 박는가
     하드코딩 경기('아스날 vs 첼시')를 JSON-LD 로 박으면, 화면은 실제 데이터로
     바뀌어도 검색엔진에는 **없는 경기**를 알려주게 된다. 그건 거짓 정보다.
     그래서 화면에 실제로 그려진 경기만 내보낸다.

   ⚠️ 없는 것을 주장하지 않는다
     · `BroadcastEvent`·`offers` 를 넣지 않는다 — 방송권 계약이 없다 (BD 항목)
     · `eventStatus` 는 **예정** 경기에만 붙인다 — schema.org 에 '종료' 상태가 없다
     · 뉴스 화면은 구조화 데이터를 넣지 않는다 — 기사가 자리표시자 문구다 (BD 항목)

   ⚠️ 도메인이 정해지기 전이다
     정적 `WebSite`·`canonical` 은 `https://example.com` 을 쓴다 (BD 항목: 배포 위치).
     여기서 만드는 `url` 은 **지금 열려 있는 주소를 기준으로** 계산하므로,
     실제 도메인에 올리면 자동으로 맞는 주소가 된다.
   ================================================================== */
(function () {
  'use strict';

  /* 상대 경로를 지금 열린 주소 기준의 절대 주소로 바꾼다.
     로컬 파일로 열면 file:// 주소가 되지만, 배포하면 실제 주소가 된다. */
  function abs(href) {
    try { return new URL(href, location.href).href; } catch (e) { return href; }
  }

  /* 같은 이름(id)으로 다시 부르면 앞서 넣은 것을 갈아끼운다.
     경기 목록은 날짜 칩을 누를 때마다 다시 그려지므로 쌓이면 안 된다. */
  function publish(id, data) {
    if (!data) return;
    var el = document.querySelector('script[type="application/ld+json"][data-seo="' + id + '"]');
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo', id);
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data, null, 2);
  }

  function team(name) {
    if (!name) return undefined;
    var T = window.ArenaTeams;
    var dict = T && T.get(name);
    var out = { '@type': 'SportsTeam', name: name };
    // 한글 이름이 있으면 별칭으로 함께 알려준다 (한국어 검색에 걸리게)
    if (dict && dict.ko && dict.ko !== name) out.alternateName = dict.ko;
    return out;
  }

  /* 경기 한 건. `ev` 는 TheSportsDB 응답, `state` 는 live/upcoming/finished */
  function sportsEvent(ev, state, url) {
    if (!ev || !ev.strHomeTeam || !ev.strAwayTeam) return null;
    var A = window.ArenaData;
    var start = A && A.localTime ? A.localTime(ev) : null;

    var out = {
      '@type': 'SportsEvent',
      name: ev.strHomeTeam + ' vs ' + ev.strAwayTeam,
      homeTeam: team(ev.strHomeTeam),
      awayTeam: team(ev.strAwayTeam)
    };
    if (start) out.startDate = start.toISOString();
    if (ev.strLeague) out.superEvent = { '@type': 'SportsEvent', name: ev.strLeague };
    if (ev.strVenue) out.location = { '@type': 'Place', name: ev.strVenue };
    if (url) out.url = abs(url);
    // schema.org 에 '종료' 상태가 없다. 예정 경기에만 붙인다.
    if (state === 'upcoming') out.eventStatus = 'https://schema.org/EventScheduled';
    return out;
  }

  /* 경기 목록 → ItemList. 화면에 보이는 순서를 그대로 알려준다. */
  function eventList(id, rows, listName) {
    var items = [];
    rows.forEach(function (r) {
      var e = sportsEvent(r.ev, r.state, r.url);
      if (e) items.push({ '@type': 'ListItem', position: items.length + 1, item: e });
    });
    if (!items.length) return;
    publish(id, {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: listName,
      numberOfItems: items.length,
      itemListElement: items
    });
  }

  /* 팀 한 곳 (팀 허브) */
  function sportsTeam(id, t) {
    if (!t || !t.strTeam) return;
    var T = window.ArenaTeams;
    var dict = T && T.get(t.strTeam);
    var out = {
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: t.strTeam,
      url: abs(location.pathname + location.search)
    };
    if (dict && dict.ko && dict.ko !== t.strTeam) out.alternateName = dict.ko;
    if (t.strLeague) out.memberOf = { '@type': 'SportsOrganization', name: t.strLeague };
    if (t.strSport) out.sport = t.strSport;
    /* 연고지(`strLocation`)를 `foundingLocation` 에 넣지 않는다 — 그건 **창단지**를
       뜻한다. 응답에는 창단지가 없으므로 홈 구장만 `location` 으로 알려준다. */
    if (t.strStadium) out.location = { '@type': 'Place', name: t.strStadium };
    // 팀 로고·배지는 구단 상표라 쓰지 않는다 (`assets/img/출처.md` 기준)
    publish(id, out);
  }

  /* 빵가루 (중계 화면) */
  function breadcrumb(id, items) {
    var list = items.filter(function (i) { return i && i.name; }).map(function (i, n) {
      var li = { '@type': 'ListItem', position: n + 1, name: i.name };
      if (i.url) li.item = abs(i.url);
      return li;
    });
    if (list.length < 2) return;
    publish(id, {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: list
    });
  }

  window.ArenaSeo = {
    abs: abs,
    publish: publish,
    sportsEvent: sportsEvent,
    eventList: eventList,
    sportsTeam: sportsTeam,
    breadcrumb: breadcrumb
  };
})();
