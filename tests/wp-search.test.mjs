/* 워드프레스 테마의 상단 검색(assets/search.js).
   2026-11-09 BD: 「전북 현대」를 눌러도 아무것도 안 나왔다 — 정적 사이트의 team-hub.html 로 가서 404.
   워드프레스에서는 테마가 BSTV_SEARCH_URL(/?s=)을 주고, 모든 이동이 워드프레스 검색으로 간다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const SRC = await readFile(new URL('../wp-theme/barosportstv/assets/search.js', import.meta.url), 'utf8');
const BASE = 'https://barosportstv.com/?s=';

function load(searchUrl) {
  const window = {
    ArenaTeams: { list: [
      { ko: '전북 현대', league: 'K-League', alias: 'jeonbuk hyundai motors 전북', en: 'Jeonbuk Hyundai Motors' },
      { ko: '현대캐피탈', league: 'V-League', alias: 'hyundai capital', en: 'Hyundai Capital Skywalkers' },
    ] },
  };
  if (searchUrl) window.BSTV_SEARCH_URL = searchUrl;
  const ctx = { window, document: { querySelectorAll: () => [] } };
  vm.runInNewContext(SRC, ctx);
  return window.BstvSearch;
}

test('wp_team_click_goes_to_wordpress_search', () => {
  const s = load(BASE);
  const hit = s.search('현대').find((r) => r.label === '전북 현대');
  assert.ok(hit, '팀이 목록에 나온다');
  assert.equal(hit.url, BASE + encodeURIComponent('전북 현대'));
});

test('wp_mode_has_no_static_html_links', () => {
  const s = load(BASE);
  const bad = s.index.filter((r) => /\.html/.test(r.url));
  assert.equal(bad.length, 0, bad.map((r) => r.label).join(','));   // vm 배열이라 deepEqual([]) 은 프로토타입이 달라 안 맞는다
  assert.ok(s.index.length > 0);
});

test('wp_enter_without_selection_searches_raw_query', () => {
  const s = load(BASE);
  assert.equal(s.queryUrl(' 전북 '), BASE + encodeURIComponent('전북'));
  assert.equal(s.queryUrl('   '), null);
});

/* 팀 사전에 없는 팀(KBL·V리그 다수)도 찾을 수 있게, 워드프레스에서는 목록 끝에 늘 「입력어 리뷰 검색」을 붙인다. */
test('wp_results_end_with_search_all_item', () => {
  const s = load(BASE);
  const none = s.search('KCC');
  assert.equal(none.length, 1);
  assert.equal(none[0].kind, '검색');
  assert.equal(none[0].url, BASE + encodeURIComponent('KCC'));
  const some = s.search('현대');
  assert.equal(some[some.length - 1].url, BASE + encodeURIComponent('현대'));
  assert.ok(some.length <= 7);
});

test('static_site_keeps_team_hub_links', () => {
  const s = load(null);
  const hit = s.search('전북').find((r) => r.label === '전북 현대');
  assert.equal(hit.url, 'team-hub.html?team=' + encodeURIComponent('Jeonbuk Hyundai Motors'));
  assert.equal(s.queryUrl('전북'), null);
});
