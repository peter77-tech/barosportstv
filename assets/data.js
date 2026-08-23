/* 바로스포츠티비 — 데이터 연동 공용 부분 + 경기 일정 화면
   ==================================================================
   이 파일은 두 가지를 한다.
     ① 공용 코드를 `window.ArenaData` 로 내놓는다 (다른 화면은 data-pages.js)
     ② 경기 일정 화면(schedule.html)의 경기 목록을 실제 데이터로 갈아끼운다

   출처: TheSportsDB

   설계 원칙 — **점진적 향상**
     HTML 에 박힌 내용을 지우지 않았다. 응답이 왔을 때만 다시 그리고,
     실패하면 원래 하드코딩 내용이 그대로 남는다.
     (키가 막히거나 오프라인이어도 화면이 비지 않는다)

   ⚠️ 무료 테스트 키(`3`)의 한계 — 반드시 알고 쓰십시오
     · 날짜+종목 조회가 **3건**까지만 옵니다 (리그별·팀별 다음 경기는 1건)
     · 그래서 종목 4개를 각각 불러 합칩니다 — UTC 하루 최대 12경기
     · 어떤 리그가 올지 고를 수 없습니다 (하위 리그가 섞여 나옵니다)
     · 발급받은 키를 아래 KEY 에 넣으면 풀립니다. 코드는 그대로 씁니다.
     · 경기 기록(`lookupeventstats`)·주요 장면(`lookuptimeline`)은 **빈 응답**입니다
       → 중계 화면의 그 두 구역은 하드코딩으로 남겼습니다

   ⚠️ 시간대 — 응답의 날짜는 **UTC 기준**입니다
     한국(UTC+9)에서 "오늘 경기"를 맞추려면 UTC 이틀치를 받아 현지 날짜로
     다시 담아야 합니다. 그대로 쓰면 한국 새벽 경기가 전날 목록에 붙습니다.

   ⚠️ 팀 배지 이미지는 쓰지 않습니다
     응답에 `strHomeTeamBadge` 가 오지만 구단 상표이고 팬 제작물입니다.
     `assets/img/출처.md` 의 기준에 따라 텍스트 약칭만 씁니다.

   ⚠️ 뉴스는 이 API 에 없습니다
     뉴스 화면은 여전히 하드코딩이며 별도 출처(RSS·언론사 API)가 필요합니다.
   ================================================================== */
