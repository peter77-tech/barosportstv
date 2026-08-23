# GitHub Pages 배포 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TheSportsDB API 키를 브라우저에서 완전히 빼내고, ARENA LIVE 정적 사이트를 GitHub Actions 프리베이크 + Pages 로 `https://barosportstv.com` 에 배포한다.

**Architecture:** GitHub Actions 가 10분마다 Secret 키로 API 를 호출해 `data/**.json` 을 만들고, 브라우저는 그 JSON 만 읽는다. 브라우저의 네트워크 진입점을 `assets/data.js` 의 `getJson` 하나로 합치고 그 위에 `SOURCE` 설정을 둬, 나중에 Cloudflare Workers 프록시로 옮길 때 두 줄만 바꾸면 되게 한다. 엔드포인트→파일 이름 규칙은 `assets/apipath.js` 한 파일에만 적고 브라우저와 프리베이크 스크립트가 함께 쓴다.

**Tech Stack:** 순수 정적 HTML/CSS/JS (프레임워크 없음) · Tailwind CSS 3 (빌드만) · Node 24 내장 `fetch`·`node:test`·`node:vm` (**새 의존성 0**) · GitHub Actions · GitHub Pages

**Spec:** [`docs/superpowers/specs/2026-08-23-github-pages-배포-설계.md`](../specs/2026-08-23-github-pages-배포-설계.md)

## Global Constraints

- **새 npm 의존성을 추가하지 않는다.** Node 24 내장 기능만 쓴다 (`fetch`·`node:test`·`node:vm`).
- **스크립트 로드 순서 규칙(⑧)을 지킨다.** 기존 순서 `teams.js → app.js → search.js → user.js → seo.js → data.js → data-pages.js` 를 바꾸지 않는다. 새 `apipath.js` 는 **맨 앞**에 넣는다 (의존성이 없고, `data.js` 만 이것을 쓴다).
- **점진적 향상 원칙을 지킨다.** 데이터가 없으면 `getJson` 이 `null` 을 돌려주고 하드코딩 화면이 남아야 한다. 하드코딩 마크업을 지우지 않는다.
- **의도적 설계 3가지를 건드리지 않는다** (`다음세션_재개.md` 0절): 홈 카드의 덮개 링크 구조 · `min-[1090px]`·`min-[1560px]` 실측 브레이크포인트 · 폰에서 점수판이 팀 줄 아래로 내려가는 배치.
- **파일 이름 규칙**: 소문자로 바꾸고 `[^a-z0-9._-]+` 를 `_` 하나로 치환, 양끝 `_` 제거. `Manchester City` → `manchester_city`.
- **호출 한도**: 분당 **90건** (유료 Single Developer 한도 100건의 90%).
- **팀 상한**: 사전 21팀은 항상 + 등장 팀 최대 **60팀**. 상한에 걸린 팀 이름을 전부 기록한다.
- **도메인**: `barosportstv.com` (루트 경로).
- **브랜드명 `ARENA LIVE` 표기를 바꾸지 않는다.** 이번 범위 밖이다 (사양서 12.1절).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `assets/apipath.js` (신규) | 엔드포인트 문자열 → 프리베이크 파일 경로. **브라우저·Node 공용.** 이것만이 규칙의 출처다 |
| `assets/data.js` (수정) | `SOURCE` 설정 추가 · `fetchUtcDay` 를 `getJson` 경유로 바꿔 진입점 단일화 |
| `tools/lib/limiter.mjs` (신규) | 분당 호출 수 제한기. 시간 함수를 주입받아 테스트 가능 |
| `tools/lib/collect.mjs` (신규) | 경기 목록에서 구울 팀·경기를 골라내고 60팀 상한을 적용 |
| `tools/prebake.mjs` (신규) | 위 세 개를 엮어 실제로 API 를 부르고 `data/**.json` 을 쓴다 |
| `tests/*.test.mjs` (신규) | `node:test` 단위 테스트 |
| `.github/workflows/deploy.yml` (신규) | 10분 크론 · 빌드 · 프리베이크 · 키 노출 검사 · Pages 배포 |
| `.github/workflows/keepalive.yml` (신규) | 주 1회 커밋으로 크론이 60일 뒤 꺼지는 것을 막는다 |
| `CNAME` (신규) | 커스텀 도메인 |
| `*.html` 6장 (수정) | `apipath.js` 태그 추가 · `example.com`→`barosportstv.com` 18곳 · canonical 6곳 |
| `docs/배포_DNS_설정.md` (신규) | BD 가 직접 넣어야 하는 DNS 값 |
| `다음세션_재개.md` (수정) | 정정 사항 · 새 규칙 |

---

### Task 1: 엔드포인트→파일 경로 매핑 (`assets/apipath.js`)

브라우저와 프리베이크 스크립트가 **같은 파일 이름**을 계산해야 한다. 어긋나면 브라우저가 404 만 받고 사이트가 조용히 하드코딩으로 되돌아간다. 그래서 규칙을 한 파일에만 적고 양쪽이 함께 쓴다.

**Files:**
- Create: `assets/apipath.js`
- Create: `tests/apipath.test.mjs`
- Modify: `package.json` (`test` 스크립트 추가)

**Interfaces:**
- Produces: `ArenaPath.fileFor(path: string): string | null` — `'eventsday.php?d=2026-08-23&s=Soccer'` → `'eventsday/2026-08-23_soccer.json'`. 모르는 엔드포인트는 `null`.
- Produces: `ArenaPath.safe(text: string): string` — 파일 이름으로 안전한 문자열.
- 브라우저에서는 `window.ArenaPath`, Node 에서는 `module.exports` 로 같은 객체가 나온다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/apipath.test.mjs`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

`package.json` 의 `scripts` 에 다음 한 줄을 먼저 추가한다:

```json
"test": "node --test tests/"
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../assets/apipath.js'`

- [ ] **Step 3: 최소 구현을 쓴다**

`assets/apipath.js`:

```js
/* ARENA LIVE — 엔드포인트 → 프리베이크 파일 경로
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
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `npm test`
Expected: PASS — 9개 테스트 전부 통과

- [ ] **Step 5: 커밋**

```bash
git add assets/apipath.js tests/apipath.test.mjs package.json
git commit -m "feat: 엔드포인트→프리베이크 파일 경로 매핑을 한 파일로 모은다

