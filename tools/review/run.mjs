/* 경기 리뷰 실행기. 리그별로 끝난 경기 → 네이버 검색어 짝 → 기록 → AI 원고 → 대표 이미지 → 워드프레스 글.
   runReview 는 의존성을 모두 주입받는다(테스트는 가짜). 환경변수는 맨 아래 CLI 층에서만 읽는다.
   한 경기·한 리그의 실패는 그 경기·리그만 오류로 남기고 나머지는 계속한다. errors 가 하나라도 있으면 종료 코드 1. */
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LEAGUES, START_DATE, MAX_POSTS_PER_RUN, titleFor, reviewSlug, kstToday, windowDays } from './config.mjs';
import { pairQuery, splitFullNames } from './naver.mjs';
import { renderPost } from './render.mjs';
import { internalLinks, sportsEventJsonLd } from './links.mjs';
import { cardText } from './image.mjs';

const NAVER_TIMEOUT_MS = 30000;
const WP_BROKEN = 'WP 쓰기 실패로 중단';
const DUPLICATE_QUERY = '같은 검색어 중복';
/* 원고보다 먼저 만드는 임시글(draft) 본문. 실패하면 「자동 작성 실패: …」 로 바꾼다 — 어느 쪽이든 slug 를 잡고 있어
   다음 회차가 「있음」으로 보고 같은 경기를 다시 쓰지(AI 비용) 않는다. */
const PLACEHOLDER_HTML = '<p>자동 작성 중 — 실패하면 이 임시글이 남는다.</p>';
const failedHtml = (why) => `<p>자동 작성 실패: ${esc(why.length > 300 ? `${why.slice(0, 299)}…` : why)}</p>`;
const DAY_MS = 24 * 60 * 60 * 1000;

const prevDay = (key) => new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
const message = (e) => (e && e.message) || String(e);

function withTimeout(promise, ms, what) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${what} 시간 초과 ${ms}ms`)), ms); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

function tokensOf(attempts) {
  let n = 0;
  for (const a of attempts ?? []) for (const [k, v] of Object.entries(a.usage ?? {})) if (k.endsWith('tokens') && typeof v === 'number') n += v;
  return n;
}

function draftReason(attempts) {
  const issues = attempts?.at(-1)?.issues ?? [];
  const text = issues.map((i) => `${i.field}: ${i.problem}`).join('; ') || '검토 미통과';
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* dry 미리보기: renderPost 결과를 제목·메타 설명과 함께 홀로 열리는 HTML 로 감싼다. JSON-LD 는 글 메타로만 가므로 확인용 <pre> 로만 보인다. */
function previewPage({ title, status, doc, content, facts, gameKey, alt }) {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(doc.meta_description)}">
<style>body{max-width:760px;margin:2rem auto;padding:0 16px;font-family:system-ui,sans-serif;line-height:1.6}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px;text-align:center}img{max-width:100%}
.preview-meta{color:#555;font-size:.9em;border-bottom:1px solid #ddd;padding-bottom:1em}pre{white-space:pre-wrap;font-size:.8em;background:#f4f4f4;padding:8px}</style>
</head><body>
<div class="preview-meta"><p>미리보기(dry) · 상태 <strong>${esc(status)}</strong> · ${esc(gameKey)}</p>
<p>메타 설명: ${esc(doc.meta_description)}</p></div>
<h1>${esc(title)}</h1>
<img src="${esc(gameKey)}.jpg" alt="${esc(alt)}">
${content}
<details><summary>bstv_review_jsonld</summary><pre>${esc(JSON.stringify(sportsEventJsonLd(facts), null, 2))}</pre></details>
</body></html>
`;
}

/**
 * @param {object} o
 * @param {Date} o.now
 * @param {boolean} [o.dry]           true 면 워드프레스를 전혀 부르지 않고 previewDir 에 .html·.jpg 를 쓴다
 * @param {string|null} [o.only]      LeagueKey 하나만
 * @param {string} [o.since]          'YYYY-MM-DD' — 첫 실행 따라잡기 (windowDays)
 * @param {Record<string,{listFinished:(days:string[])=>Promise<object[]>, fetchFacts:(g:object)=>Promise<object>}>} o.sources
 * @param {(league:string)=>Promise<{query:string,date:string,text:string}[]>} o.naver
 * @param {(facts:object, title:string, expectedTitle:string)=>Promise<{status:string,doc:object|null,attempts:object[]}>} o.compose
 * @param {object|null} o.wp          createWp() 결과 (dry 에서는 쓰지 않는다)
 * @param {(facts:object)=>Promise<Buffer>} o.image
 * @returns {Promise<{ outcomes: object[], errors: string[] }>}
 */
