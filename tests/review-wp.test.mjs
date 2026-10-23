import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWp } from '../tools/review/wp.mjs';

const PASS = 'abcd EFGH 1234 secret';
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

// routes: [(method, url) => response | undefined]
function fake(routes) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    const call = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body, signal: opts.signal };
    calls.push(call);
    for (const r of routes) { const out = r(call); if (out) return out; }
    return res(404, { code: 'no_route' });
  };
  return { calls, wp: createWp({ url: 'https://example.test/', user: 'bot', appPassword: PASS, fetchImpl }) };
}

test('basic_auth_header', async () => {
  const { calls, wp } = fake([() => res(200, [])]);
  await wp.findBySlug('x');
  const want = 'Basic ' + Buffer.from(`bot:${PASS}`).toString('base64');
  assert.equal(calls[0].headers.Authorization, want);
  assert.ok(calls[0].signal, 'timeout signal attached');
});

test('existing_draft_slug_blocks_duplicate', async () => {
  const { calls, wp } = fake([(c) => c.url.includes('/posts?') && res(200, [{ id: 7, status: 'draft' }])]);
  assert.deepEqual(await wp.findBySlug('kbo-a'), { id: 7, status: 'draft' });
  assert.match(calls[0].url, /^https:\/\/example\.test\/wp-json\/wp\/v2\/posts\?/);
  /* status=any 는 휴지통을 빼므로 상태를 모두 적는다 — 휴지통으로 내린 리뷰가 다음 회차에 다시 발행되지 않게 */
  assert.deepEqual(new URL(calls[0].url).searchParams.get('status').split(',').sort(),
    ['draft', 'future', 'pending', 'private', 'publish', 'trash']);
  assert.match(calls[0].url, /context=edit/);
  assert.match(calls[0].url, /slug=kbo-a/);
});

test('find_by_slug_none_is_null', async () => {
  const { wp } = fake([() => res(200, [])]);
  assert.equal(await wp.findBySlug('nope'), null);
});

test('create_post_sends_meta', async () => {
  const { calls, wp } = fake([(c) => c.method === 'POST' && res(201, { id: 55, link: 'https://example.test/p/' })]);
  const meta = { rank_math_description: 'd', rank_math_focus_keyword: 'k', bstv_review_jsonld: '{}' };
  const out = await wp.createPost({ title: 't', slug: 's', content: '<p>x</p>', status: 'draft', categories: [3], tags: [1, 2], featured_media: 9, meta });
  assert.deepEqual(out, { id: 55, link: 'https://example.test/p/' });
  assert.match(calls[0].url, /\/wp-json\/wp\/v2\/posts$/);
  const sent = JSON.parse(calls[0].body);
  assert.deepEqual(sent.meta, meta);
  assert.equal(sent.featured_media, 9);
  assert.deepEqual(sent.tags, [1, 2]);
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
});

test('ensure_category_creates_once', async () => {
  const have = fake([(c) => c.url.includes('/categories?') && res(200, [{ id: 4, slug: 'match-review' }])]);
  assert.equal(await have.wp.ensureCategory(), 4);
  assert.equal(have.calls.filter((c) => c.method === 'POST').length, 0);

  const none = fake([
    (c) => c.method === 'GET' && c.url.includes('/categories?') && res(200, []),
    (c) => c.method === 'POST' && res(201, { id: 8 }),
  ]);
  assert.equal(await none.wp.ensureCategory(), 8);
  assert.equal(await none.wp.ensureCategory(), 8);
  const posts = none.calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].body), { name: '경기 리뷰', slug: 'match-review' });
});