브라우저와 프리베이크 스크립트가 같은 파일 이름을 계산해야 한다.
어긋나면 브라우저가 404 만 받고 화면은 멀쩡한 채 하드코딩으로 되돌아가
알아채기 어렵다. 그래서 규칙을 apipath.js 한 곳에만 둔다."
```

---

### Task 2: 호출 한도 제한기 (`tools/lib/limiter.mjs`)

유료 키는 분당 100건이다. 넘기면 429 가 나고 프리베이크가 반쯤 빈 채로 배포된다. 시간 함수를 주입받게 만들어 **실제로 1분을 기다리지 않고** 테스트한다.

**Files:**
- Create: `tools/lib/limiter.mjs`
- Create: `tests/limiter.test.mjs`

**Interfaces:**
- Produces: `createLimiter({ perMinute, now, sleep }): (fn: () => Promise<T>) => Promise<T>`
  - `perMinute` 기본값 `90`
  - `now()` 는 밀리초 정수를 돌려준다 (기본 `Date.now`)
  - `sleep(ms)` 는 `Promise` 를 돌려준다 (기본 `setTimeout` 기반)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/limiter.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../tools/lib/limiter.mjs';

/* 가짜 시계. sleep 을 부르면 시간이 그만큼 흐른다 — 실제로 기다리지 않는다. */
function fakeClock() {
  let t = 0;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    advance: (ms) => { t += ms; },
    slept
  };
}

test('한도 안에서는 기다리지 않는다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 3, now: c.now, sleep: c.sleep });
  const out = [];
  for (let i = 0; i < 3; i++) await run(async () => out.push(i));
  assert.deepEqual(out, [0, 1, 2]);
  assert.deepEqual(c.slept, [], '한도 안이므로 잠들지 않아야 한다');
});

test('한도를 넘으면 창이 열릴 때까지 기다린다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 2, now: c.now, sleep: c.sleep });
  await run(async () => 'a');
  await run(async () => 'b');
  await run(async () => 'c');
  assert.equal(c.slept.length, 1, '세 번째에서 한 번 기다려야 한다');
  assert.ok(c.slept[0] > 0 && c.slept[0] <= 60000, `기다린 시간이 이상하다: ${c.slept[0]}`);
});

test('1분이 지나면 창이 비워져 다시 즉시 통과한다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 2, now: c.now, sleep: c.sleep });
  await run(async () => 'a');
  await run(async () => 'b');
  c.advance(60001);
  await run(async () => 'c');
  assert.deepEqual(c.slept, [], '창이 비었으므로 기다리지 않아야 한다');
});

test('호출 결과를 그대로 돌려준다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 10, now: c.now, sleep: c.sleep });
  assert.equal(await run(async () => 42), 42);
});

test('호출이 던진 예외를 그대로 올려보낸다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 10, now: c.now, sleep: c.sleep });
  await assert.rejects(() => run(async () => { throw new Error('boom'); }), /boom/);
});

test('예외가 나도 호출 한 건으로 세어진다 — API 는 실패한 호출도 한도에 넣는다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 1, now: c.now, sleep: c.sleep });
  await assert.rejects(() => run(async () => { throw new Error('boom'); }));
  await run(async () => 'next');
  assert.equal(c.slept.length, 1, '실패한 호출도 한도를 차지해야 한다');
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../tools/lib/limiter.mjs'`

- [ ] **Step 3: 최소 구현을 쓴다**

`tools/lib/limiter.mjs`:

```js
/* 분당 호출 수 제한기.
   유료 Single Developer 는 분당 100건이다. 넘기면 429 가 나고 프리베이크가
   반쯤 빈 채로 배포된다. 기본값은 여유를 둔 90건.

   `now`·`sleep` 을 주입받는 이유: 테스트에서 실제로 1분을 기다리지 않기 위해서다. */
export function createLimiter({
  perMinute = 90,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
} = {}) {
  const stamps = [];              // 최근 1분 안의 호출 시각

  return async function run(fn) {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= 60000) stamps.shift();
      if (stamps.length < perMinute) {
        stamps.push(t);           // 성공·실패와 무관하게 한 건으로 센다
        return fn();
      }
      await sleep(60000 - (t - stamps[0]) + 10);
    }
  };
}
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `npm test`
Expected: PASS — 6개 테스트 전부 통과 (Task 1 의 9개도 그대로 통과)

- [ ] **Step 5: 커밋**

```bash
git add tools/lib/limiter.mjs tests/limiter.test.mjs
git commit -m "feat: 분당 호출 수 제한기

유료 키 한도(분당 100건)의 90%인 90건으로 막는다. 넘기면 429 가 나고
프리베이크가 반쯤 빈 채로 배포된다. 실패한 호출도 한도를 차지하게 센다."
```

---

### Task 3: 구울 대상 고르기 (`tools/lib/collect.mjs`)

경기 목록에서 팀·경기를 뽑고 60팀 상한을 적용한다. **상한에 걸린 팀 이름을 버리지 않고 돌려주는 것**이 이 함수의 핵심 계약이다 — 조용히 잘라내면 "다 구웠다"로 읽힌다.

**Files:**
- Create: `tools/lib/collect.mjs`
- Create: `tests/collect.test.mjs`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `collectTargets(eventLists, dictionaryTeams, cap = 60)` →
  `{ events: Event[], teams: string[], skippedTeams: string[] }`
  - `eventLists`: `eventsday` 응답의 `events` 배열들의 배열 (`null` 섞여도 됨)
  - `events`: `idEvent` 기준 중복 제거 후 `strTimestamp` 오름차순
  - `teams`: `dictionaryTeams` 전부 + 등장 팀 최대 `cap` 개
  - `skippedTeams`: 상한에 걸려 빠진 팀 전부

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/collect.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectTargets } from '../tools/lib/collect.mjs';

const ev = (id, home, away, ts) => ({
  idEvent: id, strHomeTeam: home, strAwayTeam: away, strTimestamp: ts
});

test('경기를 시각 오름차순으로 돌려준다', () => {
  const r = collectTargets([[
    ev('3', 'C', 'D', '2026-08-23 20:00:00'),
    ev('1', 'A', 'B', '2026-08-23 09:00:00')
  ]], []);
  assert.deepEqual(r.events.map(e => e.idEvent), ['1', '3']);
});

test('idEvent 가 같은 경기는 한 번만 (UTC 3일이 겹쳐 온다)', () => {
  const r = collectTargets([
    [ev('1', 'A', 'B', '2026-08-23 09:00:00')],
    [ev('1', 'A', 'B', '2026-08-23 09:00:00')]
  ], []);
  assert.equal(r.events.length, 1);
});

test('빈 목록·null 이 섞여도 죽지 않는다', () => {
  const r = collectTargets([null, [], [ev('1', 'A', 'B', '2026-08-23 09:00:00')]], []);
  assert.equal(r.events.length, 1);
});

test('사전 팀은 경기에 안 나와도 항상 들어간다', () => {
  const r = collectTargets([[ev('1', 'A', 'B', '2026-08-23 09:00:00')]], ['Arsenal', 'Chelsea']);
  assert.ok(r.teams.includes('Arsenal'));
  assert.ok(r.teams.includes('Chelsea'));
  assert.ok(r.teams.includes('A'));
});

test('사전 팀이 경기에도 나오면 중복되지 않는다', () => {
  const r = collectTargets([[ev('1', 'Arsenal', 'B', '2026-08-23 09:00:00')]], ['Arsenal']);
  assert.equal(r.teams.filter(t => t === 'Arsenal').length, 1);
});

test('대소문자만 다른 같은 팀을 중복으로 넣지 않는다', () => {
  const r = collectTargets([[ev('1', 'arsenal', 'B', '2026-08-23 09:00:00')]], ['Arsenal']);
  assert.equal(r.teams.filter(t => t.toLowerCase() === 'arsenal').length, 1);
});

test('상한을 넘긴 팀은 skippedTeams 로 전부 돌려준다 — 조용히 버리지 않는다', () => {
  const events = [];
  for (let i = 0; i < 5; i++) {
    events.push(ev(String(i), `H${i}`, `A${i}`, `2026-08-23 0${i}:00:00`));
  }
  const r = collectTargets([events], [], 4);
  assert.equal(r.teams.length, 4, '상한만큼만 굽는다');
  assert.equal(r.skippedTeams.length, 6, '나머지 6팀은 이름을 남긴다');
  const all = [...r.teams, ...r.skippedTeams];
  assert.equal(new Set(all).size, 10, '10팀이 빠짐없이 어느 한쪽에 있어야 한다');
});

test('사전 팀은 상한에 세지 않는다 — 항상 굽는다', () => {
  const r = collectTargets(
    [[ev('1', 'X', 'Y', '2026-08-23 09:00:00')]],
    ['Arsenal', 'Chelsea', 'Liverpool'],
    1
  );
  assert.equal(r.teams.length, 4, '사전 3팀 + 상한 1팀');
  assert.deepEqual(r.skippedTeams, ['Y']);
});

test('이른 경기의 팀이 먼저 구워진다 — 상한에 걸리면 늦은 경기가 밀린다', () => {
  const r = collectTargets([[
    ev('2', 'Late', 'LateAway', '2026-08-23 23:00:00'),
    ev('1', 'Early', 'EarlyAway', '2026-08-23 01:00:00')
  ]], [], 2);
  assert.deepEqual(r.teams, ['Early', 'EarlyAway']);
  assert.deepEqual(r.skippedTeams, ['Late', 'LateAway']);
});

test('팀 이름이 비어 있으면 무시한다', () => {
  const r = collectTargets([[ev('1', '', null, '2026-08-23 09:00:00')]], []);
  assert.deepEqual(r.teams, []);
  assert.deepEqual(r.skippedTeams, []);
});
```