export async function runReview({
  now = new Date(), dry = false, only = null, since, sources, naver, compose, wp, image,
  log = () => {}, previewDir = 'out/review-preview', naverTimeoutMs = NAVER_TIMEOUT_MS,
}) {
  const outcomes = [];
  const errors = [];
  const days = windowDays(now, since);
  const yesterday = prevDay(kstToday(now));
  const leagues = only ? [only] : Object.keys(LEAGUES);
  let composed = 0;
  let categoryId = null;
  let wpBroken = false;   // 워드프레스 쓰기가 한 번 실패하면 이번 회차는 더 쓰지 않는다(같은 실패에 AI 비용·고아 미디어를 쌓지 않게)
  const usedTitles = new Set();   // 이번 회차에 짝지은 제목(리그 + 네이버 검색어). 같은 경기가 원본에 두 번 오면 둘째는 건너뛴다

  const record = (o) => {
    outcomes.push(o);
    log(`${LEAGUES[o.league].titleName} ${o.gameKey} → ${o.status}${o.reason ? ` (${o.reason})` : ''}`);
  };

  /* 임시글을 「자동 작성 실패」로 바꾼다(draft 그대로). 그 쓰기마저 실패하면 워드프레스가 아픈 것이므로 회차를 멈춘다. */
  async function markFailed(postId, why) {
    try {
      await wp.updatePost(postId, { content: failedHtml(why) });
      return why;
    } catch (e) {
      wpBroken = true;
      return `${why} — 임시글 #${postId} 에 실패 표시도 못 했다: ${message(e)}`;
    }
  }

  async function reviewGame(league, game, entries, src) {
    const titleName = LEAGUES[league].titleName;
    const slug = reviewSlug(game.gameKey);
    const out = { league, gameKey: game.gameKey, title: null };
    if (wpBroken) return { ...out, status: 'skip', reason: WP_BROKEN };
    if (composed >= MAX_POSTS_PER_RUN) return { ...out, status: 'skip', reason: `회차 상한 ${MAX_POSTS_PER_RUN}편 — 다음 회차에` };
    try {
      const entry = pairQuery(game, entries);
      const title = entry ? titleFor(league, entry.query) : null;
      if (!dry) {
        const found = await wp.findBySlug(slug);
        if (found) {
          if (title) usedTitles.add(title);   // 이미 있는 글의 제목도 이번 회차에서 다시 쓰지 않는다
          return { ...out, status: 'exists', reason: `이미 있음 (${found.status})`, postId: found.id };
        }
      }
      if (!entry) {
        return game.date < yesterday
          ? { ...out, status: 'giveup', reason: '네이버 검색어 짝 없음 — 포기' }
          : { ...out, status: 'skip', reason: '네이버 검색어 짝 없음 — 다음 회차에 다시' };
      }
      if (usedTitles.has(title)) return { ...out, status: 'skip', reason: DUPLICATE_QUERY };
      usedTitles.add(title);
      out.title = title;
      const raw = await src.fetchFacts(game);
      const full = splitFullNames(entry, game);
      const facts = { ...raw, home: { ...raw.home, full: full.home }, away: { ...raw.away, full: full.away } };
      /* 대표 이미지를 원고보다 먼저 만든다 — 글꼴에 없는 글자 같은 실패로 AI 비용을 버리지 않도록. */
      const card = await image(facts);
      const alt = cardText(facts).alt;

      if (dry) {
        composed += 1;
        const r = await compose(facts, out.title, out.title);
        out.tokens = tokensOf(r.attempts);
        if (!r.doc) throw new Error('AI 원고를 JSON 으로 한 번도 받지 못했다 — 글을 만들지 않는다');
        const status = r.status === 'publish' ? 'publish' : 'draft';
        if (status === 'draft') out.reason = draftReason(r.attempts);
        const content = renderPost(facts, r.doc, internalLinks(facts, []));
        await mkdir(previewDir, { recursive: true });
        await writeFile(join(previewDir, `${game.gameKey}.jpg`), card);
        await writeFile(join(previewDir, `${game.gameKey}.html`),
          previewPage({ title: out.title, status, doc: r.doc, content, facts, gameKey: game.gameKey, alt }));
        return { ...out, status };
      }

      /* 원고(AI 비용)보다 먼저 slug 를 임시글로 잡는다. 여기서 워드프레스 쓰기가 실패하면 AI 를 부르기 전에 회차를 멈춘다. */
      let tags;
      try {
        if (categoryId == null) categoryId = await wp.ensureCategory();
        tags = await wp.ensureTags([titleName, facts.home.name, facts.away.name]);
        const placeholder = await wp.createPost({
          title: out.title, slug, status: 'draft', content: PLACEHOLDER_HTML, categories: [categoryId], tags,
        });
        out.postId = placeholder.id;
      } catch (e) {
        wpBroken = true;
        throw e;
      }

      composed += 1;
      let r;
      try {
        r = await compose(facts, out.title, out.title);
      } catch (e) {
        throw new Error(await markFailed(out.postId, `AI 원고 호출 실패: ${message(e)}`));
      }
      out.tokens = tokensOf(r.attempts);
      if (!r.doc) throw new Error(await markFailed(out.postId, 'AI 원고를 JSON 으로 한 번도 받지 못했다 — 글을 만들지 않는다'));
      const status = r.status === 'publish' ? 'publish' : 'draft';
      if (status === 'draft') out.reason = draftReason(r.attempts);

      let related;
      try {
        related = await wp.relatedReviews(tags, out.postId);
      } catch (e) {
        wpBroken = true;
        throw new Error(await markFailed(out.postId, `관련 리뷰 읽기 실패: ${message(e)}`));
      }
      /* 그리기 실패는 이 경기만의 오류다(워드프레스 탓이 아니므로 회차를 멈추지 않는다). */
      let content;
      try {
        content = renderPost(facts, r.doc, internalLinks(facts, related));
      } catch (e) {
        throw new Error(await markFailed(out.postId, `본문 그리기 실패: ${message(e)}`));
      }

      /* 이미지를 올린 뒤에는 updatePost 하나뿐이라 고아 미디어가 생길 틈이 좁다. */
      try {
        const mediaId = await wp.uploadImage(card, `${slug}.jpg`, alt);
        await wp.updatePost(out.postId, {
          content, status, featured_media: mediaId, title: out.title,
          meta: {
            rank_math_description: r.doc.meta_description,
            rank_math_focus_keyword: entry.query,
            bstv_review_jsonld: JSON.stringify(sportsEventJsonLd(facts)),
          },
        });
      } catch (e) {
        wpBroken = true;
        throw new Error(await markFailed(out.postId, message(e)));
      }
      return { ...out, status };
    } catch (e) {
      errors.push(`${titleName} ${game.gameKey}: ${message(e)}`);
      return { ...out, status: 'error', reason: message(e) };
    }
  }

  for (const league of leagues) {
    const cfg = LEAGUES[league];
    if (!cfg) { errors.push(`알 수 없는 리그: ${league}`); continue; }
    const src = sources[league];
    if (!src) { errors.push(`${cfg.titleName}: 수집기가 없다`); continue; }

    let games;
    try {
      games = (await src.listFinished(days)).filter((g) => g.date >= START_DATE);
    } catch (e) {
      errors.push(`${cfg.titleName}: 끝난 경기 목록 실패 — ${message(e)}`);
      continue;
    }
    log(`${cfg.titleName}: 끝난 경기 ${games.length}개 (${days[0] ?? '-'} ~ ${days.at(-1) ?? '-'})`);
    if (!games.length) continue;

    let entries;
    try {
      entries = await withTimeout(Promise.resolve().then(() => naver(league)), naverTimeoutMs, '네이버');
      if (!Array.isArray(entries) || !entries.length) {
        errors.push(`${cfg.titleName}: 네이버 일정 카드에서 검색어를 0개 뽑았다 — 페이지 구조가 바뀌었는지 확인`);
        for (const g of games) record({ league, gameKey: g.gameKey, title: null, status: 'error', reason: '네이버 검색어 0개' });
        continue;
      }
    } catch (e) {
      errors.push(`${cfg.titleName}: 네이버 검색어 가져오기 실패 — ${message(e)}`);
      continue;
    }

    for (const game of games) record(await reviewGame(league, game, entries, src));
  }

  return { outcomes, errors };
}