test('ensure_tags_exact_match_and_create', async () => {
  const { calls, wp } = fake([
    (c) => c.method === 'GET' && c.url.includes('search=' + encodeURIComponent('LG')) && res(200, [{ id: 1, name: 'LG트윈스' }, { id: 2, name: 'LG' }]),
    (c) => c.method === 'GET' && c.url.includes('/tags?') && res(200, [{ id: 3, name: 'KIA타이거즈' }]),
    (c) => c.method === 'POST' && res(201, { id: 9 }),
  ]);
  assert.deepEqual(await wp.ensureTags(['LG', 'KIA']), [2, 9]);
  const created = calls.filter((c) => c.method === 'POST');
  assert.equal(created.length, 1);
  assert.deepEqual(JSON.parse(created[0].body), { name: 'KIA' });
});

test('upload_image_posts_jpeg_then_sets_alt', async () => {
  const { calls, wp } = fake([
    (c) => c.method === 'POST' && c.url.endsWith('/media') && res(201, { id: 21 }),
    (c) => c.method === 'POST' && c.url.endsWith('/media/21') && res(200, { id: 21 }),
  ]);
  const id = await wp.uploadImage(Buffer.from([1, 2, 3]), 'kbo-a.jpg', '대체 텍스트');
  assert.equal(id, 21);
  assert.equal(calls[0].headers['Content-Type'], 'image/jpeg');
  assert.equal(calls[0].headers['Content-Disposition'], 'attachment; filename="kbo-a.jpg"');
  assert.deepEqual(JSON.parse(calls[1].body), { alt_text: '대체 텍스트' });
});

test('related_reviews_decodes_entities_and_filters', async () => {
  const { calls, wp } = fake([
    (c) => c.url.includes('/categories?') && res(200, [{ id: 4, slug: 'match-review' }]),
    (c) => c.url.includes('/posts?') && res(200, [
      { id: 1, status: 'publish', link: 'https://example.test/a/', title: { rendered: 'LG &#8211; KIA &amp; 두산' } },
      { id: 2, status: 'publish', link: 'https://example.test/b/', title: { rendered: 'B' } },
      { id: 3, status: 'draft', link: 'https://example.test/c/', title: { rendered: 'C' } },
      { id: 4, status: 'publish', link: 'https://example.test/d/', title: { rendered: 'D' } },
    ]),
  ]);
  const out = await wp.relatedReviews([5, 6], 2, 2);
  assert.deepEqual(out, [{ url: 'https://example.test/a/', title: 'LG – KIA & 두산' }, { url: 'https://example.test/d/', title: 'D' }]);
  const q = calls.find((c) => c.url.includes('/posts?')).url;
  assert.match(q, /tags=5%2C6|tags=5,6/);
  assert.match(q, /status=publish/);
  assert.match(q, /categories=4/);
});

test('errors_hide_credentials', async () => {
  const { wp } = fake([() => res(401, { message: `bad ${PASS}` })]);
  await assert.rejects(() => wp.findBySlug('secret-slug'), (e) => {
    assert.match(e.message, /401/);
    assert.match(e.message, /GET/);
    assert.ok(!e.message.includes(PASS) && !e.message.includes('abcd'));
    assert.ok(!e.message.includes('?'), 'no query string');
    return true;
  });
});

test('timeout_aborts', async () => {
  const wp = createWp({ url: 'https://example.test', user: 'u', appPassword: 'p', timeoutMs: 20,
    fetchImpl: (url, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))) });
  await assert.rejects(() => wp.findBySlug('x'), /GET \/wp-json\/wp\/v2\/posts.*(timeout|aborted)/);
});

const mk = (fetchImpl, extra = {}) => createWp({ url: 'https://example.test', user: 'u', appPassword: PASS, fetchImpl, ...extra });

test('timeout_covers_body_read', async () => {
  const wp = mk(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }), { timeoutMs: 30 });
  await assert.rejects(() => wp.findBySlug('x'), (e) => {
    assert.match(e.message, /^WP GET \/wp-json\/wp\/v2\/posts 실패: timeout/);
    assert.ok(!e.message.includes(PASS));
    return true;
  });
});

test('malformed_json_gives_clean_message', async () => {
  const wp = mk(async () => ({ ok: true, status: 200, json: async () => JSON.parse(`{"secret":${PASS}`) }));
  await assert.rejects(() => wp.findBySlug('x'), (e) => {
    assert.equal(e.message, 'WP GET /wp-json/wp/v2/posts 실패: invalid JSON (HTTP 200)');
    return true;
  });
});