- [ ] **Step 2: 테스트가 실패하는 것을 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../tools/lib/collect.mjs'`

- [ ] **Step 3: 최소 구현을 쓴다**

`tools/lib/collect.mjs`:

```js
/* 경기 목록에서 「구울 대상」을 골라낸다.

   ⚠️ 상한에 걸려 못 굽는 팀은 **이름을 돌려준다.**
     조용히 잘라내면 로그가 "다 구웠다"로 읽힌다. 부르는 쪽이 이걸
     manifest 와 워크플로 로그에 남긴다. */
export function collectTargets(eventLists, dictionaryTeams, cap = 60) {
  /* 1. 경기를 모아 idEvent 로 중복을 없앤다 (UTC 3일이 겹쳐 온다) */
  const byId = new Map();
  for (const list of eventLists || []) {
    for (const e of list || []) {
      if (!e || !e.idEvent) continue;
      const id = String(e.idEvent);
      if (!byId.has(id)) byId.set(id, e);
    }
  }

  /* 2. 시각 오름차순. 상한에 걸릴 때 이른 경기가 살아남게 한다 */
  const events = [...byId.values()].sort((a, b) =>
    String(a.strTimestamp || '').localeCompare(String(b.strTimestamp || ''))
  );

  /* 3. 사전 팀을 먼저 넣는다 — 상한에 세지 않는다 */
  const teams = [];
  const seen = new Set();
  for (const name of dictionaryTeams || []) {
    if (!name) continue;
    const key = String(name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    teams.push(name);
  }

  /* 4. 등장 팀을 상한까지 넣고, 넘친 팀은 이름을 남긴다 */
  const extra = [];
  for (const e of events) {
    for (const name of [e.strHomeTeam, e.strAwayTeam]) {
      if (!name) continue;
      const key = String(name).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push(name);
    }
  }

  return {
    events,
    teams: teams.concat(extra.slice(0, cap)),
    skippedTeams: extra.slice(cap)
  };
}
```

- [ ] **Step 4: 테스트가 통과하는 것을 확인한다**

Run: `npm test`
Expected: PASS — 10개 테스트 전부 통과 (앞선 15개도 그대로)

- [ ] **Step 5: 커밋**

```bash
git add tools/lib/collect.mjs tests/collect.test.mjs
git commit -m "feat: 구울 팀·경기를 골라내고 60팀 상한을 적용한다

사전 21팀은 상한에 세지 않고 항상 굽는다. 등장 팀은 이른 경기 순으로
상한까지 굽고, 넘친 팀은 이름을 돌려준다 — 조용히 잘라내면 로그가
'다 구웠다'로 읽힌다."
```

---

### Task 4: 프리베이크 스크립트 (`tools/prebake.mjs`)

앞의 세 조각을 엮어 실제로 API 를 부르고 `data/**.json` 을 쓴다. **이 태스크가 끝나면 무료 키로 실제 파일이 생기는 것을 눈으로 확인한다.**

**Files:**
- Create: `tools/prebake.mjs`
- Modify: `package.json` (`prebake` 스크립트 추가)

**Interfaces:**
- Consumes: `ArenaPath.fileFor`·`ArenaPath.safe` (Task 1) · `createLimiter` (Task 2) · `collectTargets` (Task 3)
- Consumes: `assets/teams.js` 의 `window.ArenaTeams.list` — `node:vm` 으로 읽는다 (이 파일은 `window` 만 건드리고 DOM 을 안 쓴다)
- Produces: `data/**.json` · `data/manifest.json`
- 환경변수: `SPORTSDB_KEY` (필수) · `PREBAKE_TEAM_CAP` (선택, 기본 60) · `PREBAKE_PER_MINUTE` (선택, 기본 90)

- [ ] **Step 1: 사전 21팀을 읽어오는 부분만 먼저 쓰고 확인한다**

`tools/prebake.mjs` 를 만들고 다음까지만 쓴다:

```js
/* ARENA LIVE — 프리베이크
   ==================================================================
   GitHub Actions 가 10분마다 이 스크립트를 돌려 data/**.json 을 만든다.
   브라우저는 그 JSON 만 읽으므로 API 키가 브라우저에 나가지 않는다.

   ⚠️ 파일 이름 규칙은 assets/apipath.js 가 유일한 출처다. 여기서 직접
     경로를 만들지 마십시오 — 한쪽만 고치면 브라우저가 404 만 받고
     화면은 멀쩡한 채 하드코딩으로 되돌아갑니다.
   ================================================================== */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

import { createLimiter } from './lib/limiter.mjs';
import { collectTargets } from './lib/collect.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ArenaPath = require(join(ROOT, 'assets/apipath.js'));

const OUT = join(ROOT, 'data');
const SPORTS = ['Soccer', 'Basketball', 'Baseball', 'American Football'];

/* assets/teams.js 의 사전을 그대로 읽는다. 팀 목록을 두 번 적지 않기 위해서다.
   이 파일은 window 만 건드리고 DOM 을 쓰지 않으므로 vm 으로 안전하게 돈다. */
async function dictionaryTeams() {
  const src = await readFile(join(ROOT, 'assets/teams.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'teams.js' });
  const list = sandbox.window.ArenaTeams && sandbox.window.ArenaTeams.list;
  if (!Array.isArray(list) || !list.length) {
    throw new Error('assets/teams.js 에서 사전을 읽지 못했다');
  }
  return list.map((t) => t.en);
}

if (process.argv[2] === '--dict') {
  const names = await dictionaryTeams();
  console.log(`사전 ${names.length}팀:`, names.join(', '));
  process.exit(0);
}
```

