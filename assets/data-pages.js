/* 바로스포츠티비 — 홈 · 중계 화면 · 팀 허브 · 대시보드 데이터 연동
   ==================================================================
   공용 코드는 `assets/data.js` 의 `window.ArenaData` 를 쓴다.
   이 파일은 화면마다 "채울 자리(data-role)"를 찾아서 값을 넣기만 한다.
   해당 자리가 없는 화면에서는 아무 일도 하지 않는다.

   여기서도 **점진적 향상**을 지킨다 — 응답이 없으면 하드코딩 내용을 남긴다.

   ⚠️ 무료 테스트 키의 한계로 채우지 못하는 것 (하드코딩으로 남김)
     · 중계 화면의 「경기 기록」·「주요 장면」 — 통계·타임라인 응답이 비어 있음
     · 팀 허브의 「최근 5경기」·「선수단」·「팀 뉴스」 — 최근 경기는 1건만 옴
     · 팀 허브의 「클린시트」 — 순위표에 없는 값
     · 대시보드의 KPI·「최근 시청」 — 사용자 데이터라 출처 자체가 없음
   ================================================================== */
(function () {
  'use strict';

  var A = window.ArenaData;
  if (!A) return;

  var U = window.ArenaUser;    // 사용자 저장값 (없으면 대시보드 개인화만 건너뛴다)

  /* 같은 팀을 여러 번 조회하지 않게 담아 둔다.
     팀을 추가·삭제하면 카드를 다시 그리는데, 그때마다 API 를 또 부르면
     무료 키의 호출 한도를 금방 쓴다. */
  var teamCache = {};

  function lookupTeam(name) {
    if (teamCache[name]) return teamCache[name];
    teamCache[name] = A.getJson('searchteams.php?t=' + encodeURIComponent(name))
      .then(function (j) { return (j && j.teams && j.teams[0]) || null; });
    return teamCache[name];
  }

  function q(root, role) { return root.querySelector('[data-role="' + role + '"]'); }

  function set(root, role, text) {
    var el = q(root, role);
    if (el && text !== null && text !== undefined && text !== '') el.textContent = text;
    return el;
  }

  function href(root, role, url) {
    var el = q(root, role);
    if (el && el.tagName === 'A') el.href = url;
    return el;
  }

  /* 시각 칸을 채운다.
     ⚠️ 진행 중이 아닌 경기에서는 `data-clock` 을 떼어 낸다 — app.js 의 경과분 시계가
        '21:30' 같은 킥오프 시각을 1분마다 올려 '24:30' 으로 망가뜨립니다 (실제로 물렸습니다) */
  function setClock(root, ev) {
    var el = q(root, 'clock');
    if (!el) return;
    var state = A.statusOf(ev);
    el.textContent = state === 'finished' ? '종료' : A.clockText(ev);
    if (state !== 'live') el.removeAttribute('data-clock');
  }

  function whenText(ev) {
    // '오늘 21:00' / '08.24 (월) 21:00' 처럼 보여준다
    var t = A.localTime(ev);
    if (!t) return A.clockText(ev);
    var base = A.today();
    var days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - base) / 86400000);
    if (days === 0) return '오늘 ' + A.hhmm(t);
    if (days === 1) return '내일 ' + A.hhmm(t);
    return A.mmdd(t) + ' (' + A.weekday[t.getDay()] + ') ' + A.hhmm(t);
  }

  /* ══════════════════ 홈 — Currently Live + 히어로 ══════════════════ */
  function initHome() {
    var grid = document.querySelector('[data-home-live]');
    if (!grid) return;

    A.eventsForLocalDay(A.today()).then(function (events) {
      if (!events.length) return;      // 하드코딩 유지

      var ordered = A.byInterest(events);
      var liveCount = events.filter(function (e) { return A.statusOf(e) === 'live'; }).length;
      var cards = grid.querySelectorAll('.match-card');

      Array.prototype.forEach.call(cards, function (card, i) {
        var ev = ordered[i];
        if (!ev) { card.hidden = true; return; }

        var state = A.statusOf(ev);
        set(card, 'league', A.leagueLabel(ev.strLeague));
        setClock(card, ev);
        set(card, 'home-abbr', A.abbrOf(ev.strHomeTeam));
        set(card, 'away-abbr', A.abbrOf(ev.strAwayTeam));
        set(card, 'home', A.teamName(ev.strHomeTeam));
        set(card, 'away', A.teamName(ev.strAwayTeam));

        var hs = q(card, 'home-score'), as = q(card, 'away-score');
        /* 점수가 없으면 가운데 구분 기호도 뺀다 — 안 빼면 「– - –」 로 줄줄이 보인다.
           (구분 기호는 색을 주지 않는다. BD 확정 2026-08-21) */
        var sep = q(card, 'score-sep');
        if (sep) sep.style.display = state === 'upcoming' ? 'none' : '';
        if (state === 'upcoming') {
          if (hs) hs.textContent = '–';
          if (as) as.textContent = '–';
        } else {
          if (hs) hs.textContent = ev.intHomeScore;
          if (as) as.textContent = ev.intAwayScore;
        }

        /* 카드 이동과 읽어 줄 이름은 카드를 덮는 링크 하나가 맡는다.
           이전에는 `<article>` 에 role="link" + aria-label 을 달았으나,
           Lighthouse 가 「부적절한 ARIA 역할」로 지적해 구조를 바꿨다. */
        href(card, 'card-link', A.matchHref(ev));
        set(card, 'card-label',
          A.leagueLabel(ev.strLeague) + ' ' + A.teamName(ev.strHomeTeam) + ' 대 ' +
          A.teamName(ev.strAwayTeam) + ', ' +
          (state === 'live' ? A.clockText(ev) + ' 진행 중' : state === 'finished' ? '종료' : A.clockText(ev) + ' 예정'));
      });

      /* 구조화 데이터 — 카드로 **보이는 만큼만** 내보낸다.
         `ordered` 를 다 넣으면 화면에 없는 경기까지 알려주게 된다. */
      if (window.ArenaSeo) {
        var shown = ordered.slice(0, cards.length).map(function (ev) {
          return { ev: ev, state: A.statusOf(ev), url: A.matchHref(ev) };
        });
        window.ArenaSeo.eventList('home-live', shown, '오늘의 경기');
      }

      // 진행 중인 경기가 없으면 빨간 'Currently Live' 배지를 그대로 두면 안 된다
      var heading = document.querySelector('[data-role="live-heading"]');
      var badge = document.querySelector('[data-role="live-badge"]');
      var count = document.querySelector('[data-role="live-count"]');

      if (count) count.textContent = ' ' + (liveCount || events.length) + ' MATCHES';
      if (liveCount === 0) {
        if (heading) heading.textContent = '오늘 경기';
        if (badge) {
          badge.className = 'bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-pill font-label-data text-label-data';
          badge.textContent = ' ' + events.length + ' MATCHES';   // 깜빡이는 점도 함께 사라진다
        }
      }

      // 히어로도 실제 경기로 바꾼다
      var top = ordered[0];
      var heroLabel = document.querySelector('[data-role="hero-label"]');
      var heroTitle = document.querySelector('[data-role="hero-title"]');
      if (top && heroLabel && heroTitle) {
        var live = A.statusOf(top) === 'live';
        heroLabel.textContent = (live ? 'LIVE NOW • ' : A.clockText(top) + ' • ') + A.leagueLabel(top.strLeague);
        heroTitle.textContent = A.teamName(top.strHomeTeam) + ' vs ' + A.teamName(top.strAwayTeam);
        href(document, 'hero-action', A.matchHref(top));
        // 진행 중이 아니면 깜빡이는 빨간 점을 감춘다
        var dot = heroLabel.previousElementSibling;
        if (dot && !live) dot.hidden = true;
      }
    }).catch(function (e) {
      console.warn('[data-pages.js] 홈 경기 카드를 불러오지 못해 하드코딩을 유지합니다.', e);
    });
  }

  /* ══════════════════ 중계 화면 ══════════════════ */
  function initMatchCenter() {
    var status = document.querySelector('[data-role="mc-status"]');
    if (!status) return;

    var wanted = new URLSearchParams(location.search).get('event');

    var pick = A.eventsForLocalDay(A.today()).then(function (events) {
      var ordered = A.byInterest(events);
      if (wanted) {
        var hit = events.filter(function (e) { return String(e.idEvent) === String(wanted); })[0];
        if (hit) return { ev: hit, others: ordered };
        // 오늘 목록에 없으면 그 경기만 따로 조회한다 (지난 경기·다른 날짜)
        return A.getJson('lookupevent.php?id=' + encodeURIComponent(wanted)).then(function (j) {
          var one = j && j.events && j.events[0];
          return { ev: one || ordered[0], others: ordered };
        });
      }
      return { ev: ordered[0], others: ordered };
    });

    pick.then(function (res) {
      var ev = res.ev;
      if (!ev) return;                 // 하드코딩 유지

      var state = A.statusOf(ev);
      var doc = document;

      var homeKo = A.teamName(ev.strHomeTeam), awayKo = A.teamName(ev.strAwayTeam);
      set(doc, 'mc-title', homeKo + ' 대 ' + awayKo + ' 실시간 중계');
      set(doc, 'home', homeKo);
      set(doc, 'away', awayKo);
      set(doc, 'home-abbr', A.abbrOf(ev.strHomeTeam));
      set(doc, 'away-abbr', A.abbrOf(ev.strAwayTeam));
      href(doc, 'home-link', A.teamHref(ev.strHomeTeam));
      href(doc, 'away-link', A.teamHref(ev.strAwayTeam));
      document.title = homeKo + ' vs ' + awayKo + ' 실시간 중계 — 바로스포츠티비';

      var hs = q(doc, 'home-score'), as = q(doc, 'away-score');
      var msep = q(doc, 'score-sep');
      if (msep) msep.style.display = state === 'upcoming' ? 'none' : '';
      if (state === 'upcoming') {
        if (hs) hs.textContent = '–';
        if (as) as.textContent = '–';
      } else {
        if (hs) hs.textContent = ev.intHomeScore;
        if (as) as.textContent = ev.intAwayScore;
      }

      set(doc, 'crumb-league', A.leagueLabel(ev.strLeague));

      /* 구조화 데이터 — 이 화면이 다루는 경기 한 건과 빵가루 */
      if (window.ArenaSeo) {
        var one = window.ArenaSeo.sportsEvent(ev, state, location.pathname + location.search);
        if (one) {
          one['@context'] = 'https://schema.org';
          window.ArenaSeo.publish('match', one);
        }
        /* 리그 이름은 **원문**을 쓴다. `leagueLabel()` 은 좁은 칸에 맞춰 줄인 표시용
           값이라('Vietnam Basketball Association' → 'Basketball Association')
           그대로 넣으면 검색엔진에 잘린 이름을 알려주게 된다. */
        window.ArenaSeo.breadcrumb('match-crumb', [
          { name: '홈', url: 'index.html' },
          { name: ev.strLeague || '경기 일정', url: 'schedule.html' },
          { name: homeKo + ' vs ' + awayKo }
        ]);
      }

      /* 플레이어 위의 빨간 'LIVE' 배지와 시청자 수는 진행 중일 때만 뜻이 있다.
         예정·종료 경기에 LIVE 를 띄우면 화면이 거짓말을 한다.
         (영상 자체는 아직 자리표시자다 — 실제 중계는 방송권 계약 사안) */
      if (state !== 'live') {
        var pb = q(doc, 'player-badge');
        if (pb) {
          pb.className = 'absolute top-4 left-4 z-10 inline-flex items-center gap-2 bg-black/50 text-white px-3 py-1.5 rounded-pill font-label-caps text-[11px]';
          pb.textContent = state === 'finished' ? '종료'
            : state === 'postponed' ? A.clockText(ev)   // 연기 · 취소 · 중단
            : '예정';
        }
      }

      /* 🔴 시청자 수는 **언제나 감춘다.** 우리에게 그 숫자가 없다.
         마크업의 「시청 12,481」 은 디자인 시안값이고, 진행 중일 때 그대로 두면
         지어낸 수치를 사실처럼 보여주게 된다. 실제 수치가 생기면 그때 살린다. */
      var pv = q(doc, 'player-viewers');
      if (pv) pv.hidden = true;

      /* 하이라이트 영상이 있으면 그 링크를, 없으면 「중계 준비 중」을 보여준다.
         눌러도 아무 일이 없는 재생 버튼은 두지 않는다. */
      var link = q(doc, 'play-link');
      var none = q(doc, 'no-stream');
      var hasVideo = !!(ev.strVideo && /^https?:\/\//.test(ev.strVideo));
      if (link) {
        link.hidden = !hasVideo;
        if (hasVideo) link.href = ev.strVideo;
      }
      if (none) none.hidden = hasVideo;

      // 상태 배지: 진행 중이 아니면 빨간 배지·깜빡이는 점을 쓰지 않는다
      var clock = q(doc, 'clock');
      if (state === 'live') {
        if (clock) clock.textContent = A.clockText(ev);
      } else {
        if (clock) clock.removeAttribute('data-clock');
        status.className = 'inline-flex items-center gap-1.5 bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-pill font-label-data text-[11px]';
        status.textContent = state === 'finished' ? '종료' : A.clockText(ev) + ' 예정';
      }

      /* 경기 기록·주요 장면. V2 에만 있고 축구 위주다 — 없으면 구역을 감춘다.
         하드코딩 행을 남겨 두면 **남의 경기 기록**이 그대로 보인다
         (모든 경기에 「사카 선제골 — 아스날 1-0」 이 떴다). */
      fillStats(doc, ev);
      fillTimeline(doc, ev);

      // 다른 경기 목록
      var others = res.others.filter(function (o) { return String(o.idEvent) !== String(ev.idEvent); });
      var box = document.querySelector('[data-other-matches]');
      if (!box || !others.length) return;

      Array.prototype.forEach.call(box.querySelectorAll('[data-role="other-card"]'), function (card, i) {
        var o = others[i];
        if (!o) { card.hidden = true; return; }
        var st = A.statusOf(o);
        set(card, 'league', A.leagueLabel(o.strLeague));
        setClock(card, o);
        set(card, 'home', A.teamName(o.strHomeTeam));
        set(card, 'away', A.teamName(o.strAwayTeam));
        var score = q(card, 'score');
        if (score) score.textContent = st === 'upcoming' ? 'vs' : o.intHomeScore + ' - ' + o.intAwayScore;
        card.href = A.matchHref(o);
      });
    }).catch(function (e) {
      console.warn('[data-pages.js] 중계 화면을 불러오지 못해 하드코딩을 유지합니다.', e);
    });
  }

  /* ══════════════════ 팀 허브 ══════════════════ */
  /* 화면에 보여 줄 기록만 고른다. API 는 18항목을 주는데 그대로 늘어놓으면
     읽히지 않는다. 이름은 한글로 바꾼다. */
  var STAT_LABEL = {
    'Ball Possession': '점유율',
    'Total Shots': '슈팅',
    'Shots on Goal': '유효 슈팅',
    'Corner Kicks': '코너킥',
    'Fouls': '파울',
    'Yellow Cards': '경고',
    'Red Cards': '퇴장',
    'Passes %': '패스 성공률',
    'Offsides': '오프사이드'
  };
  var STAT_ORDER = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'Corner Kicks', 'Passes %', 'Fouls', 'Yellow Cards'];

  function num(v) {
    var n = parseFloat(String(v == null ? '' : v).replace('%', ''));
    return isNaN(n) ? 0 : n;
  }

  /* 기록·장면이 있는 경기 목록. 한 번만 읽고 캐시한다.
     목록에 없으면 요청하지 않는다 — 404 를 콘솔에 쌓지 않기 위해서다. */
  var detailIndex = null;
  function hasDetail(kind, id) {
    if (!detailIndex) detailIndex = A.getJson('detailindex.php?x=1');
    return detailIndex.then(function (j) {
      var list = (j && j[kind]) || [];
      return list.indexOf(String(id)) >= 0;
    });
  }

  function fillStats(doc, ev) {
    var list = q(doc, 'stats-list');
    var empty = q(doc, 'stats-empty');
    var tpl = q(doc, 'stat-row');
    if (!list || !tpl) return;
    var template = tpl.cloneNode(true);

    hasDetail('stats', ev.idEvent).then(function (yes) {
      return yes ? A.getJson('lookupeventstats.php?id=' + encodeURIComponent(ev.idEvent)) : null;
    }).then(function (j) {
      var rows = (j && j.rows) || [];
      var byName = {};
      rows.forEach(function (r) { byName[r.strStat] = r; });

      var picked = STAT_ORDER.filter(function (name) { return byName[name]; });
      if (!picked.length) {
        list.hidden = true;
        if (empty) empty.hidden = false;
        return;
      }

      list.innerHTML = '';
      picked.forEach(function (name) {
        var r = byName[name];
        var row = template.cloneNode(true);
        var ko = STAT_LABEL[name] || name;
        /* API 는 점유율을 「28」 처럼 % 없이 준다 (실측). 이름으로 판단한다. */
        var pct = name === 'Ball Possession' || name.indexOf('%') >= 0 ||
                  String(r.intHome || '').indexOf('%') >= 0;
        var h = num(r.intHome), a2 = num(r.intAway), sum = h + a2;
        var hw = sum ? Math.round((h / sum) * 100) : 50;

        set(row, 'stat-name', ko);
        set(row, 'stat-home', pct ? h + '%' : String(h));
        set(row, 'stat-away', pct ? a2 + '%' : String(a2));

        var bar = q(row, 'stat-bar');
        if (bar) bar.setAttribute('aria-label', ko + ': 홈 ' + h + ', 원정 ' + a2);
        var bh = q(row, 'stat-bar-home'), ba = q(row, 'stat-bar-away');
        if (bh) bh.style.width = hw + '%';
        if (ba) ba.style.width = (100 - hw) + '%';

        list.appendChild(row);
      });
    });
  }

  /* 장면 종류 → 아이콘. 마크업의 아이콘 이름과 같은 집합을 쓴다. */
  var TL_ICON = { 'Goal': 'sports_soccer', 'Card': 'style', 'subst': 'swap_horiz', 'Var': 'videocam' };
  var TL_KO = {
    'Normal Goal': '골', 'Own Goal': '자책골', 'Penalty': '페널티골',
    'Yellow Card': '경고', 'Red Card': '퇴장', 'Substitution': '교체'
  };

  function fillTimeline(doc, ev) {
    var list = q(doc, 'timeline-list');
    var box = q(doc, 'timeline-box');
    var empty = q(doc, 'timeline-empty');
    var tpl = q(doc, 'timeline-item');
    if (!list || !tpl) return;
    var template = tpl.cloneNode(true);

    hasDetail('timeline', ev.idEvent).then(function (yes) {
      return yes ? A.getJson('lookuptimeline.php?id=' + encodeURIComponent(ev.idEvent)) : null;
    }).then(function (j) {
      var rows = (j && j.rows) || [];
      if (!rows.length) {
        if (box) box.hidden = true;
        if (empty) empty.hidden = false;
        return;
      }

      list.innerHTML = '';
      rows.forEach(function (r) {
        var item = template.cloneNode(true);
        var home = String(r.strHome) === 'Yes';

        /* 홈은 왼쪽, 원정은 오른쪽. 마크업에 이미 있는 두 배치를 그대로 쓴다. */
        item.className = home
          ? 'flex flex-row items-start gap-3 py-3 border-b border-outline-variant/40 last:border-b-0'
          : 'flex flex-row-reverse text-right items-start gap-3 py-3 border-b border-outline-variant/40 last:border-b-0';

        set(item, 'tl-min', (r.intTime || '') + "'");
        var icon = q(item, 'tl-icon');
        if (icon) icon.textContent = TL_ICON[r.strTimeline] || 'radio_button_checked';

        /* detail 은 「Substitution 1」 처럼 번호가 붙어 온다 (실측) — 앞부분으로 본다. */
        var detail = String(r.strTimelineDetail || '');
        var what = TL_KO[detail] || TL_KO[detail.replace(/\s+\d+$/, '')] || detail || r.strTimeline || '';
        var who = r.strPlayer || r.strTeam || '';
        var text = q(item, 'tl-text');
        if (text) {
          text.textContent = '';
          if (who) {
            var strong = doc.createElement('strong');
            strong.textContent = who;     // 사람 이름이다 — 팀 사전을 거치지 않는다
            text.appendChild(strong);
            text.appendChild(doc.createTextNode(' '));
          }
          text.appendChild(doc.createTextNode(what));
        }
        list.appendChild(item);
      });
    });
  }

  function initTeamHub() {
    /* ⚠️ `[data-role="team-name"]` 만 보고 판단하면 안 된다 — 대시보드의 「내 팀」 카드도
       같은 자리 이름을 쓰기 때문에 팀 허브 코드가 대시보드에서 돌아 카드와 문서 제목을
       엉뚱하게 바꿔버린다 (실제로 물렸습니다). 팀 허브에만 있는 h1 을 기준으로 잡는다. */
    var nameEl = document.querySelector('h1[data-role="team-name"]');
    if (!nameEl) return;

    var wanted = new URLSearchParams(location.search).get('team') || 'Arsenal';

    A.getJson('searchteams.php?t=' + encodeURIComponent(wanted)).then(function (j) {
      var team = j && j.teams && j.teams[0];
      if (!team) return;               // 하드코딩 유지

      var doc = document;
      set(doc, 'team-abbr', team.strTeamShort || A.abbrOf(team.strTeam));
      set(doc, 'team-league', A.leagueLabel(team.strLeague));
      /* 보이는 이름은 한글로 바꾸고, 영문 원문은 요소에 남긴다.
         `user.js` 의 팔로우 버튼이 어느 팀인지 알아야 하는데 한글로는 API 를 못 찾는다. */
      var teamKo = A.teamName(team.strTeam);
      set(doc, 'team-name', teamKo);
      var h1 = document.querySelector('h1[data-role="team-name"]');
      if (h1) h1.setAttribute('data-team-en', team.strTeam);
      if (U && U.repaintFollow) U.repaintFollow();
      // strTeamAlternate 는 'Arsenal Football Club, AFC, Arsenal FC' 처럼 쉼표 목록이다.
      // 한 줄에 다 넣으면 넘치므로 첫 항목만 쓴다.
      var alt = String(team.strTeamAlternate || '').split(',')[0].trim();
      set(doc, 'team-meta', [alt || team.strTeam, team.strLocation, team.strStadium]
        .filter(Boolean).join(' · '));
      document.title = teamKo + ' — 일정·기록·선수단 | 바로스포츠티비';

      // 구조화 데이터 — 이 화면이 다루는 팀
      if (window.ArenaSeo) window.ArenaSeo.sportsTeam('team', team);

      // 다음 경기
      A.getJson('eventsnext.php?id=' + team.idTeam).then(function (n) {
        var ev = n && n.events && n.events[0];
        if (!ev) return;
        set(doc, 'next-when', whenText(ev));
        set(doc, 'next-home', A.teamName(ev.strHomeTeam));
        set(doc, 'next-away', A.teamName(ev.strAwayTeam));
        set(doc, 'next-home-abbr', A.abbrOf(ev.strHomeTeam));
        set(doc, 'next-away-abbr', A.abbrOf(ev.strAwayTeam));

        /* 「경기 시작 알림 받기」 가 어느 경기인지 알려 준다.
           마크업에는 하드코딩 대결 이름만 들어 있으므로 실제 경기 번호로 바꾼다. */
        var card = document.querySelector('[data-match-label]');
        if (card) {
          if (ev.idEvent) card.setAttribute('data-match', ev.idEvent);
          card.setAttribute('data-match-label',
            A.teamName(ev.strHomeTeam) + ' vs ' + A.teamName(ev.strAwayTeam));
          if (U && U.repaintNotify) U.repaintNotify();
        }
      });

      // 순위·승점·시즌 기록은 순위표에서 가져온다.
      // ⚠️ 무료 키는 순위표를 5행만 주므로 상위권 팀이 아니면 못 찾는다 → 그때는 하드코딩 유지.
      var season = (new Date()).getFullYear();
      var guesses = [season + '-' + (season + 1), String(season)];

      (function tryTable(i) {
        if (i >= guesses.length) return;
        A.getJson('lookuptable.php?l=' + team.idLeague + '&s=' + guesses[i]).then(function (t) {
          var rows = (t && t.table) || [];
          var row = rows.filter(function (r) { return String(r.idTeam) === String(team.idTeam); })[0];
          if (!row) { tryTable(i + 1); return; }

          /* 실제 값을 넣는 순간, 채울 수 없는 하드코딩 세부값은 치운다.
             '경기당 2.2' 같은 부가 설명과 '클린시트' 는 순위표에 없는 값이라
             그대로 두면 실제 숫자 옆에서 거짓말을 한다. */
          Array.prototype.forEach.call(document.querySelectorAll('[data-role="season-note"]'), function (el) {
            el.hidden = true;
          });
          var cs = document.querySelector('[data-role="season-clean-sheet"]');
          if (cs) cs.hidden = true;

          // 시즌 개막 전이면 순위가 뜻이 없다 (0경기에 '1위'는 거짓말이다)
          if (Number(row.intPlayed) === 0) {
            set(doc, 'team-rank', '–');
            set(doc, 'team-points', '0');
            set(doc, 'season-played', '0');
            set(doc, 'season-goals-for', '0');
            set(doc, 'season-goals-against', '0');
            return;
          }
          set(doc, 'team-rank', row.intRank + '위');
          set(doc, 'team-points', row.intPoints);
          set(doc, 'season-played', row.intPlayed);
          set(doc, 'season-goals-for', row.intGoalsFor);
          set(doc, 'season-goals-against', row.intGoalsAgainst);
        });
      })(0);
    }).catch(function (e) {
      console.warn('[data-pages.js] 팀 정보를 불러오지 못해 하드코딩을 유지합니다.', e);
    });
  }

  /* ══════════════════ 대시보드 ══════════════════ */
  function initDashboard() {
    var teamList = document.querySelector('[data-my-teams]');
    var watchList = document.querySelector('[data-watchlist]');
    if (!teamList && !watchList) return;

    /* 내 팀
       카드 자체는 `user.js` 가 저장한 팀 수만큼 만든다 (사전의 한글 이름·약칭으로).
       여기서는 실제 리그 이름과 다음 경기 날짜만 채운다.
       ⚠️ 순서(i)로 팀을 찾으면 안 된다 — 팀을 지우면 카드와 목록이 어긋난다.
          카드에 박힌 `data-team`(영문 팀명)으로 찾는다. */
    function fillTeamCards() {
      if (!teamList) return;
      Array.prototype.forEach.call(teamList.querySelectorAll('[data-team]'), function (card) {
        var wanted = card.getAttribute('data-team');
        if (!wanted) return;

        lookupTeam(wanted).then(function (team) {
          if (!team) return;          // 사전 이름만 남는다 (연동 실패해도 목록은 맞다)
          set(card, 'team-abbr', team.strTeamShort || A.abbrOf(team.strTeam));
          set(card, 'team-meta', A.leagueLabel(team.strLeague));
          href(card, 'team-name', 'team-hub.html?team=' + encodeURIComponent(team.strTeam));

          return A.getJson('eventsnext.php?id=' + team.idTeam).then(function (n) {
            var ev = n && n.events && n.events[0];
            if (ev) set(card, 'team-when', whenText(ev));
          });
        }).catch(function () { /* 이 카드만 사전 이름으로 남는다 */ });
      });
    }

    if (teamList) {
      // 팀을 추가·삭제하면 user.js 가 카드를 다시 그린다. 그때 다시 채운다.
      if (U && U.onTeamsRendered) U.onTeamsRendered(fillTeamCards);
      fillTeamCards();
    }

    /* 관심 경기의 오른쪽 버튼을 상태에 맞게 **통째로 다시 만든다**.

       ⚠️ 요소 종류가 상태마다 다르다
         · 진행 중·종료 → `<a>` 로 중계·기록 화면으로 보낸다
         · 예정        → `<button class="notify-btn">` 로 알림만 저장한다 (이동 금지)
         글자와 색만 바꾸면 예정 경기에 주황 재생 버튼이 남거나, 알림 버튼이
         링크로 남아 눌렀을 때 화면이 넘어간다.                                  */
    function rebuildAction(row, ev, st) {
      var old = q(row, 'action');
      if (!old) return;

      var live = st === 'live';
      var upcoming = st === 'upcoming';
      var el = document.createElement(upcoming ? 'button' : 'a');
      el.setAttribute('data-role', 'action');

      if (upcoming) {
        el.type = 'button';
        el.setAttribute('aria-pressed', 'false');
        el.className = 'notify-btn font-label-caps text-[11px] px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:border-hermes-orange hover:text-primary transition-colors whitespace-nowrap shrink-0';
        el.appendChild(document.createTextNode('알림'));
      } else {
        el.href = A.matchHref(ev);
        el.className = live
          ? 'bg-primary-container text-on-primary font-label-caps text-[11px] px-4 py-2 rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-primary-hover transition-colors whitespace-nowrap shrink-0 flex items-center gap-1'
          : 'font-label-caps text-[11px] px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:border-hermes-orange hover:text-primary transition-colors whitespace-nowrap shrink-0';
        if (live) {
          var icon = document.createElement('span');
          icon.className = 'material-symbols-outlined text-[16px]';
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = 'play_arrow';
          el.appendChild(icon);
        }
        el.appendChild(document.createTextNode(live ? '중계 보기' : '경기 기록'));
      }

      old.parentNode.replaceChild(el, old);
    }

    // 관심 경기
    if (watchList) {
      A.eventsForLocalDay(A.today()).then(function (events) {
        if (!events.length) return;

        /* 알림을 켜 둔 경기를 위로 올린다 — 눌러서 저장한 것이 목록에 보여야
           저장됐다는 걸 알 수 있다. 나머지는 예전처럼 진행 중 → 예정 → 종료 순. */
        var saved = {};
        ((U && U.watch()) || []).forEach(function (w) { saved[w.key] = true; });
        var ranked = A.byInterest(events);
        var ordered = ranked.filter(function (e) { return saved[e.idEvent]; })
          .concat(ranked.filter(function (e) { return !saved[e.idEvent]; }));

        var rows = watchList.querySelectorAll('[data-role="watch-row"]');

        Array.prototype.forEach.call(rows, function (row, i) {
          var ev = ordered[i];
          if (!ev) { row.hidden = true; return; }
          var st = A.statusOf(ev);

          // 「알림」 버튼이 어느 경기인지 기억할 열쇠 (경기 일정 화면과 같은 값)
          if (ev.idEvent) row.setAttribute('data-match', ev.idEvent);
          row.setAttribute('data-match-label',
            A.teamName(ev.strHomeTeam) + ' vs ' + A.teamName(ev.strAwayTeam));

          setClock(row, ev);
          set(row, 'match', A.teamName(ev.strHomeTeam) + ' vs ' + A.teamName(ev.strAwayTeam));
          rebuildAction(row, ev, st);
        });

        // 새로 만든 버튼에 저장해 둔 켬/끔 상태를 입힌다
        if (U && U.repaintNotify) U.repaintNotify();
      }).catch(function (e) {
        console.warn('[data-pages.js] 관심 경기를 불러오지 못해 하드코딩을 유지합니다.', e);
      });
    }
  }

  initHome();
  initMatchCenter();
  initTeamHub();
  initDashboard();
})();
