import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReview, summaryMarkdown, parseArgs } from '../tools/review/run.mjs';
import { toFacts as kblFacts } from '../tools/review/sources/kbl.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';
import { titleFor, LEAGUES } from '../tools/review/config.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const BASE = kblFacts({
  game: { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC',
    homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } },
  match: await load('kbl-S49G01N31-match'),
  teamRecord: await load('kbl-S49G01N31-team-record'),
  playerStat: await load('kbl-S49G01N31-player-stat'),
});

const NOW = new Date('2026-10-23T03:00:00Z');   // 한국 2026-10-23 12:00
const TEAMS = Object.keys(ALIASES.kbl).filter((t) => !['고양소노', '부산KCC'].includes(t));
const DOC = {
  meta_description: '요약 설명', answer: '답', key_points: ['요점'],
  body_html: '<h2>흐름</h2><p>본문</p>', verdict_html: '<p>총평</p>',
};

let seq = 0;
function game(league, date, home, away) {
  seq += 1;
  return { league, gameKey: `${league}-G${seq}`, date, home, away, homeScore: 80, awayScore: 70, stage: '정규시즌', ref: {} };
}
const entryFor = (g) => ({ query: `${g.date} ${g.home} ${g.away}`, date: g.date, text: `${g.home} ${ALIASES[g.league][g.home]} ${g.away} ${ALIASES[g.league][g.away]}` });
const OTHER_ENTRY = { query: '2026년 11월 1일 다른 경기', date: '2026-11-01', text: '다른 팀 경기' };

/* 가짜 의존성 묶음. calls 에 호출 순서를 남긴다. */
function deps({ games = {}, entries, listThrows = {}, composeResult, wpFound = () => null, now = NOW } = {}) {
  const calls = [];
  const sources = {};
  for (const lg of Object.keys(LEAGUES)) {
    const list = games[lg] ?? [];
    sources[lg] = {
      listFinished: async (days) => { calls.push(['list', lg, days]); if (listThrows[lg]) throw new Error('목록 실패'); return list; },
      fetchFacts: async (g) => { calls.push(['facts', g.gameKey]); return { ...BASE, league: g.league, gameKey: g.gameKey, date: g.date, home: { ...BASE.home }, away: { ...BASE.away } }; },
    };
  }
  const naver = async (lg) => {
    calls.push(['naver', lg]);
    if (entries && entries[lg]) return entries[lg];
    return [...(games[lg] ?? []).map(entryFor), OTHER_ENTRY];
  };
  const compose = async (facts, title, expected) => {
    calls.push(['compose', facts.gameKey, title, expected, facts]);
    return composeResult ? composeResult(facts) : { status: 'publish', doc: DOC, attempts: [{ pass: true, issues: [], usage: { input_tokens: 100, output_tokens: 50 } }] };
  };
  const wpCall = (name, fn) => async (...a) => { calls.push(['wp.' + name, ...a]); return fn(...a); };
  const wp = {
    ensureCategory: wpCall('ensureCategory', () => 7),
    ensureTags: wpCall('ensureTags', (names) => names.map((_, i) => 100 + i)),
    findBySlug: wpCall('findBySlug', wpFound),
    relatedReviews: wpCall('relatedReviews', () => [{ url: 'https://barosportstv.com/r1/', title: '관련 & 리뷰' }]),
    uploadImage: wpCall('uploadImage', () => 55),
    createPost: wpCall('createPost', () => ({ id: 900, link: 'https://barosportstv.com/x/' })),
    updatePost: wpCall('updatePost', (id) => ({ id, link: 'https://barosportstv.com/x/' })),
  };
  const image = async (facts) => { calls.push(['image', facts.gameKey]); return Buffer.from('JPEG'); };
  return { calls, now, sources, naver, compose, wp, image, log: () => {} };
}
const named = (calls, n) => calls.filter((c) => c[0] === n);
const at = (calls, n, pred = () => true) => calls.findIndex((c) => c[0] === n && pred(c));
const PLACEHOLDER = '<p>자동 작성 중 — 실패하면 이 임시글이 남는다.</p>';
const wpCalls = (calls) => calls.filter((c) => c[0].startsWith('wp.'));