- [ ] **Step 2: 사전을 실제로 읽는지 확인한다**

Run: `node tools/prebake.mjs --dict`
Expected: `사전 21팀: Arsenal, Chelsea, Liverpool, Manchester City, ...` — **21팀**이 나와야 한다. 숫자가 다르면 `assets/teams.js` 의 `ROWS` 를 세어 확인한다.

- [ ] **Step 3: 나머지 구현을 쓴다**

`--dict` 분기 아래에 이어서 쓴다:

```js
/* ── UTC 날짜 ─────────────────────────────────────────── */
function utcKey(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/* ── 호출 ─────────────────────────────────────────────── */
const KEY = process.env.SPORTSDB_KEY;
if (!KEY) {
  console.error('SPORTSDB_KEY 가 없다. 무료 키로 조용히 떨어지지 않기 위해 중단한다.');
  process.exit(1);
}
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}/`;

const limit = createLimiter({ perMinute: Number(process.env.PREBAKE_PER_MINUTE || 90) });
const failed = [];

/* API 를 부르고 결과를 apipath 가 정한 파일에 쓴다.
   실패하면 파일을 만들지 않고 이름만 남긴다 — 브라우저는 404 를 받고
   하드코딩 화면을 그대로 둔다 (점진적 향상). */
async function bake(path) {
  const file = ArenaPath.fileFor(path);
  if (!file) throw new Error(`프리베이크하지 않는 엔드포인트: ${path}`);
  try {
    const json = await limit(async () => {
      const res = await fetch(BASE + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });
    await write(file, json);
    return json;
  } catch (err) {
    failed.push(`${path} → ${err.message}`);
    return null;
  }
}

async function write(file, json) {
  const full = join(OUT, file);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(json), 'utf8');
}

/* ── 본체 ─────────────────────────────────────────────── */
await rm(OUT, { recursive: true, force: true });   // 지난 회차 잔재를 남기지 않는다
await mkdir(OUT, { recursive: true });

const days = [-1, 0, 1].map(utcKey);
console.log(`① 경기 목록 — 종목 ${SPORTS.length} × UTC ${days.length}일 (${days.join(', ')})`);

const lists = [];
for (const day of days) {
  for (const sport of SPORTS) {
    const json = await bake(`eventsday.php?d=${day}&s=${encodeURIComponent(sport)}`);
    lists.push((json && json.events) || []);
  }
}

const gotAny = lists.some((l) => l.length);
if (!gotAny) {
  console.error('경기 목록이 12건 전부 비었다. 키가 죽었을 가능성이 높아 배포를 중단한다.');
  process.exit(1);
}

const dict = await dictionaryTeams();
const cap = Number(process.env.PREBAKE_TEAM_CAP || 60);
const { events, teams, skippedTeams } = collectTargets(lists, dict, cap);
console.log(`② 경기 ${events.length}건 · 구울 팀 ${teams.length}팀 (사전 ${dict.length} + 등장 ${teams.length - dict.length}) · 상한 초과 ${skippedTeams.length}팀`);

/* ③ 경기 상세 — API 를 부르지 않는다. ①에서 받은 응답을 id 별로 쪼개 쓴다.
   data-pages.js 는 ?event= 가 「오늘 목록」에 없을 때만 lookupevent 를 부르는데,
   어제·내일 경기가 그 경우다. 그 정보는 ①의 응답에 이미 들어 있다. */
for (const ev of events) {
  await write(ArenaPath.fileFor(`lookupevent.php?id=${ev.idEvent}`), { events: [ev] });
}
console.log(`③ 경기 상세 ${events.length}건 (추가 호출 0건)`);

/* ④ 팀 허브 — searchteams → eventsnext, 그리고 리그 순위표 */
const leagues = new Map();
let teamHit = 0;
for (const name of teams) {
  const json = await bake(`searchteams.php?t=${encodeURIComponent(name)}`);
  const team = json && json.teams && json.teams[0];
  if (!team) continue;
  teamHit++;
  if (team.idTeam) await bake(`eventsnext.php?id=${team.idTeam}`);
  if (team.idLeague && !leagues.has(team.idLeague)) leagues.set(team.idLeague, true);
}
console.log(`④ 팀 ${teamHit}/${teams.length}팀 · 리그 ${leagues.size}개`);

/* ⑤ 리그 순위표. 시즌 추정값은 data-pages.js:334 의 기존 로직과 같게 둔다. */
const year = new Date().getUTCFullYear();
const seasons = [`${year}-${year + 1}`, String(year), `${year - 1}-${year}`];
let tableHit = 0;
for (const leagueId of leagues.keys()) {
  for (const season of seasons) {
    const json = await bake(`lookuptable.php?l=${leagueId}&s=${season}`);
    if (json && json.table && json.table.length) { tableHit++; break; }
  }
}
console.log(`⑤ 순위표 ${tableHit}/${leagues.size}개`);

/* ⑥ manifest — 못 구운 것을 반드시 남긴다 */
await write('manifest.json', {
  generatedAt: new Date().toISOString(),
  days,
  counts: {
    eventsday: lists.filter((l) => l.length).length,
    events: events.length,
    teamsRequested: teams.length,
    teamsFound: teamHit,
    table: tableHit
  },
  skippedTeams,
  failed
});

console.log(`\n완료. 실패 ${failed.length}건 · 상한 초과 ${skippedTeams.length}팀`);
if (skippedTeams.length) console.log('상한에 걸려 못 구운 팀:', skippedTeams.join(', '));
if (failed.length) console.log('실패한 호출:\n  ' + failed.join('\n  '));
```

`package.json` 의 `scripts` 에 추가:

```json
"prebake": "node tools/prebake.mjs"
```

- [ ] **Step 4: 무료 키로 실제로 돌려 파일이 생기는지 확인한다**

Run:
```bash
SPORTSDB_KEY=3 npm run prebake
```

Expected:
- `① 경기 목록 …` → `⑥` 까지 순서대로 찍힌다
- 종목당 3건 제한 때문에 `② 경기 12건 안팎`, 팀 20~45팀
- 마지막에 `완료. 실패 N건` — 무료 키는 `eventsnext` 가 1건 제한이라 일부 실패가 정상이다

이어서 파일을 확인한다:
```bash
ls data/ && cat data/manifest.json && ls data/eventsday/ | head && ls data/teams/ | head
```

Expected: `data/eventsday/` 에 `<날짜>_soccer.json` 형태 파일들, `data/teams/` 에 `arsenal.json` 등, `data/manifest.json` 에 `skippedTeams`·`failed` 가 들어 있다.

- [ ] **Step 5: 이름 규칙이 브라우저 쪽과 맞는지 교차 확인한다**

Run:
```bash
node -e "
const p = require('./assets/apipath.js');
const fs = require('fs');
const want = p.fileFor('searchteams.php?t=' + encodeURIComponent('Arsenal'));
console.log('브라우저가 찾을 경로:', want, '→ 존재:', fs.existsSync('data/' + want));
"
```

Expected: `존재: true`. `false` 면 프리베이크와 브라우저의 이름 규칙이 어긋난 것이므로 Task 1 로 돌아간다.

- [ ] **Step 6: 커밋**

```bash
git add tools/prebake.mjs package.json
git commit -m "feat: 프리베이크 스크립트