test('network_error_message_has_no_password', async () => {
  const wp = mk(async () => { throw Object.assign(new Error(`connect failed for bot:${PASS}`), { code: 'ECONNRESET' }); });
  await assert.rejects(() => wp.findBySlug('x'), (e) => {
    assert.equal(e.message, 'WP GET /wp-json/wp/v2/posts 실패: ECONNRESET');
    assert.ok(!e.message.includes(PASS));
    return true;
  });
});

test('related_reviews_empty_tags_no_request', async () => {
  const { calls, wp } = fake([() => res(200, [])]);
  assert.deepEqual(await wp.relatedReviews([], 1), []);
  assert.equal(calls.length, 0);
});

test('related_reviews_exclude_param_and_no_category', async () => {
  const { calls, wp } = fake([
    (c) => c.url.includes('/categories?') && res(200, []),
    (c) => c.url.includes('/posts?') && res(200, [{ id: 1, status: 'publish', link: 'https://example.test/a/', title: { rendered: 'A' } }]),
  ]);
  assert.equal((await wp.relatedReviews([5], 9, 2)).length, 1);
  const q = calls.find((c) => c.url.includes('/posts?')).url;
  assert.match(q, /exclude=9/);
  assert.doesNotMatch(q, /categories=/);
});

test('upload_image_rejects_bad_filename', async () => {
  const { calls, wp } = fake([() => res(201, { id: 1 })]);
  for (const bad of ['a"b.jpg', 'a b.jpg', '../x.jpg', '경기.jpg', 'a\r\nX: y.jpg', '']) {
    await assert.rejects(() => wp.uploadImage(Buffer.from([1]), bad, 'alt'), /filename/);
  }
  assert.equal(calls.length, 0);
});

test('ensure_tags_case_insensitive_match', async () => {
  const { calls, wp } = fake([(c) => c.url.includes('/tags?') && c.method === 'GET' && res(200, [{ id: 3, name: 'Lg' }])]);
  assert.deepEqual(await wp.ensureTags(['LG']), [3]);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('rejects_non_https_base_url', () => {
  assert.throws(() => createWp({ url: 'http://example.test', user: 'u', appPassword: 'p' }), /https/);
});

test('trashed_slug_blocks_duplicate', async () => {
  const { wp } = fake([(c) => c.url.includes('/posts?') && new URL(c.url).searchParams.get('status').split(',').includes('trash') && res(200, [{ id: 8, status: 'trash' }])]);
  assert.deepEqual(await wp.findBySlug('kbo-b'), { id: 8, status: 'trash' });
});

test('update_post_posts_fields_to_id', async () => {
  const { calls, wp } = fake([(c) => c.method === 'POST' && /\/posts\/77$/.test(c.url) && res(200, { id: 77, link: 'https://example.test/p77/' })]);
  const fields = { content: '<p>y</p>', status: 'publish', featured_media: 9, meta: { rank_math_description: 'd' }, title: 't' };
  assert.deepEqual(await wp.updatePost(77, fields), { id: 77, link: 'https://example.test/p77/' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/example\.test\/wp-json\/wp\/v2\/posts\/77$/);
  assert.deepEqual(JSON.parse(calls[0].body), fields);
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
});

test('update_post_rejects_bad_id_and_http_error', async () => {
  const { calls, wp } = fake([(c) => c.method === 'POST' && res(400, { code: 'rest_invalid_param' })]);
  for (const id of [0, -1, 1.5, '7', null, undefined]) await assert.rejects(() => wp.updatePost(id, { content: 'x' }), /id/);
  assert.equal(calls.length, 0);
  await assert.rejects(() => wp.updatePost(7, { content: 'x' }), /POST \/wp-json\/wp\/v2\/posts\/7 실패: HTTP 400/);
});
