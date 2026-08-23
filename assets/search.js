/* ARENA LIVE — 상단바 검색 (자동완성 드롭다운)
   ------------------------------------------------------------------
   지금은 색인이 이 파일 안에 하드코딩돼 있습니다. 실제 데이터를 붙일 때는
   INDEX 배열만 서버 응답으로 갈아끼우면 되고 아래 로직은 그대로 씁니다.
   항목 형식: { label, kind, url, meta, alias }
     label  화면에 보이는 이름
     kind   팀 / 경기 / 뉴스 / 종목 / 화면  (배지로 표시)
     url    이동할 주소
     meta   오른쪽에 작게 붙는 부가 설명
     alias  영문 등 추가 검색어 (공백으로 구분)
   ------------------------------------------------------------------ */
(function () {
  'use strict';

  /* 팀 목록은 `assets/teams.js` 의 공용 사전을 쓴다.
     여기에 또 적으면 두 곳이 갈라진다 (실제로 팀을 늘릴 때마다 물립니다).
     사전이 없으면(스크립트 누락) 팀 항목만 빠지고 나머지 색인은 그대로 돈다. */
  var TEAMS = ((window.ArenaTeams && window.ArenaTeams.list) || []).map(function (t) {
    return [t.ko, t.league, t.alias, t.en];
  });

  var LEAGUES = [
    ['Premier League', 'premier-league', 'epl 프리미어리그 축구'],
    ['La Liga', 'la-liga', '라리가 축구'],
    ['NBA', 'nba', '농구'],
    ['MLB', 'mlb', '야구'],
    ['K-League', 'k-league', 'k리그 케이리그 축구'],
    ['NFL', 'nfl', '미식축구'],
    ['F1', 'f1', '포뮬러원 모터스포츠']
  ];

  var MATCHES = [
    ['아스날 vs 첼시', 'Premier League · 진행 중', 'match-center.html'],
    ['레이커스 vs 워리어스', 'NBA · 진행 중', 'match-center.html'],
    ['바르셀로나 vs 세비야', 'La Liga · 진행 중', 'match-center.html'],
    ['리버풀 vs 맨시티', '오늘 21:00', 'schedule.html?sport=premier-league'],
    ['레알 마드리드 vs 아틀레티코', '오늘 23:30', 'schedule.html?sport=la-liga']
  ];

  var NEWS = [
    '사무국, 다음 시즌 대회 방식 전면 개편 발표',
    '주전 포인트가드, 발목 부상으로 4~6주 결장',
    '최대 이변: 무시드 신인이 세계 1위를 꺾다',
    '전술 분석: 새 미드필드 3인이 바꾼 경기 양상',
    '감독 인터뷰: 더비 승리의 열쇠는 전방 압박이었다'
  ];

  var PAGES = [
    ['홈', 'index.html', '오늘의 중계와 주요 소식'],
    ['경기 일정', 'schedule.html', '오늘부터 일주일간'],
    ['중계 화면', 'match-center.html', '실시간 스코어·통계'],
    ['팀 허브', 'team-hub.html', '전력·순위·일정'],
    ['뉴스 센터', 'news.html', '속보·이적·분석'],
    ['내 대시보드', 'dashboard.html', '내 팀·알림 설정']
  ];

  var INDEX = []
    .concat(TEAMS.map(function (t) {
      /* 팀 허브는 TheSportsDB 의 영문 팀명으로 조회한다 (t[3]).
         한국어 이름만 넘기면 팀을 못 찾아 기본 팀(Arsenal)이 뜬다. */
      return {
        label: t[0], kind: '팀', meta: t[1], alias: (t[2] || '') + ' ' + (t[3] || ''),
        url: t[3] ? 'team-hub.html?team=' + encodeURIComponent(t[3]) : 'team-hub.html'
      };
    }))
    .concat(LEAGUES.map(function (l) {
      return { label: l[0], kind: '종목', url: 'schedule.html?sport=' + l[1], meta: '경기 일정', alias: l[2] };
    }))
    .concat(MATCHES.map(function (m) {
      return { label: m[0], kind: '경기', url: m[2], meta: m[1], alias: '' };
    }))
    .concat(NEWS.map(function (n) {
      return { label: n, kind: '뉴스', url: 'news.html', meta: '스포츠 뉴스', alias: '' };
    }))
    .concat(PAGES.map(function (p) {
      return { label: p[0], kind: '화면', url: p[1], meta: p[2], alias: '' };
    }));

  var MAX = 7;

  function norm(v) {
    return String(v || '').toLowerCase().replace(/\s+/g, '');
  }

  function search(q) {
    var needle = norm(q);
    if (!needle) return [];
    var hits = [];
    for (var i = 0; i < INDEX.length; i++) {
      var item = INDEX[i];
      var pos = norm(item.label).indexOf(needle);
      if (pos < 0 && norm(item.alias).indexOf(needle) >= 0) pos = 50; // 별칭으로 걸린 건 뒤로
      if (pos < 0) continue;
      hits.push({ item: item, score: pos });
    }
    hits.sort(function (a, b) { return a.score - b.score; });
    return hits.slice(0, MAX).map(function (h) { return h.item; });
  }

  var KIND_STYLE = {
    '팀': 'bg-apex-blue/10 text-apex-blue',
    '경기': 'bg-hermes-orange/10 text-primary',
    '뉴스': 'bg-surface-container-highest text-on-surface-variant',
    '종목': 'bg-apex-blue/10 text-apex-blue',
    '화면': 'bg-surface-container-highest text-on-surface-variant'
  };

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function init(form) {
    var input = form.querySelector('input[type="search"]');
    if (!input) return;

    var listId = 'site-search-results';
    var list = document.createElement('ul');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', '검색 결과');
    list.className = 'search-results hidden absolute right-0 top-full mt-2 w-80 max-w-[80vw] z-50 rounded-xl overflow-hidden';
    form.appendChild(list);

    var live = document.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    form.appendChild(live);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'off');

    var results = [];
    var active = -1;

    function close() {
      list.classList.add('hidden');
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      results = [];
      active = -1;
    }

    function paintActive() {
      Array.prototype.forEach.call(list.children, function (li, i) {
        var on = i === active;
        li.setAttribute('aria-selected', String(on));
        li.classList.toggle('is-active', on);
      });
      if (active >= 0) input.setAttribute('aria-activedescendant', 'search-opt-' + active);
      else input.removeAttribute('aria-activedescendant');
    }

    function go(i) {
      if (results[i]) location.href = results[i].url;
    }

    function render(q) {
      results = search(q);
      active = -1;

      if (!results.length) {
        if (!norm(q)) { close(); return; }
        list.innerHTML = '<li class="px-4 py-3 font-body-sm text-on-surface-variant">검색 결과가 없습니다.</li>';
        list.classList.remove('hidden');
        input.setAttribute('aria-expanded', 'true');
        live.textContent = '검색 결과가 없습니다.';
        return;
      }

      list.innerHTML = results.map(function (r, i) {
        return '<li id="search-opt-' + i + '" role="option" aria-selected="false" data-idx="' + i + '"' +
          ' class="search-option flex items-center gap-2 px-4 py-2.5 cursor-pointer">' +
          '<span class="shrink-0 px-2 py-0.5 rounded-pill font-label-caps text-[10px] ' + KIND_STYLE[r.kind] + '">' + escapeHtml(r.kind) + '</span>' +
          '<span class="font-body-sm text-on-surface truncate flex-1">' + escapeHtml(r.label) + '</span>' +
          '<span class="font-label-caps text-[10px] text-secondary truncate shrink-0">' + escapeHtml(r.meta) + '</span>' +
          '</li>';
      }).join('');
      list.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      live.textContent = results.length + '건의 결과';
      paintActive();
    }

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('focus', function () { if (input.value) render(input.value); });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (!results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        active = (active + 1) % results.length;
        paintActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = active <= 0 ? results.length - 1 : active - 1;
        paintActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        go(active >= 0 ? active : 0);
      }
    });

    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('[data-idx]');
      if (!li) return;
      e.preventDefault(); // blur 로 목록이 닫히기 전에 이동시킨다
      go(Number(li.getAttribute('data-idx')));
    });

    list.addEventListener('mousemove', function (e) {
      var li = e.target.closest('[data-idx]');
      if (!li) return;
      active = Number(li.getAttribute('data-idx'));
      paintActive();
    });

    /* xl 아래에서는 검색상자가 숨고 아이콘 버튼만 남는다.
       버튼이 아무 일도 하지 않으면 모바일에서는 검색을 아예 못 쓰므로,
       누르면 상단바 아래로 검색상자를 펼친다. (스타일은 app.css) */
    var mobileBtn = null;
    var header = form.closest('header');
    if (header) {
      mobileBtn = Array.prototype.filter.call(header.querySelectorAll('button'), function (b) {
        var sr = b.querySelector('.sr-only');
        return sr && sr.textContent.trim() === '검색';
      })[0] || null;
    }

    function closeMobile() {
      form.classList.remove('search-open');
      if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
    }

    if (mobileBtn) {
      mobileBtn.setAttribute('aria-expanded', 'false');
      mobileBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = form.classList.toggle('search-open');
        mobileBtn.setAttribute('aria-expanded', String(open));
        if (open) input.focus();
        else close();
      });
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMobile();
    });

    document.addEventListener('click', function (e) {
      if (form.contains(e.target)) return;
      if (mobileBtn && mobileBtn.contains(e.target)) return;
      close();
      closeMobile();
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('form[role="search"]'), init);
})();