API 를 여기서만 부른다. 경기 상세(lookupevent)는 eventsday 응답을 쪼개
쓰므로 추가 호출이 0건이다. 경기 목록 12건이 전부 비면(키 사망) 중단하고,
개별 실패는 파일을 안 만들어 브라우저가 하드코딩을 유지하게 둔다.

파일 이름은 assets/apipath.js 규칙만 쓴다. 사전 21팀은 assets/teams.js 를
vm 으로 읽어 목록을 두 번 적지 않는다."
```

---

### Task 5: 브라우저를 프리베이크로 돌린다 (`assets/data.js` + 6장)

네트워크 진입점을 `getJson` 하나로 합치고 `SOURCE` 를 둔다. **Cloudflare 전환 시 두 줄만 바꾸면 되게 하는 것이 이 태스크의 핵심 산출물이다.**

**Files:**
- Modify: `assets/data.js:36-37` (`KEY`·`BASE` → `SOURCE`) · `assets/data.js:176-198` (`fetchUtcDay`·`getJson`)
- Modify: `index.html:476` · `dashboard.html` · `match-center.html` · `news.html` · `schedule.html` · `team-hub.html` — `apipath.js` 태그를 **맨 앞**에 추가

**Interfaces:**
- Consumes: `window.ArenaPath.fileFor` (Task 1) · `data/**.json` (Task 4)
- Produces: 없음 (기존 `window.ArenaData` 계약을 그대로 유지한다 — `data-pages.js` 는 한 글자도 안 바꾼다)

- [ ] **Step 1: `assets/data.js` 의 `KEY`·`BASE` 를 `SOURCE` 로 바꾼다**

`assets/data.js:36-37` 의 두 줄

```js
  var KEY = '3';                 // 무료 테스트 키. 발급받은 키로 바꾸면 건수 제한이 풀린다
  var BASE = 'https://www.thesportsdb.com/api/v1/json/' + KEY + '/';
```

을 다음으로 교체한다:

```js
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
```

- [ ] **Step 2: `getJson` 을 유일한 진입점으로 만든다**

`assets/data.js:194-198` 의 `getJson`

```js
  function getJson(path) {
    return fetch(BASE + path)
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
```

을 다음으로 교체한다:

```js
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
```

- [ ] **Step 3: `fetchUtcDay` 도 `getJson` 을 쓰게 바꾼다**

`assets/data.js:179-186` 의 `fetch(BASE + 'eventsday.php…')` 부분

```js
    cache[utcKey] = Promise.all(SPORTS.map(function (sport) {
      return fetch(BASE + 'eventsday.php?d=' + utcKey + '&s=' + encodeURIComponent(sport))
        .then(function (r) { return r.ok ? r.json() : { events: null }; })
        .then(function (j) { return j.events || []; })
        .catch(function () { return []; });
    })).then(function (lists) {
```

을 다음으로 교체한다 (진입점을 하나로 만드는 것이 목적이다):

```js
    cache[utcKey] = Promise.all(SPORTS.map(function (sport) {
      return getJson('eventsday.php?d=' + utcKey + '&s=' + encodeURIComponent(sport))
        .then(function (j) { return (j && j.events) || []; });
    })).then(function (lists) {
```

- [ ] **Step 4: 문법을 확인한다**

Run: `node --check assets/data.js && node --check assets/apipath.js`
Expected: 출력 없음 (통과)

Run: `grep -n "BASE\|var KEY" assets/data.js`
Expected: **출력 없음.** 하나라도 남아 있으면 진입점이 아직 갈라져 있다는 뜻이다.

- [ ] **Step 5: 6장에 `apipath.js` 태그를 맨 앞에 넣는다**

Run:
```bash
for f in index.html dashboard.html match-center.html news.html schedule.html team-hub.html; do
  grep -q 'assets/apipath.js' "$f" || \
  sed -i 's|<script src="assets/teams.js"></script>|<script src="assets/apipath.js"></script>\n<script src="assets/teams.js"></script>|' "$f"
done
grep -c 'assets/apipath.js' *.html
```

Expected: 6장 전부 `1`

Run: `grep -A7 'assets/apipath.js' index.html | grep 'script src'`
Expected 순서: `apipath.js → teams.js → app.js → search.js → user.js → seo.js → data.js → data-pages.js` — 규칙 ⑧ 의 기존 순서가 그대로 유지되고 앞에 하나가 붙은 형태여야 한다.

- [ ] **Step 6: 브라우저에서 실제 데이터가 뜨는지 확인한다**

Task 4 에서 만든 `data/` 가 있는 상태에서 로컬 서버를 띄운다:

```bash
npx --yes http-server -p 8080 -c-1 .
```

브라우저(또는 chrome-devtools MCP)로 6장을 열어 확인한다:

| 확인할 것 | 기대 |
|---|---|
| `http://localhost:8080/index.html` | 홈 경기 카드에 **실제 팀명**이 뜬다 (`data/manifest.json` 에 있는 팀) |
| `http://localhost:8080/schedule.html` | 경기 목록이 실제 데이터다 |
| `http://localhost:8080/team-hub.html?team=Liverpool` | **리버풀 / LIV** 가 뜬다 (하드코딩은 아스날/ARS) |
| `http://localhost:8080/match-center.html` | 실제 경기가 뜬다 |
| `http://localhost:8080/dashboard.html` | 팔로우 팀 일정이 채워진다 |
| **네트워크 탭** | **`thesportsdb.com` 으로 나가는 요청이 0건.** 이게 이 작업의 핵심 성과다 |
| **네트워크 탭** | `data/…json` 요청이 200 으로 온다 |

`?team=` 이 하드코딩으로 되돌아가면 `data/teams/<이름>.json` 이 있는지, Task 4 Step 5 의 교차 확인을 다시 돌린다.

- [ ] **Step 7: 커밋**

```bash
git add assets/data.js index.html dashboard.html match-center.html news.html schedule.html team-hub.html
git commit -m "feat: 브라우저가 API 대신 프리베이크 JSON 을 읽는다

네트워크 진입점을 getJson 하나로 합치고 그 위에 SOURCE 를 뒀다.
Cloudflare Workers 프록시로 옮길 때 SOURCE 두 줄만 바꾸면 되고,
부르는 쪽(data-pages.js 5곳)은 손대지 않는다.

apipath.js 는 의존성이 없고 data.js 만 쓰므로 맨 앞에 뒀다 — 규칙 ⑧ 의
기존 순서는 그대로다. API 키가 브라우저 소스에서 완전히 사라졌다."
```

---

### Task 6: 도메인·주소 (`CNAME` + 6장 24곳)

**Files:**
- Create: `CNAME`
- Modify: 6장 × canonical 1곳·og:image 1곳·JSON-LD `url` 1곳 = **18곳** + canonical 확장자 **6곳**

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 고칠 곳을 세어 기록한다**

Run:
```bash
grep -c 'example\.com' *.html && echo "--- 합계 ---" && grep -o 'example\.com' *.html | wc -l
```
Expected: 6장 각 `3`, 합계 **18**

- [ ] **Step 2: `CNAME` 을 만든다**

Run:
```bash
printf 'barosportstv.com\n' > CNAME && cat CNAME
```
Expected: `barosportstv.com`

- [ ] **Step 3: 도메인을 치환한다**

Run:
```bash
sed -i 's|https://example\.com|https://barosportstv.com|g' index.html dashboard.html match-center.html news.html schedule.html team-hub.html
grep -c 'example\.com' *.html
```
Expected: 6장 전부 `0`

- [ ] **Step 4: canonical 이 404 를 가리키던 것을 고친다**

현재 canonical 은 확장자가 없어 `https://barosportstv.com/schedule` 을 가리키는데, Pages 는 `/schedule.html` 을 내보낸다. 실제 파일 주소로 맞춘다 (사양서 6절).

Run:
```bash
for p in dashboard match-center news schedule team-hub; do
  sed -i "s|<link rel=\"canonical\" href=\"https://barosportstv.com/$p\">|<link rel=\"canonical\" href=\"https://barosportstv.com/$p.html\">|" $p.html
done
grep -n 'rel="canonical"' *.html
```

Expected:
```
dashboard.html:9:<link rel="canonical" href="https://barosportstv.com/dashboard.html">
index.html:9:<link rel="canonical" href="https://barosportstv.com/">
match-center.html:9:<link rel="canonical" href="https://barosportstv.com/match-center.html">
news.html:9:<link rel="canonical" href="https://barosportstv.com/news.html">
schedule.html:9:<link rel="canonical" href="https://barosportstv.com/schedule.html">
team-hub.html:9:<link rel="canonical" href="https://barosportstv.com/team-hub.html">
```

`index.html` 은 `/` 그대로 둔다 — 루트는 실제로 `index.html` 을 내보내므로 404 가 아니다.

- [ ] **Step 5: og:image 가 실제로 있는 파일을 가리키는지 확인한다**

Run:
```bash
grep -h 'og:image' index.html | head -1 && ls assets/img/news-main.jpg
```
Expected: `https://barosportstv.com/assets/img/news-main.jpg` 이고 파일이 존재한다

- [ ] **Step 6: 커밋**

```bash
git add CNAME index.html dashboard.html match-center.html news.html schedule.html team-hub.html
git commit -m "feat: 도메인을 barosportstv.com 으로 맞추고 canonical 을 고친다

example.com 18곳을 치환했다. canonical 이 확장자 없는 주소(/schedule)를
가리켰는데 Pages 는 /schedule.html 을 내보내므로 404 를 가리키고 있었다.
파일을 schedule/index.html 로 옮기는 대신 canonical 에 확장자를 붙였다 —
안정화된 화면의 내부 링크를 건드리지 않기 위해서다."
```

---

### Task 7: 배포 워크플로 (`.github/workflows/deploy.yml`)

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run build:css` · `npm run prebake` · GitHub Secret `SPORTSDB_KEY`
- Produces: Pages 배포

- [ ] **Step 1: 워크플로를 쓴다**

`.github/workflows/deploy.yml`:

```yaml
# ARENA LIVE — 프리베이크 + Pages 배포
#
# API 키는 Secret SPORTSDB_KEY 에만 있고, 여기서만 쓰인다.
# 브라우저는 이 워크플로가 만든 data/**.json 만 읽는다.
name: deploy

on:
  schedule:
    # 10분마다. 크론 최소 간격은 5분이지만 GitHub 부하로 10분 이상 밀리는
    # 일이 흔해, 5분으로 잡아도 실측 지연은 비슷하면서 실행 횟수만 두 배가 된다.
    - cron: '*/10 * * * *'
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# 겹쳐 돌면 Pages 배포가 서로를 덮는다. 진행 중인 것을 끝까지 두고 새 것만 취소한다.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm

      - run: npm ci

      - name: 단위 테스트
        run: npm test

      - name: Tailwind 빌드
        run: npm run build:css

      - name: 프리베이크 (API 를 부르는 유일한 곳)
        env:
          SPORTSDB_KEY: ${{ secrets.SPORTSDB_KEY }}
        run: npm run prebake

      - name: 배포할 것만 모은다
        # 백업(_백업_수정전)·검토 스크린샷(_검토_스크린샷)·설계 문서·빌드 도구는
        # 공개 주소로 나가면 안 된다. 필요한 것만 골라 담는다.
        run: |
          mkdir -p _site
          cp *.html CNAME _site/
          cp -r assets data _site/
          rm -f _site/assets/img/출처.md
          echo "담은 것:" && ls -la _site/

      - name: 키가 산출물에 새지 않았는지 검사
        # 사람의 주의력에 기대지 않고 구조로 막는다.
        env:
          SPORTSDB_KEY: ${{ secrets.SPORTSDB_KEY }}
        run: |
          if grep -rqF "$SPORTSDB_KEY" _site/; then
            echo "::error::산출물에서 API 키를 발견했다. 배포를 중단한다."
            grep -rlF "$SPORTSDB_KEY" _site/
            exit 1
          fi
          if grep -rqE 'thesportsdb\.com/api' _site/ ; then
            echo "::error::산출물이 TheSportsDB 를 직접 부르고 있다. 브라우저에서 API 를 부르면 안 된다."
            grep -rlE 'thesportsdb\.com/api' _site/
            exit 1
          fi
          echo "키 노출 없음 · 브라우저에서 API 를 직접 부르는 곳 없음"

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - id: deploy
        uses: actions/deploy-pages@v4

      - name: 프리베이크 결과 요약
        # 상한에 걸려 못 구운 팀·실패한 호출을 로그에 남긴다.
        # 조용히 잘라내면 "다 구웠다"로 읽힌다.
        run: |
          echo '### 프리베이크 결과' >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          cat data/manifest.json >> $GITHUB_STEP_SUMMARY
          echo '' >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 2: YAML 문법을 확인한다**