test('skips_before_start_date', async () => {
  const old = game('kbl', '2026-10-21', '서울 삼성', '부산 KCC');
  const ok = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({ games: { kbl: [old, ok] } });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.gameKey), [ok.gameKey]);
  assert.ok(!named(d.calls, 'facts').some((c) => c[1] === old.gameKey));
  assert.ok(d.calls.find((c) => c[0] === 'list')[2].every((day) => day >= '2026-10-22'));
});

test('no_query_today_is_skip_old_is_giveup', async () => {
  const now = new Date('2026-10-26T03:00:00Z');   // 한국 10-26
  const recent = game('kbl', '2026-10-25', '서울 삼성', '부산 KCC');   // 오늘-1 → skip
  const old = game('kbl', '2026-10-24', '서울 SK', '창원 LG');          // 그보다 이전 → giveup
  const d = deps({ now, games: { kbl: [recent, old] }, entries: { kbl: [OTHER_ENTRY] } });
  const r = await runReview({ ...d, only: 'kbl' });
  const by = Object.fromEntries(r.outcomes.map((o) => [o.gameKey, o.status]));
  assert.equal(by[recent.gameKey], 'skip');
  assert.equal(by[old.gameKey], 'giveup');
  assert.equal(named(d.calls, 'compose').length, 0);
  assert.equal(named(d.calls, 'facts').length, 0);
  assert.deepEqual(r.errors, []);
});

test('existing_slug_is_exists', async () => {
  const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g] }, wpFound: () => ({ id: 42, status: 'draft' }) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.outcomes[0].status, 'exists');
  assert.equal(r.outcomes[0].postId, 42);
  assert.equal(named(d.calls, 'compose').length, 0);
  assert.equal(named(d.calls, 'facts').length, 0);
  assert.equal(named(d.calls, 'wp.findBySlug')[0][1], `match-review-${g.gameKey.toLowerCase()}`);
  assert.equal(named(d.calls, 'wp.createPost').length, 0);
});

test('naver_zero_entries_is_error', async () => {
  const k = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const w = game('wkbl', '2026-10-22', '청주 KB스타즈', '용인 삼성생명');
  const d = deps({ games: { kbl: [k], wkbl: [w] }, entries: { kbl: [] } });
  const r = await runReview({ ...d });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /KBL/);
  assert.ok(!named(d.calls, 'compose').some((c) => c[1] === k.gameKey));
  assert.ok(named(d.calls, 'compose').some((c) => c[1] === w.gameKey));   // 다른 리그는 계속
});

test('naver_timeout_is_league_error', async () => {
  const k = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [k] } });
  d.naver = () => new Promise(() => {});
  const r = await runReview({ ...d, only: 'kbl', naverTimeoutMs: 20 });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /KBL.*시간/);
  assert.equal(named(d.calls, 'compose').length, 0);
});

test('max_posts_per_run', async () => {
  const pairs = [];
  for (let i = 0; i < TEAMS.length && pairs.length < 15; i++) {
    for (let j = i + 1; j < TEAMS.length && pairs.length < 15; j++) pairs.push(game('kbl', '2026-10-22', TEAMS[i], TEAMS[j]));
  }
  assert.equal(pairs.length, 15);
  const d = deps({ games: { kbl: pairs } });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(named(d.calls, 'compose').length, 12);
  assert.equal(r.outcomes.length, 15);
  assert.equal(r.outcomes.filter((o) => o.status === 'skip').length, 3);
  assert.deepEqual(r.errors, []);
});

