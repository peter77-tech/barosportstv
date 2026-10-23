import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { composeReview } from '../tools/review/compose.mjs';
import { callClaude } from '../tools/review/claude.mjs';
import { WRITER_SYSTEM, REVIEWER_SYSTEM } from '../tools/review/prompts.mjs';
import { toFacts as kblFacts } from '../tools/review/sources/kbl.mjs';
import { titleFor, MODEL } from '../tools/review/config.mjs';

const load = async (n) => JSON.parse(await readFile(new URL(`./fixtures/review/${n}.json`, import.meta.url), 'utf8'));
const F = kblFacts({
  game: { league: 'kbl', gameKey: 'kbl-S49G01N31', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC',
    homeScore: 97, awayScore: 86, stage: '정규시즌', ref: { gmkey: 'S49G01N31' } },
  match: await load('kbl-S49G01N31-match'),
  teamRecord: await load('kbl-S49G01N31-team-record'),
  playerStat: await load('kbl-S49G01N31-player-stat'),
});
const EXP = titleFor('kbl', '2026년 10월21일 서울 삼성 vs 부산 KCC');
/* tests/review-checks.test.mjs 의 checkDoc 통과 문서와 같다 */
const good = {
  meta_description: '서울 삼성이 부산 KCC를 97-86으로 꺾었다.',
  answer: '서울 삼성이 부산 KCC를 97-86으로 이겼다.',
  key_points: ['어시스트 27-16', '2점슛 성공률 74.4%'],
  body_html: '<h2>경기 흐름</h2><p>1쿼터 30-21로 앞선 서울 삼성은 4쿼터까지 격차를 지켰다.</p><ul><li><strong>케렘 칸터</strong> 30점</li></ul>',
  verdict_html: '<p>서울 삼성의 어시스트와 2점슛이 앞선 경기였다.</p>',
};
const bad = { ...good, answer: '서울 삼성이 99-86으로 이겼다.' };   // 근거 없는 숫자 99 → checkDoc 실패

const USAGE = { input_tokens: 10, output_tokens: 20 };
const reply = (obj, stopReason = 'end_turn') => ({ text: typeof obj === 'string' ? obj : JSON.stringify(obj), usage: USAGE, stopReason });

/* 가짜 claude: 쓰는 AI·검토 AI 응답을 차례로 꺼내 주고, 받은 호출을 기록한다. */
function fakeClaude({ writer = [], reviewer = [] }) {
  const calls = [];
  const claude = async (req) => {
    calls.push(req);
    if (req.system === WRITER_SYSTEM) {
      assert.ok(writer.length, '쓰는 AI 호출이 예상보다 많다');
      return writer.shift();
    }
    assert.equal(req.system, REVIEWER_SYSTEM);
    assert.ok(reviewer.length, '검토 AI 호출이 예상보다 많다');
    return reviewer.shift();
  };
  const of = (system) => calls.filter((c) => c.system === system);
  return { claude, calls, writes: () => of(WRITER_SYSTEM), reviews: () => of(REVIEWER_SYSTEM) };
}

const X = { field: 'body_html', quote: '4쿼터까지 격차를 지켰다', problem: '3쿼터에 격차가 3점까지 줄었다는 기록과 어긋난다', fix: '문장을 지운다' };

test('pass_first_try_publishes', async () => {
  const f = fakeClaude({ writer: [reply(good)], reviewer: [reply({ pass: true, issues: [] })] });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.status, 'publish');
  assert.deepEqual(r.doc, good);
  assert.equal(r.attempts.length, 1);
  assert.equal(r.attempts[0].pass, true);
  assert.deepEqual(r.attempts[0].issues, []);
  assert.ok(r.attempts[0].usage);
  const w = f.writes()[0].user;
  for (const s of ['KBL', '서울 삼성', '부산 KCC', JSON.stringify(F.ai)]) assert.ok(w.includes(s), s);
  const rv = f.reviews()[0].user;
  assert.ok(rv.includes(JSON.stringify(F.ai)) && rv.includes(good.body_html));
});