Run:
```bash
node -e "
const s = require('fs').readFileSync('.github/workflows/deploy.yml','utf8');
if (/\t/.test(s)) { console.error('탭 문자가 있다 — YAML 에서 금지'); process.exit(1); }
console.log('줄 수:', s.split('\n').length, '· 탭 없음');
"
```
Expected: 탭 없음

- [ ] **Step 3: `_site` 담기 단계를 로컬에서 그대로 돌려 확인한다**

Run:
```bash
rm -rf _site && mkdir -p _site && cp *.html CNAME _site/ && cp -r assets data _site/ && rm -f _site/assets/img/출처.md
echo "=== 배포될 것 ===" && ls _site/
echo "=== 나가면 안 되는 것이 들어갔는지 ===" && ls _site/ | grep -E '_백업|_검토|docs|tools|src|node_modules|package' || echo "없음 (통과)"
```
Expected: `_site/` 에 6장 HTML·`CNAME`·`assets/`·`data/` 만 있고, 마지막 줄이 `없음 (통과)`

- [ ] **Step 4: `_site` 를 정리하고 `.gitignore` 에 넣는다**

Run:
```bash
rm -rf _site
printf '\n# 배포 산출물 (워크플로가 만든다)\n_site/\n' >> .gitignore
tail -5 .gitignore
```

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "feat: 프리베이크 + Pages 배포 워크플로

