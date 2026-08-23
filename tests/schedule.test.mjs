/* 일정 화면은 **보이는 경기만** 행으로 만든다.
   예전에는 1,101줄을 다 만든 뒤 998줄을 숨겼다 — 렌더 15초.
   판정 규칙은 app.js 의 matches() 하나뿐이므로, 여기서도 그 실물을 그대로 돌린다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

/* app.js 는 사이드바·칩을 만지므로 최소한의 가짜 DOM 이 필요하다.
   경기 행은 하나도 없게 둔다(칩이 없으면 app.js 는 표시만 바꾸는 모드로 남는다). */
async function loadArena() {
  const el = () => ({
    getAttribute: () => null,
    setAttribute: () => {},
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {}
  });
  const win = {
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    document: {
      body: el(),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      readyState: 'complete',
      title: ''
    },
    matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    setInterval: () => 0,
    history: { replaceState: () => {} },
    ArenaTeams: { list: [], get: () => null, ko: (n) => n, abbr: () => null, find: () => [] },
    ArenaSeo: { itemList: () => {}, sportsEvents: () => {}, webPage: () => {}, eventList: () => {} },
    location: { search: '', pathname: '/schedule.html', href: 'http://x/schedule.html' }
  };
  win.window = win; win.self = win; win.globalThis = win;
  win.Promise = Promise; win.URLSearchParams = URLSearchParams; win.Date = Date; win.Array = Array;
  const ctx = vm.createContext(win);
  for (const f of ['assets/apipath.js', 'assets/leagues.js', 'assets/app.js', 'assets/data.js']) {
    vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: f });
  }
  return win;
}

const 하루치 = [
  { idEvent: '1', strLeague: 'Korean KBO League', strStatus: 'NS' },
  { idEvent: '2', strLeague: 'NBA', strStatus: 'NS' },
  { idEvent: '3', strLeague: 'Australia Northern NSW NPL', strStatus: 'NS' },
  { idEvent: '4', strLeague: 'Dutch Eredivisie', strStatus: 'NS' },
  { idEvent: '5', strLeague: 'Faroe Islands 1. Deild', strStatus: 'NS' }
];

test('「주요 리그」에서는 1군 경기만 행으로 만든다 — 나머지는 아예 그리지 않는다', async () => {
  const win = await loadArena();
  const ids = win.ArenaData.visibleEvents(하루치, 'top').map((e) => e.idEvent);
  assert.deepEqual(ids, ['1', '2']);
});

test('「전체」에서는 전부 그린다', async () => {
  const win = await loadArena();
  assert.equal(win.ArenaData.visibleEvents(하루치, 'all').length, 5);
});

test('종목 칩에서는 그 리그만 그린다', async () => {
  const win = await loadArena();
  const ids = win.ArenaData.visibleEvents(하루치, 'nba').map((e) => e.idEvent);
  assert.deepEqual(ids, ['2']);
});

test('판정은 app.js 의 matches() 를 그대로 쓴다 — 두 곳에 두면 어긋난다', async () => {
  const win = await loadArena();
  assert.equal(typeof win.ArenaLeagueFilter.matches, 'function');
  assert.equal(win.ArenaLeagueFilter.matches('top', 'kbo', '1'), true);
  assert.equal(win.ArenaLeagueFilter.matches('top', 'npl', '3'), false);
});