test('publish_order', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({
    games: { kbl: [g1, g2] },
    composeResult: (f) => f.gameKey === g2.gameKey
      ? { status: 'draft', doc: DOC, attempts: [{ pass: false, issues: [{ field: 'answer', problem: '숫자' }], usage: { input_tokens: 1, output_tokens: 2 } }] }
      : { status: 'publish', doc: DOC, attempts: [{ pass: true, issues: [], usage: { input_tokens: 10, output_tokens: 20 } }] },
  });
  const r = await runReview({ ...d, only: 'kbl' });
  for (const [g, status] of [[g1, 'publish'], [g2, 'draft']]) {
    const slug = `match-review-${g.gameKey.toLowerCase()}`;
    const query = entryFor(g).query;
    /* 원고보다 먼저 slug 를 임시글로 잡는다: 실패해도 다음 회차가 「있음」으로 보고 다시 쓰지 않는다 */
    const cp = at(d.calls, 'wp.createPost', (c) => c[1].slug === slug);
    const co = at(d.calls, 'compose', (c) => c[1] === g.gameKey);
    const up = at(d.calls, 'wp.uploadImage', (c) => c[2] === `${slug}.jpg`);
    const ud = d.calls.findIndex((c, i) => i > up && c[0] === 'wp.updatePost');
    assert.ok(cp >= 0 && co > cp && up > co && ud === up + 1, `${status}: 임시글 → 원고 → 이미지 → 글 채우기 순서`);
    const ph = d.calls[cp][1];
    assert.deepEqual(ph, { title: titleFor('kbl', query), slug, status: 'draft', content: PLACEHOLDER, categories: [7], tags: [100, 101, 102] });
    assert.equal(d.calls[ud][1], 900);
    const post = d.calls[ud][2];
    assert.deepEqual(Object.keys(post).sort(), ['content', 'featured_media', 'meta', 'status', 'title']);
    assert.equal(post.status, status);
    assert.equal(post.featured_media, 55);
    assert.equal(post.title, titleFor('kbl', query));
    assert.equal(post.meta.rank_math_description, DOC.meta_description);
    assert.equal(post.meta.rank_math_focus_keyword, query);
    const ld = JSON.parse(post.meta.bstv_review_jsonld);
    assert.equal(ld['@type'], 'SportsEvent');
    assert.doesNotMatch(post.content, /application\/ld\+json/);
    assert.match(post.content, /관련 &amp; 리뷰|관련 & 리뷰/);
    assert.equal(d.calls[up][3], `${BASE.home.short} 97 : 86 ${BASE.away.short} · 2026.10.22 · KBL`);
  }
  assert.deepEqual(named(d.calls, 'wp.ensureTags')[0][1], ['KBL', BASE.home.name, BASE.away.name]);
  assert.equal(named(d.calls, 'wp.ensureCategory').length, 1);
  /* 글 하나에 필요한 준비(카테고리·태그·관련 리뷰)를 마친 뒤에만 이미지를 올린다 — 업로드 뒤에는 updatePost 뿐 */
  const firstUp = d.calls.findIndex((c) => c[0] === 'wp.uploadImage');
  for (const n of ['wp.ensureCategory', 'wp.ensureTags', 'wp.relatedReviews']) {
    assert.ok(d.calls.findIndex((c) => c[0] === n) < firstUp, n);
  }
  const ups = d.calls.map((c, i) => [c[0], i]).filter(([n]) => n === 'wp.uploadImage').map(([, i]) => i);
  for (const i of ups) assert.equal(d.calls[i + 1][0], 'wp.updatePost');
  assert.deepEqual(named(d.calls, 'wp.relatedReviews')[0].slice(1), [[100, 101, 102], 900]);   // 임시글 자신은 뺀다
  /* 네이버 정식명이 facts 에 채워져 compose 로 넘어간다 */
  const f = named(d.calls, 'compose')[0][4];
  assert.equal(f.home.full, '서울 삼성 삼성 썬더스');
  assert.equal(f.away.full, '부산 KCC KCC');
  assert.equal(named(d.calls, 'compose')[0][2], named(d.calls, 'compose')[0][3]);
  assert.deepEqual(r.outcomes.map((o) => [o.status, o.postId]), [['publish', 900], ['draft', 900]]);
  assert.deepEqual(r.outcomes.map((o) => o.tokens), [30, 3]);
  assert.match(r.outcomes[1].reason, /answer/);
  assert.deepEqual(r.errors, []);
});

