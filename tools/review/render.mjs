/* 글 본문 조립. 점수판·비교 막대·선수 표·타임라인·JSON-LD 는 코드가 facts 로 그린다 — AI 는 문장 필드만 쓴다 (§7.1).
   doc 의 HTML 은 checkDoc 이 허용 태그만 남겼으므로 그대로 넣고, facts 에서 온 값은 모두 이스케이프한다. */
import { LEAGUES } from './config.mjs';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function dateKo(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

function meta(f) {
  const lg = LEAGUES[f.league];
  const parts = [lg.titleName, dateKo(f.date)];
  if (f.venue) parts.push(f.venue);
  if (f.crowd > 0) parts.push(`관중 ${f.crowd.toLocaleString('en-US')}명`);
  parts.push(`기록 출처 ${f.source.name}`);
  return `<p class="bstv-meta">${parts.map(esc).join(' · ')}</p>`;
}

function answer(doc) {
  /* 검토 미통과(draft) 원고도 그리므로 key_points 가 배열이 아니면 빈 목록으로 다룬다. */
  const kp = Array.isArray(doc.key_points) ? doc.key_points : [];
  const pts = kp.map((p) => `<li>${esc(p)}</li>`).join('');
  return `<div class="bstv-answer"><p><strong>한눈에 보기</strong></p><p>${esc(doc.answer)}</p>${pts ? `<ul>${pts}</ul>` : ''}</div>`;
}

/* 원정 → 홈 순서 (「{원정} vs {홈}」 표기와 같다). 무승부면 승 배지를 달지 않는다. */
function scoreboard(f) {
  const p = f.periods;
  if (!p.labels.length) return '';
  const diff = f.score.home - f.score.away;
  const row = (side, name, total, win) =>
    `<tr><th scope="row">${esc(name)}${win ? ' <b>승</b>' : ''}</th>${p[side].map((n) => `<td>${n == null ? '-' : esc(n)}</td>`).join('')}<td><strong>${esc(total)}</strong></td></tr>`;
  const head = `<tr><th scope="col">팀</th>${p.labels.map((l) => `<th scope="col">${esc(l)}</th>`).join('')}<th scope="col">계</th></tr>`;
  return `<table class="bstv-sb"><caption>점수판</caption><thead>${head}</thead><tbody>` +
    row('away', f.away.name, f.score.away, diff < 0) + row('home', f.home.name, f.score.home, diff > 0) + '</tbody></table>';
}

/* 막대 비교용 숫자. 「17/23 (73.9%)」 처럼 괄호 안 퍼센트가 있으면 그 값, 「32:10」 은 초, 그 외는 앞쪽 숫자. */
function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v);
  const pct = s.match(/\(\s*(-?[\d.]+)\s*%\s*\)/);
  if (pct) return parseFloat(pct[1]);
  const clock = s.match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
const pctStr = (x) => `${Number(x.toFixed(1))}%`;

function compare(f) {
  if (!f.teamStats.length) return '';
  const rows = f.teamStats.map((s) => {
    const a = num(s.away);
    const h = num(s.home);
    const sum = a + h;
    const aw = sum > 0 ? (a / sum) * 100 : 50;
    const better = a === h ? null : (s.lowerBetter ? a < h : a > h) ? 'away' : 'home';
    const cell = (side, val) => (better === side ? `<td><strong>${esc(val)}</strong></td>` : `<td>${esc(val)}</td>`);
    return `<tr>${cell('away', s.away)}<th scope="row">${esc(s.label)}<span class="bstv-bar" aria-hidden="true"><i style="width:${pctStr(aw)}"></i><i style="width:${pctStr(100 - aw)}"></i></span></th>${cell('home', s.home)}</tr>`;
  }).join('');
  return `<table class="bstv-cmp"><caption>팀 기록 비교</caption><thead><tr><th scope="col">${esc(f.away.name)}</th><th scope="col"></th><th scope="col">${esc(f.home.name)}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* 선수 표 계약: playerColumns·cells 가 표 전체다. 첫 열은 선수 이름(행 머리로 그린다).
   '팀' 열이 없는 리그(KBL·WKBL)만 이름 다음에 팀 열을 끼운다 — 어느 리그든 「선수 · 팀 · …」 한 벌. */
function playerTable(f) {
  if (!f.players.length) return '';
  const [nameCol, ...restCols] = f.playerColumns;
  const addTeam = !f.playerColumns.includes('팀');
  const th = (c) => `<th scope="col">${esc(c)}</th>`;
  const head = `<tr>${th(nameCol)}${addTeam ? th('팀') : ''}${restCols.map(th).join('')}</tr>`;
  const rows = f.players.map((p) => {
    const [name, ...rest] = p.cells;
    const team = addTeam ? `<td>${esc(p.side === 'home' ? f.home.name : f.away.name)}</td>` : '';
    return `<tr><th scope="row">${esc(name)}</th>${team}${rest.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`;
  }).join('');
  return `<table class="bstv-pt"><caption>주요 선수 기록</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function timeline(f) {
  if (!f.timeline.length) return '';
  return `<div class="bstv-tl"><p><strong>득점·경고 기록</strong></p><ul>${f.timeline.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

function linkList(links) {
  if (!links.length) return '';
  return `<nav class="bstv-links"><p><strong>함께 보기</strong></p><ul>${links.map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('')}</ul></nav>`;
}

function source(f) {
  const name = f.source.name + (f.league === 'kbo' ? ' 기록' : '');
  return `<p class="bstv-src">${esc(name)}을 바탕으로 자동 작성·사실 검수 · <a href="${esc(f.source.url)}" rel="noopener" target="_blank">공식 기록 보기</a></p>`;
}

/* 글 본문 HTML. 총평·절 소제목은 doc 안에 이미 있으므로 덧붙이지 않는다.
    SportsEvent JSON-LD 는 본문에 넣지 않는다 — Task 13 이 메타로 저장하고 테마가 wp_head 에 찍는다. */
export function renderPost(facts, doc, links = []) {
  const inner = [
    meta(facts), answer(doc), scoreboard(facts), doc.body_html,
    compare(facts), playerTable(facts), timeline(facts), doc.verdict_html,
    linkList(links), source(facts),
  ].filter(Boolean).join('\n');
  return `<div class="bstv-review">\n${inner}\n</div>`;
}
