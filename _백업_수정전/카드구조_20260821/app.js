/* ARENA LIVE — 인터랙션
 * 시안은 정적 HTML이라 동작이 없었다. 화면에 그려진 UI가 실제로 반응하도록 최소 구현한다.
 */
(function () {
  'use strict';

  var body = document.body;
  var mqDesktop = window.matchMedia('(min-width: 769px)');

  /* ── 사이드바 ─────────────────────────────────────────── */
  var toggle = document.getElementById('sidebar-toggle');
  var scrim = document.getElementById('scrim');

  function sidebarState() {
    return body.getAttribute('data-sidebar') || '';
  }

  function setSidebar(state) {
    body.setAttribute('data-sidebar', state);
    var expanded = mqDesktop.matches ? state !== 'collapsed' : state === 'open';
    if (toggle) toggle.setAttribute('aria-expanded', String(expanded));
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      if (mqDesktop.matches) {
        setSidebar(sidebarState() === 'collapsed' ? '' : 'collapsed');
      } else {
        setSidebar(sidebarState() === 'open' ? '' : 'open');
      }
    });
  }

  if (scrim) scrim.addEventListener('click', function () { setSidebar(''); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebarState() === 'open') {
      setSidebar('');
      if (toggle) toggle.focus();
    }
  });

  // 데스크톱 ↔ 모바일 전환 시 상태가 어긋나지 않게 초기화
  mqDesktop.addEventListener('change', function () { setSidebar(''); });

  /* ── 리그 탭 · 종목 필터 ──────────────────────────────────
     사이드바 종목 링크가 schedule.html?sport=<슬러그> 로 들어온다.
     경기 행의 data-league 값과 맞춰 걸러낸다. 실제 데이터를 붙일 때도
     행에 data-league 만 넣어주면 이 로직을 그대로 쓸 수 있다.        */
  var chips = document.querySelectorAll('.league-chip');
  var selected = 'all';

  // 경기 행은 data.js 가 실제 데이터로 다시 그릴 수 있으므로 그때그때 다시 찾는다.
  // (한 번 담아두면 새로 그린 행에는 필터가 걸리지 않는다 — 실제로 물렸습니다)
  function currentRows() { return document.querySelectorAll('li[data-league]'); }

  function applyLeague(league) {
    selected = league;
    Array.prototype.forEach.call(chips, function (c) {
      c.setAttribute('aria-selected', String(c.getAttribute('data-league') === league));
    });

    Array.prototype.forEach.call(currentRows(), function (row) {
      row.hidden = !(league === 'all' || row.getAttribute('data-league') === league);
    });

    // 구역별로 남은 경기가 없으면 안내문을 띄우고 LIVE 개수를 다시 센다
    Array.prototype.forEach.call(document.querySelectorAll('[data-schedule-day]'), function (day) {
      var visible = Array.prototype.filter.call(day.querySelectorAll('li[data-league]'), function (r) {
        return !r.hidden;
      });
      var note = day.querySelector('.schedule-empty');
      if (note) note.classList.toggle('hidden', visible.length > 0);

      var counter = day.querySelector('[data-live-count]');
      if (counter) {
        var liveCount = visible.filter(function (r) {
          return r.querySelector('.pulse-live');
        }).length;
        counter.textContent = String(liveCount);
        // 0건이면 빨간 LIVE 배지 자체를 감춘다
        var badge = counter.parentElement;
        if (badge) badge.hidden = liveCount === 0;
      }
    });
  }

  // 걸러낼 경기 행이 있는 화면(경기 일정)에서만 필터로 동작한다.
  // 뉴스·홈·중계 화면의 칩은 예전처럼 선택 표시만 바꾼다.
  var filterable = currentRows().length > 0;

  // data.js 가 경기 목록을 다시 그린 뒤 현재 선택을 다시 걸기 위해 노출한다.
  window.ArenaLeagueFilter = {
    apply: applyLeague,
    reapply: function () { if (filterable) applyLeague(selected); },
    selected: function () { return selected; }
  };

  Array.prototype.forEach.call(chips, function (chip) {
    chip.addEventListener('click', function () {
      if (!filterable) {
        Array.prototype.forEach.call(chips, function (c) {
          c.setAttribute('aria-selected', String(c === chip));
        });
        return;
      }
      var league = chip.getAttribute('data-league') || 'all';
      applyLeague(league);
      history.replaceState(null, '', league === 'all' ? location.pathname : location.pathname + '?sport=' + league);
    });
  });

  if (filterable) {
    var wanted = (new URLSearchParams(location.search).get('sport') || 'all').toLowerCase();
    var known = Array.prototype.some.call(chips, function (c) { return c.getAttribute('data-league') === wanted; });
    applyLeague(known ? wanted : 'all');
  }

  /* ── 날짜 탭 (경기 일정) ──────────────────────────────── */
  var dates = document.querySelectorAll('.date-chip');
  Array.prototype.forEach.call(dates, function (chip) {
    chip.addEventListener('click', function () {
      Array.prototype.forEach.call(dates, function (c) {
        c.setAttribute('aria-selected', String(c === chip));
      });
      // 실제 구현에서는 여기서 해당 날짜의 일정을 불러온다
    });
  });

  /* ── 알림 토글 (대시보드) ───────────────────────────────
     `assets/user.js` 로 옮겼다. 켠 상태를 localStorage 에 저장해야 하는데,
     모양 바꾸는 코드가 두 곳에 있으면 복원한 모양과 눌렀을 때 모양이 갈라진다. */

  /* ── 경기 카드 ────────────────────────────────────────── */
  Array.prototype.forEach.call(document.querySelectorAll('.match-card'), function (card) {
    card.addEventListener('click', function (e) {
      /* 카드 안의 팀명 링크나 알림 버튼을 눌렀을 때는 카드 이동을 하지 않는다.
         ⚠️ 알림 버튼은 `<button>` 이라 `a` 검사에 걸리지 않는다. 카드가 부모라
            카드 리스너가 먼저 돌기 때문에 user.js 에서 막을 수 없다. */
      if (e.target.closest && (e.target.closest('a') || e.target.closest('.notify-btn'))) return;
      var href = card.getAttribute('data-href');
      if (href) window.location.href = href;
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });

  /* ── 경과 시간 자동 갱신 ──────────────────────────────────
   * 목업 데이터. 실제로는 서버/웹소켓에서 받은 값으로 교체한다.
   */
  // 진행 중인 경기의 '72'' 같은 경과 분만 1분마다 올린다.
  // ⚠️ 킥오프 시각('21:30')이나 쿼터 표기('Q3 4:12')를 올리면 '24:30' 처럼 망가진다.
  //    그래서 ① 요소가 아직 data-clock 을 달고 있는지 ② 글자가 경과 분 모양인지 매번 확인한다.
  //    (data-pages.js 는 예정·종료 경기를 그릴 때 data-clock 을 떼어 낸다)
  var MINUTE_CLOCK = /^\d{1,3}(\+\d{1,2})?'?$/;

  if (document.querySelector('[data-clock]')) {
    setInterval(function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-clock]'), function (el) {
        var text = el.textContent.trim();
        if (!MINUTE_CLOCK.test(text)) return;
        var m = /^(\d+)/.exec(text);
        if (m) el.textContent = text.replace(/^\d+/, String(Number(m[1]) + 1));
      });
    }, 60000);
  }
})();