test('doc_null_is_error_placeholder_marked_failed_no_image', async () => {
  const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g] }, composeResult: () => ({ status: 'draft', doc: null, attempts: [{ pass: false, issues: [], usage: {} }] }) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.outcomes[0].status, 'error');
  assert.equal(r.outcomes[0].postId, 900);
  assert.equal(r.errors.length, 1);
  assert.equal(named(d.calls, 'wp.uploadImage').length, 0);
  assert.equal(named(d.calls, 'wp.createPost').length, 1);            // 임시글만
  const ups = named(d.calls, 'wp.updatePost');
  assert.equal(ups.length, 1);
  assert.equal(ups[0][1], 900);
  assert.deepEqual(Object.keys(ups[0][2]), ['content']);              // 상태는 draft 그대로
  assert.match(ups[0][2].content, /^<p>자동 작성 실패: .*JSON/);
});

/* 다음 회차: 임시글이 slug 를 잡고 있으므로 같은 경기를 다시 쓰지 않는다(원고 비용 0). */
test('failed_placeholder_blocks_recompose_next_run', async () => {
  const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g] }, wpFound: () => ({ id: 900, status: 'draft' }) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.outcomes[0].status, 'exists');
  assert.equal(named(d.calls, 'compose').length, 0);
});

test('render_failure_is_game_error_not_wp_breaker', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const bad = { ...DOC };
  Object.defineProperty(bad, 'verdict_html', { enumerable: true, get() { throw new Error('렌더 폭발'); } });
  const d = deps({
    games: { kbl: [g1, g2] },
    composeResult: (f) => ({ status: 'publish', doc: f.gameKey === g1.gameKey ? bad : DOC, attempts: [{ pass: true, issues: [], usage: {} }] }),
  });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'publish']);
  assert.match(r.outcomes[0].reason, /렌더 폭발/);
  assert.equal(r.errors.length, 1);
  const marked = named(d.calls, 'wp.updatePost')[0];
  assert.match(marked[2].content, /^<p>자동 작성 실패: .*렌더 폭발/);
  assert.equal(named(d.calls, 'wp.uploadImage').length, 1);          // 실패한 경기는 이미지를 올리지 않는다
});

test('draft_with_non_array_key_points_still_saved', async () => {
  const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g] }, composeResult: () => ({ status: 'draft', doc: { ...DOC, key_points: 'x' }, attempts: [{ pass: false, issues: [], usage: {} }] }) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.outcomes[0].status, 'draft');
  assert.deepEqual(r.errors, []);
});

/* TheSportsDB 에 같은 경기가 두 번 올라오면 둘 다 같은 네이버 검색어와 짝지어진다 — 같은 제목 글 두 개를 막는다. */
test('same_query_twice_in_run_is_skip', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g1, g2] }, entries: { kbl: [entryFor(g1), OTHER_ENTRY] } });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => [o.status, o.reason ?? null]), [['publish', null], ['skip', '같은 검색어 중복']]);
  assert.equal(named(d.calls, 'compose').length, 1);
  assert.equal(named(d.calls, 'wp.createPost').length, 1);
  assert.deepEqual(r.errors, []);
});

test('same_query_as_existing_post_is_skip', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g1, g2] }, entries: { kbl: [entryFor(g1)] },
    wpFound: (slug) => (slug === `match-review-${g1.gameKey.toLowerCase()}` ? { id: 5, status: 'publish' } : null) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['exists', 'skip']);
  assert.equal(r.outcomes[1].reason, '같은 검색어 중복');
  assert.equal(named(d.calls, 'compose').length, 0);
});

