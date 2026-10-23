import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReview, summaryMarkdown } from '../tools/review/run.mjs';
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
  };
  const image = async (facts) => { calls.push(['image', facts.gameKey]); return Buffer.from('JPEG'); };
  return { calls, now, sources, naver, compose, wp, image, log: () => {} };
}
const named = (calls, n) => calls.filter((c) => c[0] === n);
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
    const up = d.calls.findIndex((c) => c[0] === 'wp.uploadImage' && c[2] === `${slug}.jpg`);
    const cp = d.calls.findIndex((c) => c[0] === 'wp.createPost' && c[1].slug === slug);
    assert.ok(up >= 0 && cp > up, `${status}: 이미지 → 글 순서`);
    const post = d.calls[cp][1];
    assert.equal(post.status, status);
    assert.equal(post.featured_media, 55);
    const query = entryFor(g).query;
    assert.equal(post.title, titleFor('kbl', query));
    assert.deepEqual(post.categories, [7]);
    assert.deepEqual(post.tags, [100, 101, 102]);
    assert.equal(post.meta.rank_math_description, DOC.meta_description);
    assert.equal(post.meta.rank_math_focus_keyword, query);
    const ld = JSON.parse(post.meta.bstv_review_jsonld);
    assert.equal(ld['@type'], 'SportsEvent');
    assert.doesNotMatch(post.content, /application\/ld\+json/);
    assert.match(post.content, /관련 &amp; 리뷰|관련 & 리뷰/);
    assert.equal(d.calls[up][3], `${BASE.home.short} 97 : 86 ${BASE.away.short} · 2026.10.22 · KBL`);
  }
  assert.deepEqual(named(d.calls, 'wp.ensureTags')[0][1], ['KBL', BASE.home.name, BASE.away.name]);
  assert.ok(named(d.calls, 'wp.ensureCategory').length <= 1);
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

test('doc_null_is_error_no_post_no_image', async () => {
  const g = game('kbl', '2026-10-22', '서울 삼성', '부산 KCC');
  const d = deps({ games: { kbl: [g] }, composeResult: () => ({ status: 'draft', doc: null, attempts: [{ pass: false, issues: [], usage: {} }] }) });
  const r = await runReview({ ...d, only: 'kbl' });
  assert.equal(r.outcomes[0].status, 'error');
  assert.equal(r.errors.length, 1);
  assert.equal(named(d.calls, 'wp.uploadImage').length, 0);
  assert.equal(named(d.calls, 'wp.createPost').length, 0);
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
