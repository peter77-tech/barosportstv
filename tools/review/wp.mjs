// 워드프레스 REST 클라이언트. 자격증명은 헤더에만 쓰고 오류·로그에 넣지 않는다.
const API = '/wp-json/wp/v2';
const ALL_STATUSES = 'publish,future,draft,pending,private,trash';
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”' };

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, g) => {
    if (g[0] === '#') {
      const cp = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      try { return String.fromCodePoint(cp); } catch { return m; }
    }
    return ENTITIES[g.toLowerCase()] ?? m;
  });
}

export function createWp({ url, user, appPassword, fetchImpl = fetch, timeoutMs = 30000 }) {
  if (!/^https:\/\//i.test(String(url))) throw new Error('WP URL 은 https 여야 한다');
  const base = String(url).replace(/\/+$/, '');
  const auth = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
  let categoryId = null;

  async function call(method, path, { query, json, body, headers = {} } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const h = { Authorization: auth, ...headers };
    let payload = body;
    if (json !== undefined) { payload = JSON.stringify(json); h['Content-Type'] = 'application/json'; }
    const ac = new AbortController();
    let timer;
    const timedOut = new Promise((_, rej) => { timer = setTimeout(() => { ac.abort(); rej(new Error('timeout')); }, timeoutMs); });
    timedOut.catch(() => {});
    const fail = (why) => new Error(`WP ${method} ${path} 실패: ${why}`);
    try {
      let r;
      try {
        r = await Promise.race([fetchImpl(base + path + qs, { method, headers: h, body: payload, signal: ac.signal }), timedOut]);
      } catch (e) {
        throw fail(ac.signal.aborted ? `timeout ${timeoutMs}ms` : (e.code || e.name || 'network error'));
      }
      if (!r.ok) throw fail(`HTTP ${r.status}`);
      try {
        return await Promise.race([r.json(), timedOut]);
      } catch {
        throw fail(ac.signal.aborted ? `timeout ${timeoutMs}ms` : `invalid JSON (HTTP ${r.status})`);
      }
    } finally { clearTimeout(timer); }
  }

  async function findCategory(slug) {
    const list = await call('GET', `${API}/categories`, { query: { slug } });
    return list.find((c) => c.slug === slug)?.id ?? null;
  }

  async function ensureCategory(name = '경기 리뷰', slug = 'match-review') {
    if (categoryId && slug === 'match-review') return categoryId;
    let id = await findCategory(slug);
    if (id == null) id = (await call('POST', `${API}/categories`, { json: { name, slug } })).id;
    if (slug === 'match-review') categoryId = id;
    return id;
  }

  async function ensureTags(names) {
    const ids = [];
    for (const name of names) {
      const list = await call('GET', `${API}/tags`, { query: { search: name, per_page: '100' } });
      const hit = list.find((t) => decodeEntities(t.name).toLowerCase() === name.toLowerCase());
      ids.push(hit ? hit.id : (await call('POST', `${API}/tags`, { json: { name } })).id);
    }
    return ids;
  }

  /* status=any 는 휴지통(trash)을 빼므로 상태를 모두 적는다. 워드프레스는 휴지통에 넣은 글의 slug 를 <slug>__trashed 로
     바꾸므로 두 slug 를 함께 묻는다 — 어느 쪽이 맞든 「있음」이라 휴지통으로 내린 리뷰를 다시 만들지 않는다. */
  async function findBySlug(slug) {
    const list = await call('GET', `${API}/posts`, { query: { slug: `${slug},${slug}__trashed`, status: ALL_STATUSES, context: 'edit' } });
    return list.length ? { id: list[0].id, status: list[0].status } : null;
  }

  async function relatedReviews(tagIds, excludeId, limit = 2) {
    if (!tagIds.length) return [];
    const query = { tags: tagIds.join(','), status: 'publish', per_page: String(limit + 3), orderby: 'date', order: 'desc' };
    const cat = categoryId ?? await findCategory('match-review');
    if (cat != null) query.categories = String(cat);
    if (excludeId != null) query.exclude = String(excludeId);
    const posts = await call('GET', `${API}/posts`, { query });
    return posts
      .filter((p) => p.status === 'publish' && p.id !== excludeId)
      .slice(0, limit)
      .map((p) => ({ url: p.link, title: decodeEntities(p.title?.rendered) }));
  }

  async function uploadImage(buf, filename, alt) {
    if (!/^[\w.-]+$/.test(filename)) throw new Error('WP uploadImage: filename 은 [A-Za-z0-9_.-] 만 허용');
    const m = await call('POST', `${API}/media`, {
      body: buf,
      headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${filename}"` },
    });
    await call('POST', `${API}/media/${m.id}`, { json: { alt_text: alt } });
    return m.id;
  }

  async function createPost({ title, slug, content, status, categories, tags, featured_media, meta }) {
    const p = await call('POST', `${API}/posts`, { json: { title, slug, content, status, categories, tags, featured_media, meta } });
    return { id: p.id, link: p.link };
  }

  /** 있는 글의 필드만 바꾼다 (POST /posts/{id}). */
  async function updatePost(id, fields) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`WP updatePost: id 는 양의 정수여야 한다: ${id}`);
    const p = await call('POST', `${API}/posts/${id}`, { json: fields });
    return { id: p.id, link: p.link };
  }

  /** 글을 휴지통을 거치지 않고 영구 삭제한다 (DELETE /posts/{id}?force=true) — slug 가 풀려 다음 회차가 다시 쓸 수 있다. */
  async function deletePost(id) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`WP deletePost: id 는 양의 정수여야 한다: ${id}`);
    await call('DELETE', `${API}/posts/${id}`, { query: { force: 'true' } });
  }

  return { ensureCategory, ensureTags, findBySlug, relatedReviews, uploadImage, createPost, updatePost, deletePost };
}
