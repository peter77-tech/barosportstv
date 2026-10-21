/* 바로스포츠티비 — 사용자 데이터 (localStorage)
   ==================================================================
   시안에는 「팀 추가」·알림 토글·관심 경기가 그려져 있지만 눌러도 아무 일이
   없었다. 서버가 없으므로 브라우저에 저장해 **같은 기기에서는 유지**되게 한다.

   ⚠️ 진짜 알림은 보내지 않는다 (BD 확정 2026-08-20)
     서버가 없어 푸시를 보낼 수 없다. 그래서 「알림」 버튼은 **켠 상태를 기억**만
     하고, 대시보드의 「예정 알림」 수와 버튼 모양에 반영한다.
     지키지 못할 약속을 화면에 쓰지 않는다는 뜻이다.

   ⚠️ 저장하는 팀 이름은 **영문**이다
     TheSportsDB 는 영문으로만 검색된다. 보여줄 때만 `ArenaTeams.ko()` 로 바꾼다.

   ⚠️ 경기 행은 data.js 가 다시 그린다
     그래서 버튼에 리스너를 직접 달지 않고 **document 위임**으로 받는다.
     (한 번 담아두면 새로 그린 행에는 안 걸립니다 — 실제로 물렸습니다)

   ⚠️ 화면 판별은 그 화면에만 있는 요소로 한다
     `[data-role="team-name"]` 은 팀 허브와 대시보드 카드가 함께 쓴다.

   저장 키
     arena.teams  ["Arsenal", …]                 팔로우한 팀 (영문)
     arena.watch  [{key,label}, …]               알림 켠 경기
     arena.notif  {kickoff:true, goal:true, …}   알림 설정 스위치
     arena.seeded "1"                            시연용 기본값을 이미 넣었음
   ================================================================== */