test('reviewer_fail_then_pass', async () => {
  const f = fakeClaude({
    writer: [reply(good), reply(good)],
    reviewer: [reply({ pass: false, issues: [X] }), reply({ pass: true, issues: [] })],
  });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.ok(f.writes()[1].user.includes(X.problem));
  assert.ok(!f.writes()[0].user.includes(X.problem));
  assert.equal(r.status, 'publish');
  assert.equal(r.attempts.length, 2);
  assert.equal(r.attempts[0].pass, false);
  assert.deepEqual(r.attempts[0].issues, [X]);
});

test('two_fails_is_draft', async () => {
  const Y = { ...X, problem: '두 번째 지적' };
  const f = fakeClaude({
    writer: [reply(good), reply(good)],
    reviewer: [reply({ pass: false, issues: [X] }), reply({ pass: false, issues: [Y] })],
  });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.status, 'draft');
  assert.equal(r.attempts.length, 2);
  assert.deepEqual(r.attempts[1].issues, [Y]);
  assert.deepEqual(r.doc, good);
});

test('code_check_fail_skips_reviewer_and_rewrites', async () => {
  const f = fakeClaude({ writer: [reply(bad), reply(good)], reviewer: [reply({ pass: true, issues: [] })] });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(f.reviews().length, 1, '1차 시도에서는 검토 AI 를 부르지 않는다');
  assert.equal(r.status, 'publish');
  assert.equal(r.attempts.length, 2);
  assert.equal(r.attempts[0].pass, false);
  assert.ok(r.attempts[0].issues.some((i) => /99/.test(i.problem)));
  assert.ok(f.writes()[1].user.includes('근거 없는 숫자: 99'), '코드 검사 지적도 재작성에 붙는다');
});

test('reviewer_pass_true_with_issues_is_fail', async () => {
  const f = fakeClaude({
    writer: [reply(good), reply(good)],
    reviewer: [reply({ pass: true, issues: [X] }), reply({ pass: true, issues: [] })],
  });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.attempts[0].pass, false);
  assert.equal(r.status, 'publish');
});

test('truncated_output_is_fail', async () => {
  const f = fakeClaude({ writer: [reply(good, 'max_tokens'), reply(good)], reviewer: [reply({ pass: true, issues: [] })] });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.attempts.length, 2);
  assert.equal(r.attempts[0].pass, false);
  assert.equal(f.reviews().length, 1);
  assert.equal(r.status, 'publish');
});

test('truncated_reviewer_is_fail', async () => {
  const f = fakeClaude({
    writer: [reply(good), reply(good)],
    reviewer: [reply({ pass: true, issues: [] }, 'max_tokens'), reply({ pass: true, issues: [] }, 'max_tokens')],
  });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.status, 'draft');
  assert.equal(r.attempts.length, 2);
});

test('json_parse_fail_is_fail', async () => {
  const f = fakeClaude({ writer: [reply('죄송합니다, JSON 이 아닙니다'), reply('```json\n' + JSON.stringify(good) + '\n```')], reviewer: [reply({ pass: true, issues: [] })] });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.attempts[0].pass, false);
  assert.equal(r.status, 'publish');
  assert.deepEqual(r.doc, good);
});

test('both_unparseable_is_draft_without_doc', async () => {
  const f = fakeClaude({ writer: [reply('x'), reply('y')] });
  const r = await composeReview(F, EXP, EXP, { claude: f.claude });
  assert.equal(r.status, 'draft');
  assert.equal(r.doc, null);
  assert.equal(r.attempts.length, 2);
});

test('prompts_carry_rules', () => {
  for (const s of ['meta_description', 'answer', 'key_points', 'body_html', 'verdict_html',
    '기록에 없', '데이터상', '때문에 이겼', '설명한다', '경기 내내', '무승부로 끝났다', '1,400', '2,600', '45+9', '74.4%'])
    assert.ok(WRITER_SYSTEM.includes(s), `WRITER_SYSTEM: ${s}`);
  for (const s of ['pass', 'issues', 'field', 'quote', 'problem', 'fix', '문체'])
    assert.ok(REVIEWER_SYSTEM.includes(s), `REVIEWER_SYSTEM: ${s}`);
});

