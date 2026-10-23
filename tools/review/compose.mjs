/* 쓰기 → 코드 검사 → 사실 검토 → (탈락 시) 지적을 붙여 1회 재작성 → 그래도 탈락이면 임시글 (설계 §9).
   응답이 잘렸거나(stopReason ≠ end_turn) JSON 으로 읽히지 않아도 그 시도는 실패다. */

import { callClaude } from './claude.mjs';
import { checkDoc } from './checks.mjs';
import { WRITER_SYSTEM, REVIEWER_SYSTEM, writerMessage, rewriteMessage, reviewerMessage } from './prompts.mjs';

const MAX_ATTEMPTS = 2;

/* 응답에서 JSON 객체 하나를 꺼낸다. 코드 블록 표시가 붙어 와도 읽는다. 실패하면 null. */
function parseJsonObject(text) {
  const s = String(text ?? '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b < a) return null;
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function addUsage(total, u) {
  for (const [k, v] of Object.entries(u ?? {})) if (typeof v === 'number') total[k] = (total[k] ?? 0) + v;
  return total;
}

const cut = (stopReason) => ({ field: 'doc', problem: `응답이 정상 종료되지 않았다(잘림·거절, stop_reason: ${stopReason})` });

async function review(claude, facts, doc, usage) {
  const r = await claude({ system: REVIEWER_SYSTEM, user: reviewerMessage(facts, doc) });
  addUsage(usage, r.usage);
  if (r.stopReason !== 'end_turn') return [{ field: 'review', problem: `검토 응답이 정상 종료되지 않았다(잘림·거절, stop_reason: ${r.stopReason})` }];
  const v = parseJsonObject(r.text);
  if (!v || typeof v.pass !== 'boolean' || !Array.isArray(v.issues)) {
    return [{ field: 'review', problem: '검토 응답을 {pass, issues} JSON 으로 읽을 수 없다' }];
  }
  if (v.pass === true && v.issues.length === 0) return [];
  return v.issues.length ? v.issues : [{ field: 'review', problem: '검토자가 통과시키지 않았다(지적 없음)' }];
}

/**
 * @returns {Promise<{ status: 'publish'|'draft', doc: object|null,
 *   attempts: { pass: boolean, issues: object[], usage: object }[] }>}
 *   doc 은 마지막으로 JSON 으로 읽힌 원고. 두 번 다 읽히지 않았으면 null.
 */
export async function composeReview(facts, title, expectedTitle, { claude = callClaude } = {}) {
  const attempts = [];
  let doc = null;
  let issues = [];

  for (let n = 0; n < MAX_ATTEMPTS; n += 1) {
    const usage = {};
    const user = n === 0 ? writerMessage(facts) : rewriteMessage(facts, doc, issues);
    const w = await claude({ system: WRITER_SYSTEM, user });
    addUsage(usage, w.usage);

    const parsed = w.stopReason === 'end_turn' ? parseJsonObject(w.text) : null;
    if (w.stopReason !== 'end_turn') issues = [cut(w.stopReason)];
    else if (!parsed) issues = [{ field: 'doc', problem: '응답을 JSON 객체로 읽을 수 없다. JSON 객체 하나만 출력한다' }];
    else {
      doc = parsed;
      const check = checkDoc(doc, facts, title, expectedTitle);
      issues = check.ok ? await review(claude, facts, doc, usage) : check.issues;
    }

    const pass = issues.length === 0;
    attempts.push({ pass, issues, usage });
    if (pass) return { status: 'publish', doc, attempts };
  }
  return { status: 'draft', doc, attempts };
}