test('dry_same_query_twice_is_skip', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-run-'));
  try {
    const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
    const g2 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
    const d = deps({ games: { kbl: [g1, g2] }, entries: { kbl: [entryFor(g1)] } });
    const r = await runReview({ ...d, wp: null, only: 'kbl', dry: true, previewDir: dir });
    assert.deepEqual(r.outcomes.map((o) => o.status), ['publish', 'skip']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry_writes_preview_no_wp', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-run-'));
  try {
    const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
    const d = deps({ games: { kbl: [g] } });
    const r = await runReview({ ...d, only: 'kbl', dry: true, previewDir: dir });
    assert.equal(wpCalls(d.calls).length, 0);
    const html = await readFile(join(dir, `${g.gameKey}.html`), 'utf8');
    assert.match(html, /<title>KBL /);
    assert.match(html, /요약 설명/);
    assert.match(html, /bstv-review/);
    assert.ok((await stat(join(dir, `${g.gameKey}.jpg`))).size > 0);
    assert.equal(r.outcomes[0].status, 'publish');
    assert.deepEqual(r.errors, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry_without_wp_object_runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'review-run-'));
  try {
    const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
    const d = deps({ games: { kbl: [g] } });
    const r = await runReview({ ...d, wp: null, only: 'kbl', dry: true, previewDir: dir });
    assert.deepEqual(r.errors, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('one_league_failure_isolated', async () => {
  const k = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const w = game('wkbl', '2026-10-22', '청주 KB스타즈', '용인 삼성생명');
  const d = deps({ games: { kbl: [k], wkbl: [w] }, listThrows: { kbl: true } });
  const r = await runReview({ ...d });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /KBL/);
  assert.equal(r.outcomes.find((o) => o.gameKey === w.gameKey).status, 'publish');
});

test('one_game_failure_isolated', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({ games: { kbl: [g1, g2] } });
  d.image = async (f) => { if (f.gameKey === g1.gameKey) throw new Error('카드 글꼴에 없는 글자: 뷁'); return Buffer.from('J'); };
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'publish']);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /카드 글꼴/);
  assert.equal(named(d.calls, 'wp.createPost').length, 1);           // 카드 실패 경기는 임시글도 만들지 않는다
});

test('exit_code_only_on_errors', async () => {
  const now = new Date('2026-10-26T03:00:00Z');
  const a = game('kbl', '2026-10-25', '서울 삼성', '부산 KCC');   // draft
  const b = game('kbl', '2026-10-25', '서울 SK', '창원 LG');       // 짝 없음 → skip
  const c = game('kbl', '2026-10-23', '원주 DB', '수원 KT');       // 짝 없음 → giveup
  const d = deps({
    now, games: { kbl: [a, b, c] }, entries: { kbl: [entryFor(a)] },
    composeResult: () => ({ status: 'draft', doc: DOC, attempts: [{ pass: false, issues: [], usage: {} }] }),
  });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['draft', 'skip', 'giveup']);
  assert.equal(r.errors.length, 0);
});

test('summary_table_and_league_counts', () => {
  const md = summaryMarkdown({
    outcomes: [
      { league: 'kbl', gameKey: 'kbl-1', title: 'KBL a 경기 리뷰', status: 'publish', tokens: 30 },
      { league: 'vw', gameKey: 'vw-1', title: null, status: 'skip', reason: '짝 | 없음' },
    ],
    errors: ['KBL: 무엇'],
  });
  assert.match(md, /\| 리그 \| 경기 \| 결과 \| 사유 \| 토큰 \|/);
  assert.match(md, /짝 \\\| 없음/);
  assert.match(md, /토큰 합 30/);
  assert.match(md, /V리그 여자부: .*skip 1/);
  assert.match(md, /KBL: .*publish 1/);
  assert.match(md, /KBL: 무엇/);
});

test('wp_placeholder_failure_stops_run_before_any_compose', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const w = game('wkbl', '2026-10-22', '청주 KB스타즈', '용인 삼성생명');
  const d = deps({ games: { kbl: [g1, g2], wkbl: [w] } });
  d.wp.createPost = async (...a) => { d.calls.push(['wp.createPost', ...a]); throw new Error('WP POST /wp-json/wp/v2/posts 실패: HTTP 500'); };
  const r = await runReview({ ...d });
  assert.equal(named(d.calls, 'compose').length, 0);                 // AI 비용 전에 멈춘다
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'skip', 'skip']);
  assert.ok(r.outcomes.slice(1).every((o) => o.reason === 'WP 쓰기 실패로 중단'));
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /HTTP 500/);
});

