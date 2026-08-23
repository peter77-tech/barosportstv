/* 경기 상태·시각 표기. data.js 를 가짜 DOM 에서 실제로 돌려 확인한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadArenaData() {
  const win = {
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, readyState: 'complete', title: '' },
    ArenaTeams: { list: [], get: () => null, ko: (n) => n, abbr: () => null, find: () => [] },
    ArenaSeo: { itemList: () => {}, sportsEvents: () => {}, webPage: () => {} },
    location: { search: '', pathname: '/index.html', href: 'http://x/index.html' }
  };
  win.window = win; win.self = win; win.globalThis = win;
  win.Promise = Promise; win.URLSearchParams = URLSearchParams; win.Date = Date;
  const ctx = vm.createContext(win);
  for (const f of ['assets/apipath.js', 'assets/data.js']) {
    vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: f });
  }
  return win.ArenaData;
}

/* 실측 표본은 data/eventsday 에서 그대로 옮긴 모양이다 (2026-08-23). */
const 종료 = { strStatus: 'FT', strTime: '18:00:00', strTimestamp: '2026-08-23T18:00:00', intHomeScore: 2, intAwayScore: 1 };
const 시각없는종료 = { strStatus: 'FT', strTime: '00:00:00', strTimestamp: '2026-08-22T00:00:00', intHomeScore: 0, intAwayScore: 0 };
const 시각없는예정 = { strStatus: 'NS', strTime: '00:00:00', strTimestamp: '2026-08-25T00:00:00', intHomeScore: null, intAwayScore: null };
const 예정 = { strStatus: 'NS', strTime: '10:30:00', strTimestamp: '2026-08-24T10:30:00', intHomeScore: null, intAwayScore: null };
const 연기 = { strStatus: 'POST', strTime: '11:00:00', strTimestamp: '2026-08-24T11:00:00', intHomeScore: null, intAwayScore: null };
const 취소 = { strStatus: 'CANC', strTime: '11:00:00', strTimestamp: '2026-08-24T11:00:00', intHomeScore: null, intAwayScore: null };
const 진행 = { strStatus: 'IN9', strProgress: '9회', strTime: '09:00:00', strTimestamp: '2026-08-23T09:00:00', intHomeScore: 3, intAwayScore: 2 };

test('연기·취소는 예정이 아니다 — 원래 시각을 그대로 보여주면 거짓말이 된다', async () => {
  const A = await loadArenaData();
  assert.equal(A.statusOf(연기), 'postponed');
  assert.equal(A.statusOf(취소), 'postponed');
  assert.equal(A.clockText(연기), '연기');
  assert.equal(A.clockText(취소), '취소');
});

test('시각이 없는 경기는 00:00 이 아니라 「시간 미정」이다', async () => {
  const A = await loadArenaData();
  assert.equal(A.clockText(시각없는예정), '시간 미정');
  assert.equal(A.clockText(시각없는종료), '시간 미정');
});

test('시각이 있으면 종료 경기도 킥오프 시각을 보여준다', async () => {
  const A = await loadArenaData();
  assert.match(A.clockText(종료), /^\d\d:\d\d$/);
  assert.match(A.clockText(예정), /^\d\d:\d\d$/);
});

test('진행 중은 진행 정보를 보여준다', async () => {
  const A = await loadArenaData();
  assert.equal(A.statusOf(진행), 'live');
  assert.equal(A.clockText(진행), '9회');
});

test('줄 세우는 순서는 진행 → 예정 → 연기 → 종료 다', async () => {
  const A = await loadArenaData();
  const order = A.byInterest([종료, 연기, 예정, 진행]).map(A.statusOf);
  assert.deepEqual(order, ['live', 'upcoming', 'postponed', 'finished']);
});