/* ---- callClaude: SSE ---- */

function sseResponse(chunks, status = 200) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}
const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const SSE_OK = [
  ev('message_start', { message: { id: 'msg_1', usage: { input_tokens: 42, output_tokens: 1 } } }),
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }),
  ev('ping', {}),
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"a":' } }).slice(0, 30),
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{"a":' } }).slice(30),
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '"한글"}' } }),
  ev('content_block_stop', { index: 0 }),
  ev('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } }),
  ev('message_stop', {}),
];

test('sse_parsing', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return sseResponse(SSE_OK); };
  const r = await callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl });
  assert.equal(r.text, '{"a":"한글"}');
  assert.equal(r.stopReason, 'end_turn');
  assert.equal(r.usage.input_tokens, 42);
  assert.equal(r.usage.output_tokens, 9);
  assert.equal(seen.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(seen.init.headers['x-api-key'], 'k');
  assert.equal(seen.init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, MODEL);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 16000);
  assert.equal(body.system, 'S');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'U' }]);
});

test('sse_utf8_split_across_chunks', async () => {
  const whole = ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '한글' } });
  const bytes = new TextEncoder().encode(whole);
  const cut = bytes.indexOf(0xED) + 1;   // '한' 의 첫 바이트 뒤에서 자른다
  const body = new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(SSE_OK[0])); c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut));
    c.enqueue(new TextEncoder().encode(SSE_OK[7])); c.close();
  } });
  const r = await callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: async () => new Response(body) });
  assert.equal(r.text, '한글');
});

test('network_error_retried_twice_then_throws', async () => {
  let n = 0;
  const failing = async () => { n++; throw new TypeError('fetch failed'); };
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: failing, sleep: async () => {} }));
  assert.equal(n, 3);
  n = 0;
  const flaky = async () => { n++; if (n < 3) throw new TypeError('fetch failed'); return sseResponse(SSE_OK); };
  const r = await callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: flaky, sleep: async () => {} });
  assert.equal(r.text, '{"a":"한글"}');
});

test('http_400_not_retried_and_stream_error_throws', async () => {
  let n = 0;
  const f400 = async () => { n++; return new Response('{"error":{"message":"bad"}}', { status: 400 }); };
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: f400, sleep: async () => {} }), /400/);
  assert.equal(n, 1);
  const errStream = async () => sseResponse([SSE_OK[0], ev('error', { error: { type: 'overloaded_error', message: 'Overloaded' } })]);
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: errStream, sleep: async () => {} }), /overloaded/);
});

test('missing_api_key_throws', async () => {
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: '', fetchImpl: async () => sseResponse(SSE_OK) }), /ANTHROPIC_API_KEY/);
});

/* 응답 머리글이 안 오거나 스트림이 도중에 멈춰도 호출 하나가 프로세스를 붙잡지 않는다 — 시간 초과는 재시도하는 네트워크 오류다. */
test('overall_timeout_covers_fetch_and_stream_and_is_retried', async () => {
  let n = 0;
  const signals = [];
  const hangFetch = async (url, init) => { n++; signals.push(init.signal); return new Promise(() => {}); };
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: hangFetch, sleep: async () => {}, timeoutMs: 20 }), /시간 초과/);
  assert.equal(n, 3);
  assert.ok(signals.every((s) => s && s.aborted), '시간 초과 때 요청을 끊는다');

  n = 0;
  const hangStream = async () => {
    n++;
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(SSE_OK[0])); } });   // 닫지 않는다
    return new Response(body);
  };
  await assert.rejects(callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: hangStream, sleep: async () => {}, timeoutMs: 20 }), /시간 초과/);
  assert.equal(n, 3);

  n = 0;
  const slowThenOk = async () => { n++; return n < 2 ? new Promise(() => {}) : sseResponse(SSE_OK); };
  const r = await callClaude({ system: 'S', user: 'U', apiKey: 'k', fetchImpl: slowThenOk, sleep: async () => {}, timeoutMs: 20 });
  assert.equal(r.text, '{"a":"한글"}');
});