test('wp_prepare_failure_uploads_no_image', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({ games: { kbl: [g1, g2] } });
  d.wp.ensureTags = async () => { throw new Error('WP GET /tags 실패: HTTP 503'); };
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'skip']);
  assert.equal(named(d.calls, 'wp.uploadImage').length, 0);
  assert.equal(named(d.calls, 'compose').length, 0);
});

test('wp_final_update_failure_stops_run', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({ games: { kbl: [g1, g2] } });
  d.wp.updatePost = async (...a) => { d.calls.push(['wp.updatePost', ...a]); throw new Error('WP POST /wp-json/wp/v2/posts/900 실패: HTTP 400'); };
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'skip']);
  assert.equal(r.outcomes[1].reason, 'WP 쓰기 실패로 중단');
  assert.equal(named(d.calls, 'compose').length, 1);
  assert.equal(r.outcomes[0].postId, 900);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /HTTP 400/);
});

test('max_posts_counts_across_leagues', async () => {
  const kblTeams = TEAMS;
  const kblGames = [];
  for (let i = 0; i < kblTeams.length && kblGames.length < 8; i++) {
    for (let j = i + 1; j < kblTeams.length && kblGames.length < 8; j++) kblGames.push(game('kbl', '2026-10-22', kblTeams[i], kblTeams[j]));
  }
  const W = ['청주 KB스타즈', 'BNK 썸', '용인 삼성생명', '부천 하나은행', '인천 신한은행', '우리은행'];
  const wkblGames = [];
  for (let i = 0; i < W.length && wkblGames.length < 6; i++) {
    for (let j = i + 1; j < W.length && wkblGames.length < 6; j++) wkblGames.push(game('wkbl', '2026-10-22', W[i], W[j]));
  }
  const d = deps({ games: { kbl: kblGames, wkbl: wkblGames } });
  const r = await runReview({ ...d });
  assert.equal(named(d.calls, 'compose').length, 12);
  const wk = r.outcomes.filter((o) => o.league === 'wkbl');
  assert.deepEqual(wk.map((o) => o.status), ['publish', 'publish', 'publish', 'publish', 'skip', 'skip']);
  assert.deepEqual(r.errors, []);
});

test('naver_non_array_is_league_error', async () => {
  const k = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [k] } });
  d.naver = async () => null;
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /KBL/);
  assert.equal(named(d.calls, 'compose').length, 0);
});

test('cli_args_missing_value_throws', () => {
  assert.deepEqual(parseArgs(['--dry', '--league', 'kbl', '--since', '2026-10-22']), { dry: true, only: 'kbl', since: '2026-10-22' });
  assert.throws(() => parseArgs(['--league']), /--league/);
  assert.throws(() => parseArgs(['--league', '--dry']), /--league/);
  assert.throws(() => parseArgs(['--since']), /--since/);
  assert.throws(() => parseArgs(['--league', 'xx']), /--league/);
  for (const proto of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) assert.throws(() => parseArgs(['--league', proto]), /--league/);
  assert.throws(() => parseArgs(['--since', '10-22']), /--since/);
});

/* AI 호출이 재시도 끝에 던져도 임시글에 실패를 적는다(워드프레스 탓이 아니므로 회차는 계속). */
test('compose_throw_marks_placeholder_failed_not_breaker', async () => {
  const g1 = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const g2 = game('kbl', '2026-10-22', '서울 SK', '창원 LG');
  const d = deps({ games: { kbl: [g1, g2] } });
  const base = d.compose;
  d.compose = async (f, ...a) => { if (f.gameKey === g1.gameKey) throw new Error('Anthropic 호출 시간 초과 300000ms'); return base(f, ...a); };
  const r = await runReview({ ...d, only: 'kbl' });
  assert.deepEqual(r.outcomes.map((o) => o.status), ['error', 'publish']);
  assert.equal(r.outcomes[0].postId, 900);
  const marked = named(d.calls, 'wp.updatePost')[0];
  assert.deepEqual(Object.keys(marked[2]), ['content']);
  assert.match(marked[2].content, /^<p>자동 작성 실패: .*시간 초과/);
  assert.match(r.errors[0], /시간 초과/);
});