(function () {
  'use strict';

  var T = window.ArenaTeams;
  var PREFIX = 'arena.';
  var DEMO_TEAMS = ['Arsenal', 'Barcelona', 'Los Angeles Lakers', 'Los Angeles Dodgers'];

  /* ── 저장소 ────────────────────────────────────────────
     사생활 보호 모드에서는 localStorage 접근 자체가 예외를 던진다.
     그때는 메모리에만 담아 화면이 죽지 않게 한다. */
  var memory = {};
  var usable = (function () {
    try {
      window.localStorage.setItem(PREFIX + 'probe', '1');
      window.localStorage.removeItem(PREFIX + 'probe');
      return true;
    } catch (e) { return false; }
  })();

  function read(key, fallback) {
    try {
      var raw = usable ? window.localStorage.getItem(PREFIX + key) : memory[key];
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    try {
      if (usable) window.localStorage.setItem(PREFIX + key, raw);
      else memory[key] = raw;
    } catch (e) { memory[key] = raw; }
  }

  /* ── 상태 ─────────────────────────────────────────────── */
  // 첫 방문에는 시연용 4팀을 넣어 지금 화면과 같게 보이게 한다.
  // 사용자가 일부러 다 지운 경우와 구분하려고 표시를 남긴다.
  if (!read('seeded', null)) {
    if (!read('teams', null)) write('teams', DEMO_TEAMS.slice());
    write('seeded', '1');
  }

  var listeners = [];
  function emit(what) {
    listeners.forEach(function (fn) { try { fn(what); } catch (e) { console.warn(e); } });
  }

  function teams() { return read('teams', []) || []; }

  function hasTeam(en) {
    var n = String(en || '').toLowerCase();
    return teams().some(function (t) { return t.toLowerCase() === n; });
  }

  function addTeam(en) {
    if (!en || hasTeam(en)) return false;
    var next = teams();
    next.push(en);
    write('teams', next);
    emit('teams');
    return true;
  }

  function removeTeam(en) {
    var n = String(en || '').toLowerCase();
    write('teams', teams().filter(function (t) { return t.toLowerCase() !== n; }));
    emit('teams');
  }

  function watch() { return read('watch', []) || []; }

  function hasWatch(key) {
    return watch().some(function (w) { return w.key === key; });
  }

  function toggleWatch(key, label) {
    if (!key) return false;
    var next = watch();
    var on = !hasWatch(key);
    if (on) next.push({ key: key, label: label || key });
    else next = next.filter(function (w) { return w.key !== key; });
    write('watch', next);
    emit('watch');
    return on;
  }

  var NOTIF_DEFAULT = { kickoff: true, goal: true, final: false, news: true };

  function notif() {
    var saved = read('notif', null);
    var out = { kickoff: NOTIF_DEFAULT.kickoff, goal: NOTIF_DEFAULT.goal, final: NOTIF_DEFAULT.final, news: NOTIF_DEFAULT.news };
    if (saved) Object.keys(saved).forEach(function (k) { out[k] = !!saved[k]; });
    return out;
  }

  function setNotif(key, on) {
    var cur = notif();
    cur[key] = !!on;
    write('notif', cur);
    emit('notif');
  }

  window.ArenaUser = {
    teams: teams, hasTeam: hasTeam, addTeam: addTeam, removeTeam: removeTeam,
    watch: watch, hasWatch: hasWatch, toggleWatch: toggleWatch,
    notif: notif, setNotif: setNotif,
    onChange: function (fn) { listeners.push(fn); }
  };

  /* ══════════════════════════════════════════════════════════
     여기서부터 화면 연결
     ══════════════════════════════════════════════════════════ */

  /* ── 알림 설정 스위치 (대시보드) ─────────────────────────
     app.js 에 있던 토글을 여기로 옮겼다. 모양 바꾸는 코드가 두 곳에 있으면
     복원한 상태와 눌렀을 때 모양이 갈라진다. */
  function paintSwitch(sw, on) {
    sw.setAttribute('aria-checked', String(on));
    sw.classList.toggle('bg-hermes-orange', on);
    sw.classList.toggle('bg-surface-container-highest', !on);
    var knob = sw.querySelector('span[aria-hidden]');
    if (knob) {
      knob.classList.toggle('translate-x-6', on);
      knob.classList.toggle('translate-x-1', !on);
    }
  }

  var switches = document.querySelectorAll('.notif-toggle');
  if (switches.length) {
    var savedNotif = notif();
    Array.prototype.forEach.call(switches, function (sw) {
      var key = sw.getAttribute('data-notif');
      // 저장 키가 없는 스위치는 예전처럼 모양만 바뀐다 (다른 화면에 생겨도 안전)
      if (key && Object.prototype.hasOwnProperty.call(savedNotif, key)) paintSwitch(sw, savedNotif[key]);
      sw.addEventListener('click', function () {
        var on = sw.getAttribute('aria-checked') !== 'true';
        paintSwitch(sw, on);
        if (key) setNotif(key, on);
      });
    });
  }

  /* ── 관심 경기 「알림」 버튼 ───────────────────────────────
     경기 일정·대시보드·팀 허브에 있다. data.js 가 행을 다시 그리므로 위임으로 받는다.

     경기를 무엇으로 구분하는가:
       ① 행(또는 버튼)의 `data-match` — data.js 가 실제 데이터의 idEvent 를 넣는다
       ② 없으면 화면에 보이는 대결 이름 ('아스날 vs 첼시') — 하드코딩 행용        */
  /* 버튼이 속한 "경기 한 건"을 찾는다.
     목록 화면은 `li`, 팀 허브의 다음 경기 카드는 `div` 라서 태그로 잡을 수 없다.
     그래서 표시 이름을 들고 있는 요소(`data-match-label`)도 후보에 넣는다. */
  function rowOf(btn) {
    return btn.closest('[data-match]') || btn.closest('[data-match-label]') ||
      btn.closest('li') || btn.parentElement;
  }

  function matchLabel(btn) {
    var row = rowOf(btn);
    if (!row) return null;
    if (row.getAttribute && row.getAttribute('data-match-label')) return row.getAttribute('data-match-label');
    var m = row.querySelector && row.querySelector('[data-role="match"]');
    if (m) return m.textContent.trim();
    var home = row.querySelector && row.querySelector('[data-role="home"]');
    var away = row.querySelector && row.querySelector('[data-role="away"]');
    if (home && away) return home.textContent.trim() + ' vs ' + away.textContent.trim();
    return null;
  }

  function matchKey(btn) {
    var row = rowOf(btn);
    var explicit = btn.getAttribute('data-match') ||
      (row && row.getAttribute && row.getAttribute('data-match'));
    return explicit || matchLabel(btn);
  }

  /* 버튼 모양. 켜면 주황 테두리 + 「알림 켬」 으로 바뀐다.
     ⚠️ 글자만 바꾸면 안 된다 — 껐을 때 주황 테두리가 남는다. */
  function paintNotify(btn, on) {
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('border-hermes-orange', on);
    btn.classList.toggle('text-primary', on);
    btn.classList.toggle('border-outline-variant', !on);
    btn.classList.toggle('text-on-surface-variant', !on);

    var icon = btn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = on ? 'notifications_active' : 'notifications';

    /* 아이콘을 뺀 글자 노드만 갈아끼운다 (아이콘까지 지우면 다시 만들어야 한다).
       버튼 폭이 넓은 팀 허브는 문장을 쓰고, 좁은 목록 행은 짧게 쓴다. */
    var wide = btn.getAttribute('data-notify-wide') === 'true';
    var text = on
      ? (wide ? '경기 시작 알림 켜짐' : '알림 켬')
      : (wide ? '경기 시작 알림 받기' : '알림');

    var replaced = false;
    Array.prototype.forEach.call(btn.childNodes, function (n) {
      if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = text; replaced = true; }
    });
    if (!replaced) btn.appendChild(document.createTextNode(text));
  }

  function paintAllNotify() {
    Array.prototype.forEach.call(document.querySelectorAll('.notify-btn'), function (btn) {
      var key = matchKey(btn);
      paintNotify(btn, !!key && hasWatch(key));
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.notify-btn');
    if (!btn) return;
    e.preventDefault();          // <a> 로 남아 있는 경우 이동을 막는다
    e.stopPropagation();         // 경기 카드의 이동 처리(app.js)에 걸리지 않게 한다
    var key = matchKey(btn);
    if (!key) return;
    paintNotify(btn, toggleWatch(key, matchLabel(btn)));
  });

  paintAllNotify();
  // data.js / data-pages.js 가 행을 다시 그린 뒤 상태를 다시 입히려고 부른다
  window.ArenaUser.repaintNotify = paintAllNotify;

  /* ── 내 팀 목록 (대시보드) ───────────────────────────────
     저장한 팀 수만큼 카드를 만든다. 하드코딩 카드 하나를 본으로 복제하므로
     스타일이 갈라지지 않는다 (data.js 의 경기 행과 같은 방식).            */
  var teamList = document.querySelector('[data-my-teams]');
  var teamTpl = null;
  if (teamList) {
    var first = teamList.querySelector('[data-role="team-card"]');
    if (first) teamTpl = first.cloneNode(true);
  }

  var renderedHooks = [];
  // data-pages.js 가 카드에 실제 일정을 채우려고 쓴다
  window.ArenaUser.onTeamsRendered = function (fn) { renderedHooks.push(fn); };

  function renderTeams() {
    if (!teamList || !teamTpl) return;
    var list = teams();
    teamList.innerHTML = '';

    var empty = document.querySelector('[data-my-teams-empty]');
    if (empty) empty.hidden = list.length > 0;

    list.forEach(function (en) {
      var card = teamTpl.cloneNode(true);
      var dict = T && T.get(en);
      card.hidden = false;
      card.setAttribute('data-team', en);

      var abbr = card.querySelector('[data-role="team-abbr"]');
      if (abbr) abbr.textContent = (dict && dict.abbr) || en.slice(0, 3).toUpperCase();

      var name = card.querySelector('[data-role="team-name"]');
      if (name) {
        name.textContent = (dict && dict.ko) || en;
        name.href = 'team-hub.html?team=' + encodeURIComponent(en);
      }

      var meta = card.querySelector('[data-role="team-meta"]');
      if (meta) meta.textContent = (dict && dict.league) || '';

      // 실제 다음 경기 날짜는 data-pages.js 가 채운다. 그 전에는 빈 칸으로 둔다
      // (하드코딩 날짜를 남기면 방금 추가한 팀에 엉뚱한 날짜가 붙는다)
      var when = card.querySelector('[data-role="team-when"]');
      if (when) when.textContent = '';

      var x = card.querySelector('[data-remove-team]');
      if (x) x.setAttribute('aria-label', ((dict && dict.ko) || en) + ' 팔로우 해제');

      teamList.appendChild(card);
    });

    renderedHooks.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
  }

  // 팀 카드의 삭제(X)
  if (teamList) {
    teamList.addEventListener('click', function (e) {
      var x = e.target.closest && e.target.closest('[data-remove-team]');
      if (!x) return;
      e.preventDefault();
      var card = x.closest('[data-team]');
      if (card) removeTeam(card.getAttribute('data-team'));
    });
  }

  /* ── 팀 추가 (대시보드) ─────────────────────────────────── */
  var addBtn = document.querySelector('[data-add-team-toggle]');
  var addBox = document.querySelector('[data-add-team]');
  var addInput = addBox && addBox.querySelector('input');
  var addResults = addBox && addBox.querySelector('[data-add-team-results]');

  function closeAdd() {
    if (!addBox) return;
    addBox.hidden = true;
    if (addBtn) addBtn.setAttribute('aria-expanded', 'false');
    if (addInput) addInput.value = '';
    if (addResults) addResults.innerHTML = '';
  }

  function renderAddResults() {
    if (!addResults || !addInput || !T) return;
    addResults.innerHTML = '';
    if (!addInput.value.trim()) return;

    var hits = T.find(addInput.value, 6);

    if (!hits.length) {
      var none = document.createElement('li');
      none.className = 'px-3 py-2 font-body-sm text-on-surface-variant';
      none.textContent = '해당하는 팀이 없습니다';
      addResults.appendChild(none);
      return;
    }

    hits.forEach(function (t) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'w-full text-left px-3 py-2 rounded hover:bg-surface-container-highest flex items-center justify-between gap-3 transition-colors';
      b.disabled = hasTeam(t.en);

      var left = document.createElement('span');
      left.className = 'min-w-0';
      var n1 = document.createElement('span');
      n1.className = 'block font-body-md font-semibold text-on-surface truncate';
      n1.textContent = t.ko;
      var n2 = document.createElement('span');
      n2.className = 'block font-body-sm text-on-surface-variant truncate';
      n2.textContent = t.league + ' · ' + t.en;
      left.appendChild(n1);
      left.appendChild(n2);

      var tag = document.createElement('span');
      tag.className = 'font-label-caps text-[10px] uppercase shrink-0 ' +
        (b.disabled ? 'text-on-surface-variant' : 'text-primary');
      tag.textContent = b.disabled ? '추가됨' : '추가';

      b.appendChild(left);
      b.appendChild(tag);
      b.addEventListener('click', function () {
        if (addTeam(t.en)) closeAdd();
      });
      li.appendChild(b);
      addResults.appendChild(li);
    });
  }

  if (addBtn && addBox) {
    addBtn.addEventListener('click', function () {
      var open = addBox.hidden;
      addBox.hidden = !open;
      addBtn.setAttribute('aria-expanded', String(open));
      if (open) { if (addInput) addInput.focus(); }
      else closeAdd();
    });
    if (addInput) {
      addInput.addEventListener('input', renderAddResults);
      addInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeAdd(); if (addBtn) addBtn.focus(); }
      });
    }
  }

  /* ── 팀 허브 「팔로우」 ─────────────────────────────────── */
  var followBtn = document.querySelector('[data-follow]');
  // 팀 허브에만 있는 h1 을 기준으로 팀을 잡는다 (자리 이름은 대시보드 카드와 겹친다)
  var hubTitle = document.querySelector('h1[data-role="team-name"]');

  /* 이 화면이 다루는 팀의 **영문** 이름. 저장·조회는 모두 영문으로 한다.
     ⚠️ h1 의 글자를 읽으면 안 된다 — 연동되면 한글로 바뀌므로 사전에서 못 찾는다.
        그래서 `data-pages.js` 가 영문 원문을 `data-team-en` 으로 남겨 준다. */
  function currentHubTeam() {
    var param = new URLSearchParams(location.search).get('team');
    if (param) return param;
    var resolved = hubTitle && hubTitle.getAttribute('data-team-en');
    if (resolved) return resolved;
    // 아직 연동 전이면 하드코딩 기본 팀이다 (팀 허브의 h1 은 '아스날')
    var dict = T && hubTitle && T.get(hubTitle.textContent.trim());
    if (dict) return dict.en;
    return 'Arsenal';
  }

  function paintFollow() {
    if (!followBtn) return;
    var on = hasTeam(currentHubTeam());
    followBtn.setAttribute('aria-pressed', String(on));
    /* ⚠️ 켤 때 `bg-white/10` 을 **빼야** 한다. 같은 성격의 유틸리티(배경색)는
       HTML 의 클래스 순서가 아니라 CSS 파일에 적힌 순서가 이긴다. 그래서
       `bg-hermes-orange` 를 더하기만 하면 주황이 안 보인다 (실제로 물렸습니다). */
    followBtn.classList.toggle('bg-white/10', !on);
    followBtn.classList.toggle('hover:bg-white/20', !on);
    followBtn.classList.toggle('bg-primary-container', on);
    followBtn.classList.toggle('hover:bg-primary-hover', on);
    followBtn.classList.toggle('border-hermes-orange', on);
    followBtn.classList.toggle('border-white/25', !on);
    var icon = followBtn.querySelector('.material-symbols-outlined');
    if (icon) icon.textContent = on ? 'check' : 'add';
    var label = followBtn.querySelector('[data-follow-label]');
    if (label) label.textContent = on ? '팔로우 중' : '팔로우';
  }

  if (followBtn && hubTitle) {
    followBtn.addEventListener('click', function () {
      var en = currentHubTeam();
      if (hasTeam(en)) removeTeam(en);
      else addTeam(en);
      paintFollow();
    });
    paintFollow();
    // 연동이 끝나 영문 원문(`data-team-en`)이 붙으면 다시 칠한다
    window.ArenaUser.repaintFollow = paintFollow;
  }

  /* ── 요약 숫자 (대시보드 KPI) ─────────────────────────── */
  function renderKpi() {
    var t = teams();
    var order = [];
    var byLeague = {};
    t.forEach(function (en) {
      var d = T && T.get(en);
      var key = d ? d.league : '기타';
      if (!byLeague[key]) order.push(key);
      byLeague[key] = (byLeague[key] || 0) + 1;
    });

    var teamCount = document.querySelector('[data-kpi="teams"]');
    if (teamCount) teamCount.textContent = String(t.length);

    var teamNote = document.querySelector('[data-kpi="teams-note"]');
    if (teamNote) {
      teamNote.textContent = order.length
        ? order.map(function (k) { return k + ' ' + byLeague[k]; }).join(' · ')
        : '아직 없습니다';
    }

    var watchCount = document.querySelector('[data-kpi="watch"]');
    if (watchCount) watchCount.textContent = String(watch().length);
  }

  renderTeams();
  renderKpi();

  window.ArenaUser.onChange(function (what) {
    if (what === 'teams') { renderTeams(); paintFollow(); }
    renderKpi();
  });
})();