(function () {
  'use strict';

  /* ── 데이터 출처 ─────────────────────────────────────────
     ⚠️ 여기 두 줄이 프리베이크 ↔ 실시간 프록시를 가른다.
       부르는 쪽(data-pages.js 5곳)은 한 글자도 바꿀 필요가 없다.

     · 'prebake' — GitHub Actions 가 10분마다 구워둔 data/**.json 을 읽는다.
                   브라우저에 API 키가 나가지 않고 429 가 나지 않는다.
                   대가: 점수가 10~25분 늦는다.
     · 'live'    — Cloudflare Workers 프록시를 직접 부른다. 실시간이 필요해지면
                   아래 두 줄을 이렇게 바꾸는 것이 전부다:
                     mode: 'live', base: 'https://api.barosportstv.com/'
                   (설계 문서 docs/superpowers/specs/2026-08-23-… 11.1절)

     ⛔ API 키를 이 파일에 넣지 마십시오. 정적 사이트라 브라우저 소스에
       그대로 보입니다. 키는 GitHub Secret `SPORTSDB_KEY` 에만 둡니다. */
  var SOURCE = {
    mode: 'prebake',
    base: './data/'
  };

  var SPORTS = ['Soccer', 'Basketball', 'Baseball', 'American Football'];
  var DAYS = 5;                  // 경기 일정 화면의 날짜 칩 개수

  /* 응답의 리그 이름을 화면의 종목 필터 슬러그로 옮긴다.
     여기 없는 리그는 이름을 슬러그로 만들어 붙인다 — '전체'에서는 보이고
     특정 칩에서는 걸러진다. 칩을 늘리려면 schedule.html 과 여기를 함께 고친다. */
  var LEAGUE_SLUG = {
    'English Premier League': 'premier-league',
    'Spanish La Liga': 'la-liga',
    'NBA': 'nba',
    'MLB': 'mlb',
    'NFL': 'nfl',
    'South Korean K League 1': 'k-league',
    'Formula 1': 'f1'
  };

  /* 리그 이름 표시용 축약 (칸이 좁아 원문은 잘린다) */
  var LEAGUE_LABEL = {
    'English Premier League': 'Premier League',
    'Spanish La Liga': 'La Liga',
    'South Korean K League 1': 'K-League'
  };

  /* 리그 이름 앞의 국가 수식어를 떼어 표시 칸에 들어가게 만든다
     ('American USL League One' → 'USL League One') */
  var COUNTRY_PREFIX = /^(American|Argentinian|Mexican|Brazilian|Spanish|English|Italian|German|French|Dutch|Portuguese|Turkish|Japanese|Chinese|Vietnam|Vietnamese|South Korean|Australian|Canadian|Scottish|Belgian|Swiss|Austrian|Danish|Swedish|Norwegian|Polish|Greek|Russian|Indian|Saudi|Qatari)\s+/i;

  /* 끝난 경기로 볼 상태값. 그 밖에 점수가 있으면 진행 중으로 본다. */
  var FINISHED = ['FT', 'AET', 'PEN', 'AOT', 'FINAL', 'MATCH FINISHED', 'GAME FINISHED', 'ENDED'];
  var NOT_STARTED = ['NS', 'TBD', 'SCHEDULED', ''];

  /* 열리지 않은 경기. 이걸 '예정' 으로 두면 원래 시각이 그대로 떠서 거짓말이 된다
     (실측 2026-08-23: 1군에 POST 5건). 뜻이 다르므로 라벨도 나눈다. */
  var POSTPONED = {
    'POST': '연기', 'PPD': '연기', 'POSTPONED': '연기', 'DELAYED': '연기',
    'CANC': '취소', 'CANCL': '취소', 'CANCELLED': '취소', 'CANCELED': '취소',
    'ABD': '중단', 'ABANDONED': '중단', 'AWD': '몰수', 'AWARDED': '몰수'
  };

  var WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

  /* ── 날짜·시각 ─────────────────────────────────────────── */
  function pad(n) { return String(n).padStart(2, '0'); }

  function addDays(base, n) {
    var d = new Date(base.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function localKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /* strTimestamp 는 UTC 기준이다. Z 를 붙여야 브라우저가 UTC 로 읽는다. */
  function localTime(ev) {
    if (ev && ev.strTimestamp) {
      var raw = ev.strTimestamp.replace(' ', 'T');
      var t = new Date(raw + (/[Zz]|[+-]\d\d:?\d\d$/.test(raw) ? '' : 'Z'));
      if (!isNaN(t.getTime())) return t;
    }
    return null;
  }

  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function mmdd(d) { return pad(d.getMonth() + 1) + '.' + pad(d.getDate()); }

  function dayLabel(offset, d) {
    if (offset === 0) return '오늘';
    if (offset === 1) return '내일';
    return WEEKDAY[d.getDay()];
  }

  /* ── 경기 상태 ─────────────────────────────────────────── */
  function statusOf(ev) {
    var st = String(ev.strStatus || '').trim().toUpperCase();
    var scored = ev.intHomeScore !== null && ev.intHomeScore !== '' &&
                 ev.intAwayScore !== null && ev.intAwayScore !== '';
    if (POSTPONED[st]) return 'postponed';
    if (FINISHED.indexOf(st) >= 0) return 'finished';
    if (NOT_STARTED.indexOf(st) >= 0) return scored ? 'finished' : 'upcoming';
    return scored ? 'live' : 'upcoming';
  }

  /* API 가 시각을 모를 때 `00:00:00` 을 준다 (실측 39건 — 대개 남미 하부리그).
     `strTimestamp` 는 그 값으로 채워져 오므로 그대로 쓰면 화면에 00:00(현지 09:00)이
     찍힌다 — BD 가 지적한 그 증상이다. 이때는 시각을 보여주지 않는다.
     ⚠️ 진짜로 UTC 자정에 열리는 경기는 「시간 미정」으로 보이지만, 틀린 시각을
       보여주는 것보다 낫다고 판단했다. */
  function timeUnknown(ev) {
    var raw = String(ev && ev.strTime || '');
    return !raw || raw.slice(0, 5) === '00:00';
  }

  function clockText(ev) {
    var state = statusOf(ev);
    if (state === 'live') return ev.strProgress || String(ev.strStatus || '진행');
    if (state === 'postponed') return POSTPONED[String(ev.strStatus || '').trim().toUpperCase()];
    if (timeUnknown(ev)) return '시간 미정';
    var t = localTime(ev);
    if (t) return hhmm(t);
    return (ev.strTime || '').slice(0, 5) || '시간 미정';
  }

  function leagueLabel(league) {
    if (LEAGUE_LABEL[league]) return LEAGUE_LABEL[league];
    return String(league || '').replace(COUNTRY_PREFIX, '');
  }

  function leagueSlug(league) {
    return LEAGUE_SLUG[league] || String(league || '').toLowerCase().replace(/\s+/g, '-');
  }

  /* 화면에 보여줄 팀 이름.
     응답은 영문(`Arsenal`·`Los Angeles Lakers`)인데 화면은 한국어다.
     `assets/teams.js` 사전에 있는 팀만 한글로 바꾸고, **없으면 영문 그대로 둔다.**

     ⚠️ 여기서 바꾼 이름을 API 나 링크에 되먹이면 안 된다
       TheSportsDB 는 영문으로만 검색된다. 팀 링크(`teamHref`)·저장값·구조화 데이터의
       `name` 은 영문을 쓰고, 한글은 보여줄 때와 `alternateName` 에만 쓴다.

     ⚠️ 무료 키가 섞어 주는 하위 리그 팀은 영문으로 남는다
       사전에 온 세상 팀을 넣을 수는 없다. 키를 받아 리그를 고를 수 있게 되면
       한글로 바뀌는 비율이 크게 올라간다 (BD 항목). */
  function teamName(name) {
    var T = window.ArenaTeams;
    return T ? T.ko(name) : String(name || '');
  }

  /* 팀 약칭. 사전에 없으면 이름에서 만든다
     ('Los Angeles Lakers' → 사전이면 'LAL', 없으면 'LOS'). */
  function abbrOf(name) {
    // 사전에 약칭이 있으면 그것을 쓴다 (자동 생성보다 정확하다: Los Angeles Lakers → LAL)
    var T = window.ArenaTeams;
    var known = T && T.abbr(name);
    if (known) return known;

    var clean = String(name || '').replace(/[^A-Za-z가-힣0-9 ]/g, '').trim();
    if (!clean) return '—';
    if (/[가-힣]/.test(clean)) return clean.slice(0, 3);
    var words = clean.split(/\s+/);
    if (words.length >= 3) return words.slice(0, 3).map(function (w) { return w[0]; }).join('').toUpperCase();
    return words[0].slice(0, 3).toUpperCase();
  }

  function teamHref(name) {
    return name ? 'team-hub.html?team=' + encodeURIComponent(name) : 'team-hub.html';
  }

  function matchHref(ev) {
    return ev && ev.idEvent ? 'match-center.html?event=' + encodeURIComponent(ev.idEvent) : 'match-center.html';
  }

  /* ── 조회 (UTC 하루씩, 종목별로 따로 · 결과는 캐시) ────── */
  var cache = {};

  function fetchUtcDay(utcKey) {
    if (cache[utcKey]) return cache[utcKey];
    cache[utcKey] = Promise.all(SPORTS.map(function (sport) {
      return getJson('eventsday.php?d=' + utcKey + '&s=' + encodeURIComponent(sport))
        .then(function (j) { return (j && j.events) || []; });
    })).then(function (lists) {
      var events = [];
      lists.forEach(function (l) { events = events.concat(l); });
      return events;
    });
    return cache[utcKey];
  }

  /* 유일한 네트워크 진입점. 실패하면 null 을 돌려주고, 부르는 쪽은
     하드코딩 내용을 그대로 남긴다 (이 파일 첫 주석의 점진적 향상 원칙). */
  function getJson(path) {
    var url;
    if (SOURCE.mode === 'prebake') {
      var file = window.ArenaPath && window.ArenaPath.fileFor(path);
      if (!file) return Promise.resolve(null);   // 굽지 않는 엔드포인트
      url = SOURCE.base + file;
    } else {
      url = SOURCE.base + path;
    }
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function dedupe(events) {
    var seen = {};
    return events.filter(function (ev) {
      var id = ev.idEvent || (ev.strEvent + ev.strTimestamp);
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    });
  }

  /* 현지 날짜별로 다시 담는다. UTC 날짜 하나만 받으면 새벽 경기가 어긋난다. */
  function bucketByLocalDate(events) {
    var buckets = {};
    events.forEach(function (ev) {
      var t = localTime(ev);
      var key = t ? localKey(t) : ev.dateEvent;
      if (!key) return;
      (buckets[key] = buckets[key] || []).push(ev);
    });
    Object.keys(buckets).forEach(function (k) {
      buckets[k].sort(function (a, b) {
        var ta = localTime(a), tb = localTime(b);
        return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
      });
    });
    return buckets;
  }

  /* 현지 기준 하루치. 앞뒤로 걸치므로 UTC 사흘을 받는다. */
  function eventsForLocalDay(date) {
    var utcDays = [-1, 0, 1].map(function (n) { return localKey(addDays(date, n)); });
    return Promise.all(utcDays.map(fetchUtcDay)).then(function (lists) {
      var all = [];
      lists.forEach(function (l) { all = all.concat(l); });
      return bucketByLocalDate(dedupe(all))[localKey(date)] || [];
    });
  }

  /* 리그 등급 → 진행 중/예정/종료 → 시각 순으로 늘어놓는다 (화면에 먼저 보여줄 순서).

     ⚠️ 등급을 맨 앞에 두는 이유: 유료급 키는 그날 전 세계 경기를 다 준다
       (실측 3,960경기 · 337리그). 등급이 없으면 호주 3부리그가 EPL·KBO 보다
       앞에 와서 홈 헤드라인을 차지한다(실측으로 실제로 그렇게 됐다). */
  function leagueTier(ev) {
    var L = window.ArenaLeagues;
    return L ? L.tier(ev && ev.strLeague) : 2;
  }

  function byInterest(events) {
    var rank = { live: 0, upcoming: 1, postponed: 2, finished: 3 };
    return events.slice().sort(function (a, b) {
      var t = leagueTier(a) - leagueTier(b);
      if (t) return t;
      var d = rank[statusOf(a)] - rank[statusOf(b)];
      if (d) return d;
      var ta = localTime(a), tb = localTime(b);
      return (ta ? ta.getTime() : 0) - (tb ? tb.getTime() : 0);
    });
  }

  /* ── 다른 화면(data-pages.js)이 쓰는 공용 창구 ─────────── */
  window.ArenaData = {
    getJson: getJson,
    eventsForLocalDay: eventsForLocalDay,
    byInterest: byInterest,
    statusOf: statusOf,
    clockText: clockText,
    leagueLabel: leagueLabel,
    leagueSlug: leagueSlug,
    abbrOf: abbrOf,
    teamName: teamName,
    teamHref: teamHref,
    matchHref: matchHref,
    localTime: localTime,
    today: today,
    addDays: addDays,
    dayLabel: dayLabel,
    hhmm: hhmm,
    mmdd: mmdd,
    weekday: WEEKDAY
  };

  /* ══════════════════════════════════════════════════════════
     경기 일정 화면
     ══════════════════════════════════════════════════════════ */
  var sections = document.querySelectorAll('[data-schedule-day]');
  if (sections.length < 2) return;

  var base = today();

  /* 행 템플릿 확보 — 하드코딩 행을 지우기 전에 복제해 둔다.
     HTML 문자열을 JS 에 또 쓰지 않으므로 스타일이 갈라지지 않는다. */
  var liveTpl = null, upcomingTpl = null;

  Array.prototype.forEach.call(document.querySelectorAll('li[data-league]'), function (li) {
    if (!liveTpl && li.querySelector('[data-role="home-score"]')) liveTpl = li.cloneNode(true);
    if (!upcomingTpl && li.querySelector('[data-role="vs"]')) upcomingTpl = li.cloneNode(true);
  });

  if (!liveTpl || !upcomingTpl) return;   // 마크업이 바뀌었다면 손대지 않는다

  function buildRow(ev) {
    var state = statusOf(ev);
    /* 연기·취소는 **예정 템플릿**을 쓴다. 진행중 템플릿에는 하드코딩 점수가 있어
       그대로 쓰면 열리지도 않은 경기에 「2 - 1」 이 남는다 (실측으로 실제로 물렸다 —
       연기·취소 11건의 점수는 API 에서 전부 null 로 온다). */
    var li = (state === 'upcoming' || state === 'postponed' ? upcomingTpl : liveTpl).cloneNode(true);
    var league = ev.strLeague || '';

    li.setAttribute('data-league', leagueSlug(league));
    /* 「주요 리그」 칩이 이 값으로 걸러낸다 (app.js). 1=주요 · 2=보통 · 3=하부 */
    var tier = String(window.ArenaLeagues ? window.ArenaLeagues.tier(league) : 2);
    li.setAttribute('data-tier', tier);

    /* 처음부터 숨긴 상태로 그린다 — 다 그린 뒤 숨기면 화면이 밀린다.
       판정 규칙은 app.js 의 matches() 가 유일한 출처다. */
    var F = window.ArenaLeagueFilter;
    if (F && F.matches) li.hidden = !F.matches(F.selected(), leagueSlug(league), tier);
    li.hidden = false;

    /* 「알림」 버튼이 어느 경기인지 기억할 열쇠.
       화면에 보이는 대결 이름은 필터·재조회로 바뀔 수 있으므로 `idEvent` 를 쓴다.
       (user.js 가 이 값으로 localStorage 에 담는다) */
    if (ev.idEvent) li.setAttribute('data-match', ev.idEvent);
    li.setAttribute('data-match-label',
      teamName(ev.strHomeTeam) + ' vs ' + teamName(ev.strAwayTeam));

    var q = function (role) { return li.querySelector('[data-role="' + role + '"]'); };
    var set = function (role, text) { var el = q(role); if (el) el.textContent = text; };

    // 끝난 경기의 왼쪽 칸에는 '종료'를 또 쓰지 않는다 — 오른쪽 배지와 겹친다.
    // 대신 킥오프 시각을 남겨 언제 열린 경기인지 알 수 있게 한다.
    set('time', clockText(ev));
    set('league', leagueLabel(league));
    // 보이는 이름은 한글, 링크 주소는 영문 (API 는 영문으로만 찾는다)
    set('home', teamName(ev.strHomeTeam));
    set('away', teamName(ev.strAwayTeam));

    var homeLink = q('home'), awayLink = q('away');
    if (homeLink && homeLink.tagName === 'A') homeLink.href = teamHref(ev.strHomeTeam);
    if (awayLink && awayLink.tagName === 'A') awayLink.href = teamHref(ev.strAwayTeam);

    if (state === 'live' || state === 'finished') {
      set('home-score', ev.intHomeScore);
      set('away-score', ev.intAwayScore);
    }

    var action = q('action');
    if (action && action.tagName === 'A') action.href = matchHref(ev);

    // 끝난 경기·열리지 않은 경기에 빨간 '진행 중' 배지를 붙이면 안 된다 (실제로 물렸습니다)
    if (state === 'postponed') {
      var pbadge = q('status');
      if (pbadge) {
        pbadge.className = 'font-label-data text-[11px] text-secondary whitespace-nowrap';
        pbadge.textContent = clockText(ev);      // 연기 · 취소 · 중단
      }
    }

    if (state === 'finished') {
      var badge = q('status');
      if (badge) {
        badge.className = 'font-label-data text-[11px] text-secondary whitespace-nowrap';
        badge.textContent = '종료';
      }
      set('action-icon', 'assessment');
      set('action-label', '경기 기록');
    }

    return li;
  }

  function fillSection(section, events, offset, date) {
    var title = section.querySelector('[data-role="day-title"]');
    if (title) {
      title.textContent = dayLabel(offset, date) + ' · ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
    }

    var list = section.querySelector('ul');
    if (!list) return;

    /* ⚠️ 정렬을 반드시 거친다. 유료급 키는 하루 1,101경기를 준다(실측) —
       원본 순서로 그리면 파로제도 2부·러시아 FNL2 가 맨 앞에 온다. */
    list.innerHTML = '';
    byInterest(events).forEach(function (ev) { list.appendChild(buildRow(ev)); });
  }

  /* 날짜 칩의 숫자는 **응답이 온 뒤에** 실제 날짜로 바꾼다.
     먼저 바꾸면 연동 실패 시 칩은 오늘인데 목록은 하드코딩 날짜라 어긋나 보인다. */
  var chipsFilled = false;

  function fillChipDates() {
    if (chipsFilled) return;
    chipsFilled = true;
    Array.prototype.forEach.call(document.querySelectorAll('.date-chip'), function (chip, i) {
      if (i >= DAYS) return;
      var d = addDays(base, i);
      var label = chip.querySelector('[data-role="chip-label"]');
      var num = chip.querySelector('[data-role="chip-date"]');
      if (label) label.textContent = dayLabel(i, d);
      if (num) num.textContent = mmdd(d);
    });
  }

  var loading = false;

  function load(offset) {
    if (loading) return;
    loading = true;

    var first = addDays(base, offset);
    var second = addDays(base, offset + 1);

    Promise.all([eventsForLocalDay(first), eventsForLocalDay(second)]).then(function (res) {
      if (!res[0].length && !res[1].length) {
        // 둘 다 비면 하드코딩 목록을 그대로 둔다 (화면이 비는 것보다 낫다)
        console.info('[data.js] 응답이 비어 하드코딩 목록을 유지합니다.');
        loading = false;
        return;
      }
      fillChipDates();
      fillSection(sections[0], res[0], offset, first);
      fillSection(sections[1], res[1], offset + 1, second);
      if (window.ArenaLeagueFilter) window.ArenaLeagueFilter.reapply();
      // 새로 그린 행의 「알림」 버튼에 저장해 둔 켬/끔 상태를 다시 입힌다
      if (window.ArenaUser && window.ArenaUser.repaintNotify) window.ArenaUser.repaintNotify();

      /* 구조화 데이터 — **화면에 실제로 그린 경기만** 내보낸다.
         하드코딩 경기를 넣으면 검색엔진에 없는 경기를 알려주게 된다. */
      if (window.ArenaSeo) {
        var listed = res[0].concat(res[1]).map(function (ev) {
          return { ev: ev, state: statusOf(ev), url: matchHref(ev) };
        });
        window.ArenaSeo.eventList('schedule', listed, '바로스포츠티비 경기 일정');
      }
      loading = false;
    }).catch(function (e) {
      console.warn('[data.js] 경기 일정을 불러오지 못해 하드코딩 목록을 유지합니다.', e);
      loading = false;
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.date-chip'), function (chip, i) {
    if (i >= DAYS) return;
    chip.addEventListener('click', function () { load(i); });
  });

  load(0);
})();