10분 크론. API 키는 Secret 에만 있고 프리베이크 단계에서만 쓰인다.

배포 직전 두 가지를 검사해 하나라도 걸리면 배포를 중단한다:
- 산출물에 키 문자열이 있는지
- 산출물이 thesportsdb.com 을 직접 부르는지 (브라우저에서 부르면 안 된다)

백업(_백업_수정전)과 검토 스크린샷(_검토_스크린샷)이 공개 주소로 나가지
않도록 필요한 것만 골라 _site 에 담는다."
```

---

### Task 8: 크론이 60일 뒤 꺼지는 것을 막는다 (`.github/workflows/keepalive.yml`)

GitHub 은 **저장소에 커밋이 60일간 없으면 스케줄 워크플로를 자동으로 끈다.** 크론이 도는 것 자체는 활동으로 세지 않는다. 사이트를 한동안 손대지 않으면 조용히 멈춘다.

**Files:**
- Create: `.github/workflows/keepalive.yml`

- [ ] **Step 1: 워크플로를 쓴다**

`.github/workflows/keepalive.yml`:

```yaml
# 크론 자동 정지 방지
#
# GitHub 은 저장소에 커밋이 60일간 없으면 스케줄 워크플로를 끈다.
# 크론이 도는 것은 활동으로 세지 않으므로, 사이트를 한동안 손대지 않으면
# deploy.yml 이 조용히 멈춘다. 주 1회 커밋을 만들어 그것을 막는다.
name: keepalive

on:
  schedule:
    - cron: '17 3 * * 1'      # 매주 월요일 03:17 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  touch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: 마지막 확인 시각을 적는다
        run: |
          mkdir -p .github
          date -u '+%Y-%m-%dT%H:%M:%SZ' > .github/last-alive
          cat .github/last-alive

      - name: 커밋
        run: |
          git config user.name  'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git add .github/last-alive
          git diff --staged --quiet || git commit -m "chore: keepalive (크론 자동 정지 방지)"
          git push
```

- [ ] **Step 2: YAML 에 탭이 없는지 확인한다**

Run:
```bash
node -e "
const s = require('fs').readFileSync('.github/workflows/keepalive.yml','utf8');
if (/\t/.test(s)) { console.error('탭 문자가 있다'); process.exit(1); }
console.log('통과');
"
```
Expected: `통과`

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/keepalive.yml
git commit -m "feat: 크론 자동 정지 방지 워크플로

GitHub 은 커밋이 60일간 없으면 스케줄 워크플로를 끈다. 크론이 도는 것은
활동으로 세지 않으므로 사이트를 한동안 손대지 않으면 배포가 조용히 멈춘다.
주 1회 .github/last-alive 를 갱신해 막는다."
```

---

### Task 9: DNS 안내서와 문서 정정

**Files:**
- Create: `docs/배포_DNS_설정.md`
- Modify: `다음세션_재개.md`

- [ ] **Step 1: DNS 안내서를 쓴다**

`docs/배포_DNS_설정.md`:

```markdown
# barosportstv.com 연결 — BD 가 직접 해야 하는 것

> AI 가 대신 할 수 없는 부분입니다. 도메인 등록기관 관리 화면에서 넣어야 합니다.

## 1. GitHub 쪽 (한 번만)

저장소 → **Settings → Pages**
- Source: **GitHub Actions**
- Custom domain: `barosportstv.com` → Save
- **Enforce HTTPS**: 인증서가 발급된 뒤(보통 몇 분~한 시간) 체크

저장소 → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `SPORTSDB_KEY`
- Secret: 발급받은 TheSportsDB 키
- ⚠️ 이 값을 코드나 문서에 적지 마십시오. 워크플로가 산출물에서 이 문자열을
  찾아내면 배포를 중단하도록 만들어 두었습니다.

## 2. 도메인 등록기관 쪽 (DNS)

`barosportstv.com` (루트 도메인)에 **A 레코드 4개**를 넣습니다.

| 종류 | 이름 | 값 |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

IPv6 도 쓰려면 **AAAA 레코드 4개**를 더 넣습니다.

| 종류 | 이름 | 값 |
|---|---|---|
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

`www.barosportstv.com` 도 쓰려면 **CNAME** 하나를 더 넣습니다.

| 종류 | 이름 | 값 |
|---|---|---|
| CNAME | `www` | `<계정명>.github.io.` |

> ⚠️ 위 IP 는 GitHub Pages 의 공식 값이지만 **바뀔 수 있습니다.**
> 넣기 전에 GitHub 문서에서 현재 값을 한 번 확인하십시오:
> <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>

## 3. 확인

DNS 전파에 보통 10분~1시간, 길면 하루가 걸립니다. 그 뒤:

```
https://barosportstv.com          → 홈이 뜬다
https://barosportstv.com/schedule.html → 경기 일정이 뜬다
```

브라우저 개발자 도구 → 네트워크 탭에서 **`thesportsdb.com` 으로 나가는 요청이
0건**이어야 합니다. 있으면 키가 브라우저로 새고 있다는 뜻입니다.

## 4. 나중에 Cloudflare 로 옮길 때

설계 문서 `docs/superpowers/specs/2026-08-23-github-pages-배포-설계.md` 11.1절을
보십시오. `assets/data.js` 의 `SOURCE` 두 줄만 바꾸면 됩니다.
```

- [ ] **Step 2: `다음세션_재개.md` 의 틀린 표를 고친다**

`다음세션_재개.md` 의 「⚠️ 유료 키를 받아야 비로소 검증되는 구역 4개」 표에서
`lookupeventstats`·`lookuptimeline` 두 줄을 지우고, 표 아래에 다음을 넣는다:

```markdown
> 🔴 **2026-08-23 정정 — 이 표에 원래 4개가 있었습니다.** 중계 「경기 기록」
> (`lookupeventstats`)·「주요 장면」(`lookuptimeline`) 두 줄은 **틀렸습니다.**
> 그 엔드포인트는 **코드에 없습니다** — `assets/data.js:19` 주석에 이름만 있고
> 호출이 한 줄도 없으며, `match-center.html:323` 구역은 순수 하드코딩입니다.
> **유료 키를 넣어도 그 두 구역은 저절로 채워지지 않습니다. 코드를 새로 써야 합니다.**
```

- [ ] **Step 3: `다음세션_재개.md` 에 새 규칙 두 개를 추가한다**

3절 규칙 목록의 끝(⑳ 뒤)에 추가한다:

