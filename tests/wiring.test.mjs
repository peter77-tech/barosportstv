/* data.js 를 가짜 DOM 에서 실제로 실행해, getJson 이 어떤 주소로 나가는지 잡는다.
   목적: 브라우저가 API 를 부르지 않고 프리베이크 파일만 읽는지 확인하는 것. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function loadDataJs() {
  const urls = [];
  const stubEl = new Proxy({}, {
    get(_, k) {
      if (k === 'querySelector' || k === 'querySelectorAll') return () => null;
      if (k === 'style' || k === 'dataset' || k === 'classList') return stubEl;
      if (k === 'addEventListener' || k === 'appendChild' || k === 'remove') return () => {};
      return undefined;
    }
  });
  const win = {
    fetch: (url) => {
      urls.push(url);
      return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      readyState: 'complete',
      title: ''
    },
    ArenaTeams: { list: [], get: () => null, ko: (n) => n, abbr: () => null, find: () => [] },
    ArenaSeo: { itemList: () => {}, sportsEvents: () => {}, webPage: () => {} },
    location: { search: '', pathname: '/index.html', href: 'http://x/index.html' }
  };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  win.Promise = Promise;
  win.URLSearchParams = URLSearchParams;
  win.Date = Date;

  const ctx = vm.createContext(win);
  for (const f of ['assets/apipath.js', 'assets/data.js']) {
    vm.runInContext(await readFile(f, 'utf8'), ctx, { filename: f });
  }
  return { win, urls };
}

test('apipath 와 data.js 가 가짜 DOM 에서 로드된다', async () => {
  const { win } = await loadDataJs();
  assert.ok(win.ArenaPath, 'window.ArenaPath 가 없다');
  assert.ok(win.ArenaData, 'window.ArenaData 가 없다');
  assert.equal(typeof win.ArenaData.getJson, 'function');
});

test('getJson 이 TheSportsDB 가 아니라 프리베이크 파일을 읽는다', async () => {
  const { win, urls } = await loadDataJs();
  await win.ArenaData.getJson('searchteams.php?t=Liverpool');
  assert.deepEqual(urls, ['./data/teams/liverpool.json']);
  assert.ok(!urls.some(u => /thesportsdb/i.test(u)), 'API 를 직접 불렀다');
});

test('경기 목록도 프리베이크 파일로 나간다 — 진입점이 하나다', async () => {
  const { win, urls } = await loadDataJs();
  await win.ArenaData.eventsForLocalDay(new Date('2026-08-23T12:00:00Z'));
  assert.ok(urls.length >= 4, `호출이 너무 적다: ${urls.length}`);
  for (const u of urls) {
    assert.match(u, /^\.\/data\/eventsday\/\d{4}-\d\d-\d\d_[a-z_]+\.json$/, `이상한 주소: ${u}`);
  }
  assert.ok(!urls.some(u => /thesportsdb/i.test(u)), 'API 를 직접 불렀다');
});

test('굽지 않는 엔드포인트는 아예 네트워크로 안 나간다', async () => {
  const { win, urls } = await loadDataJs();
  const r = await win.ArenaData.getJson('lookuptimeline.php?id=1');
  assert.equal(r, null);
  assert.deepEqual(urls, [], '굽지 않는 엔드포인트인데 요청을 보냈다');
});