const STATUSES = ['publish', 'draft', 'exists', 'skip', 'giveup', 'error'];
const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** GITHUB_STEP_SUMMARY 용 마크다운: 경기 표 + 리그별 건수 + 오류 목록. */
export function summaryMarkdown({ outcomes, errors, dry = false }) {
  const lines = [`## 경기 리뷰 실행${dry ? ' (dry)' : ''}`, ''];
  const total = outcomes.reduce((n, o) => n + (o.tokens ?? 0), 0);
  lines.push('| 리그 | 경기 | 결과 | 사유 | 토큰 |', '|---|---|---|---|---|');
  for (const o of outcomes) {
    lines.push(`| ${cell(LEAGUES[o.league]?.titleName ?? o.league)} | ${cell(o.title ?? o.gameKey)} | ${cell(o.status)}${o.postId ? ` #${o.postId}` : ''} | ${cell(o.reason)} | ${o.tokens ?? ''} |`);
  }
  lines.push('', `토큰 합 ${total}`, '', '### 리그별');
  for (const lg of Object.keys(LEAGUES)) {
    const mine = outcomes.filter((o) => o.league === lg);
    if (!mine.length) continue;
    const counts = STATUSES.map((s) => [s, mine.filter((o) => o.status === s).length]).filter(([, n]) => n).map(([s, n]) => `${s} ${n}`);
    lines.push(`- ${LEAGUES[lg].titleName}: ${counts.join(' · ')}`);
  }
  if (errors.length) lines.push('', '### 오류', ...errors.map((e) => `- ${e}`));
  return lines.join('\n') + '\n';
}

/* ───── CLI ───── */

export function parseArgs(argv) {
  const opts = { dry: false, only: null, since: undefined };
  const value = (i, flag) => {
    const v = argv[i];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} 에 값이 없다`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') opts.dry = true;
    else if (a === '--league') opts.only = value(++i, '--league');
    else if (a === '--since') opts.since = value(++i, '--since');
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (opts.only != null && !Object.hasOwn(LEAGUES, opts.only)) throw new Error(`--league 는 ${Object.keys(LEAGUES).join('|')} 중 하나: ${opts.only}`);
  if (opts.since !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(opts.since))) throw new Error(`--since 는 YYYY-MM-DD: ${opts.since}`);
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = process.env;
  const [kbo, kl1, kbl, wkbl, kovo, naverMod, composeMod, claudeMod, imageMod, wpMod] = await Promise.all([
    import('./sources/kbo.mjs'), import('./sources/kl1.mjs'), import('./sources/kbl.mjs'), import('./sources/wkbl.mjs'),
    import('./sources/kovo.mjs'), import('./naver.mjs'), import('./compose.mjs'), import('./claude.mjs'),
    import('./image.mjs'), import('./wp.mjs'),
  ]);

  const sources = {
    kbo: {
      listFinished: (days) => {
        if (!env.SPORTSDB_KEY) throw new Error('SPORTSDB_KEY 가 없다');
        return kbo.listFinished(days, { key: env.SPORTSDB_KEY });
      },
      fetchFacts: (g) => kbo.fetchFacts(g),
    },
    kl1: { listFinished: (d) => kl1.listFinished(d), fetchFacts: (g) => kl1.fetchFacts(g) },
    kbl: { listFinished: (d) => kbl.listFinished(d), fetchFacts: (g) => kbl.fetchFacts(g) },
    wkbl: { listFinished: (d) => wkbl.listFinished(d), fetchFacts: (g) => wkbl.fetchFacts(g) },
    vm: { listFinished: (d) => kovo.listFinished(d, { gender: '1' }), fetchFacts: (g) => kovo.fetchFacts(g) },
    vw: { listFinished: (d) => kovo.listFinished(d, { gender: '2' }), fetchFacts: (g) => kovo.fetchFacts(g) },
  };
  /* 요청 하나하나에도 시간 제한을 건다(실행기의 리그 단위 제한과 별개로, 매달린 연결이 프로세스를 붙잡지 않게). */
  const naverFetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(NAVER_TIMEOUT_MS) });
  const naver = (league) => naverMod.fetchNaverEntries(league, naverFetch);
  const apiKey = env.ANTHROPIC_API_KEY;
  const claude = (req) => claudeMod.callClaude({ ...req, apiKey });
  const compose = (facts, title, expected) => composeMod.composeReview(facts, title, expected, { claude });

  let wp = null;
  if (!opts.dry) {
    const missing = ['WP_URL', 'WP_USER', 'WP_APP_PASSWORD'].filter((k) => !env[k]);
    if (missing.length) throw new Error(`환경변수가 없다: ${missing.join(', ')}`);
    wp = wpMod.createWp({ url: env.WP_URL, user: env.WP_USER, appPassword: env.WP_APP_PASSWORD });
  }

  const result = await runReview({
    now: new Date(), ...opts, sources, naver, compose, wp,
    image: (facts) => imageMod.makeCard(facts),
    log: (line) => console.log(line),
  });
  const md = summaryMarkdown({ ...result, dry: opts.dry });
  console.log('\n' + md);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, md);
  return result.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }, async (e) => {
    console.error(message(e));
    process.exitCode = 1;
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## 경기 리뷰 실행\n\n실행 실패: ${message(e)}\n`).catch(() => {});
    }
  });
}