```markdown
### ㉑ API 키를 코드에 넣지 말 것 🔴

정적 사이트라 `assets/data.js` 에 넣은 키는 **브라우저 소스에 그대로 보입니다.**
키는 GitHub Secret `SPORTSDB_KEY` 에만 둡니다.

- API 를 부르는 곳은 `tools/prebake.mjs` **한 곳뿐**입니다. 브라우저는
  `data/**.json` 만 읽습니다.
- 배포 워크플로가 산출물에서 키 문자열과 `thesportsdb.com/api` 를 찾아내면
  **배포를 중단합니다.** 이 검사를 끄지 마십시오.

### ㉒ 파일 이름 규칙의 출처는 `assets/apipath.js` 한 곳이다 🔴

브라우저(`data.js`)와 프리베이크(`prebake.mjs`)가 **같은 파일 이름**을 계산해야 합니다.
한쪽만 고치면 브라우저가 404 만 받고 **화면은 멀쩡한 채 하드코딩으로 되돌아갑니다** —
점진적 향상 원칙 때문에 눈으로는 알아채기 어렵습니다.

- 규칙을 바꿀 일이 있으면 `assets/apipath.js` 와 `tests/apipath.test.mjs` 만 고칩니다.
- 스크립트 순서(규칙 ⑧)는 `apipath.js` 가 **맨 앞**입니다. 의존성이 없고
  `data.js` 만 이것을 씁니다.
```

- [ ] **Step 4: 규칙 ⑧ 의 순서 그림을 갱신한다**

`다음세션_재개.md` 규칙 ⑧ 의 코드 블록

```
teams.js → app.js → search.js → user.js → seo.js → data.js → data-pages.js
```

을 다음으로 바꾸고, 그 아래 설명 목록의 맨 앞에 한 줄을 추가한다:

```
apipath.js → teams.js → app.js → search.js → user.js → seo.js → data.js → data-pages.js
```

추가할 설명 줄:

```markdown
- `apipath.js` 가 맨 앞: `data.js` 가 프리베이크 파일 경로를 계산하는 데 쓴다
  (규칙 ㉒). 의존성이 없어 순서상 가장 앞이어야 안전하다
```

- [ ] **Step 5: 문서를 확인한다**

Run:
```bash
grep -n 'lookupeventstats' "다음세션_재개.md"
grep -n '### ㉑\|### ㉒\|apipath.js →' "다음세션_재개.md"
```
Expected: 첫 명령은 정정 문단 안의 언급만 나온다. 둘째 명령은 세 줄이 다 나온다.

- [ ] **Step 6: 커밋**

```bash
git add docs/배포_DNS_설정.md "다음세션_재개.md"
git commit -m "docs: DNS 안내서 · 핸드오프 문서 정정 · 새 규칙 2개

정정: 다음세션_재개.md 가 lookupeventstats·lookuptimeline 을 '배선됨'이라
적었으나 코드에 호출이 없다. 유료 키만으로는 그 두 구역이 채워지지 않는다.

새 규칙 ㉑(키를 코드에 넣지 말 것) ㉒(파일 이름 규칙의 출처는 apipath.js).
규칙 ⑧ 의 스크립트 순서에 apipath.js 를 맨 앞으로 반영했다."
```

---

### Task 10: 최종 검증

배치·접근성이 깨지지 않았는지 확인한다. **데이터 출처만 바뀌었으므로 화면은 그대로여야 한다.**

**Files:**
- Modify: `다음세션_재개.md` (실측 결과 기록)

- [ ] **Step 1: 로컬에서 6장을 띄운다**

Run:
```bash
SPORTSDB_KEY=3 npm run prebake && npx --yes http-server -p 8080 -c-1 . &
```

- [ ] **Step 2: Lighthouse 를 6장 돌린다**

`index.html`·`schedule.html`·`match-center.html`·`team-hub.html`·`dashboard.html`·`news.html`

| 항목 | 기대 |
|---|---|
| 접근성 | **100** (6장) — 5차와 같아야 한다 |
| SEO | **100** (6장) — canonical 을 고쳤으므로 확인이 필요하다 |
| Agentic Browsing (홈) | **100** — 덮개 링크 구조를 건드리지 않았으므로 유지 |
| Best Practices | **예상 100.** 429/CORS 로 96 이던 것이 사라질 것으로 본다. **예상이므로 실측값을 그대로 적는다** |

- [ ] **Step 3: 반응형 회귀를 확인한다**

`다음세션_재개.md` 5차 실측표의 폭에서 넘침·겹침이 0 인지 본다:
**360 · 390 · 632 · 640 · 768 · 800 · 1024 · 1080 · 1090 · 1280 · 1536 · 1560 · 1920px**

각 폭에서 6장에 대해 확인할 것:
- 페이지 가로 넘침 0
- 카드 밖으로 삐져나온 요소 0
- 상단 `nav` 잘림 0 (`nav.scrollWidth − nav.clientWidth` — 요소 사각형 비교로는 안 보인다)
- 히어로 제목이 어절 중간에서 끊기지 않음

**하나라도 깨지면 Task 5 를 의심한다** — 그 외에는 배치에 영향을 주는 변경이 없다.

- [ ] **Step 4: 키가 새지 않는지 마지막으로 확인한다**

Run:
```bash
grep -rn 'thesportsdb\.com/api' *.html assets/ || echo "브라우저 코드에 API 주소 없음 (통과)"
grep -rn "var KEY\|BASE =" assets/ || echo "브라우저 코드에 키·BASE 없음 (통과)"
```
Expected: 두 줄 다 `(통과)`

브라우저 네트워크 탭에서도 `thesportsdb.com` 요청이 **0건**인지 다시 확인한다.

- [ ] **Step 5: 실측 결과를 문서에 적는다**

`다음세션_재개.md` 1절에 「✅ 6차(2026-08-23)에 끝난 것 — GitHub Pages 배포 준비」 절을 만들어 적는다. **예상이 아니라 실측값**을 적고, Best Practices 가 100 이 되지 않았으면 그 사실과 원인을 적는다.

- [ ] **Step 6: 커밋**

```bash
git add "다음세션_재개.md"
git commit -m "docs: 6차 배포 준비 실측 결과

Lighthouse 6장·반응형 회귀 검증 결과를 실측값으로 기록했다."
```

---

## 남은 것 — BD 가 직접 해야 하는 일

이 계획을 다 끝내도 **사이트는 아직 안 뜹니다.** 다음은 AI 가 할 수 없습니다.

| # | 할 일 | 어디서 |
|---|---|---|
| 1 | GitHub 저장소를 만들고 `main` 을 push | `gh repo create` 또는 웹 |
| 2 | Settings → Pages → Source 를 **GitHub Actions** 로 | 저장소 설정 |
| 3 | Secret `SPORTSDB_KEY` 등록 | 저장소 설정 |
| 4 | DNS A 레코드 4개 | 도메인 등록기관 |

절차는 `docs/배포_DNS_설정.md` 에 있습니다.

**Secret 이 없으면 프리베이크가 의도적으로 실패합니다** — 무료 키로 조용히 떨어져서 "되는 것처럼 보이는" 상태를 만들지 않기 위해서입니다. 유료 키가 아직 없으면 임시로 `3`(무료 테스트 키)을 Secret 에 넣어 두면 배포 자체는 확인할 수 있습니다.
