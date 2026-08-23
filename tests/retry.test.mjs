import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry } from '../tools/lib/retry.mjs';

/* 실제로 기다리지 않는 가짜 sleep. 얼마나 잤는지만 적어 둔다. */
function fakeSleep() {
  const slept = [];
  return { slept, sleep: async (ms) => { slept.push(ms); } };
}

test('한 번에 성공하면 다시 부르지 않는다', async () => {
  const s = fakeSleep();
  let calls = 0;
  const out = await withRetry(async () => { calls++; return 'ok'; }, { sleep: s.sleep });
  assert.equal(out, 'ok');
  assert.equal(calls, 1);
  assert.deepEqual(s.slept, [], '성공했으므로 잠들지 않아야 한다');
});

test('429 면 기다렸다 다시 부른다', async () => {
  const s = fakeSleep();
  let calls = 0;
  const out = await withRetry(async () => {
    calls++;
    if (calls < 3) { const e = new Error('HTTP 429'); e.status = 429; throw e; }
    return 'ok';
  }, { sleep: s.sleep, baseMs: 1000 });
  assert.equal(out, 'ok');
  assert.equal(calls, 3, '두 번 실패하고 세 번째에 성공해야 한다');
  assert.deepEqual(s.slept, [1000, 2000], '기다리는 시간이 배로 늘어야 한다');
});

test('재시도 횟수를 넘기면 마지막 오류를 그대로 낸다', async () => {
  const s = fakeSleep();
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; const e = new Error('HTTP 429'); e.status = 429; throw e; },
      { sleep: s.sleep, retries: 2, baseMs: 1000 }),
    /HTTP 429/
  );
  assert.equal(calls, 3, '첫 호출 + 재시도 2회 = 3번');
  assert.deepEqual(s.slept, [1000, 2000]);
});

test('429 가 아닌 오류는 다시 부르지 않는다', async () => {
  const s = fakeSleep();
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; const e = new Error('HTTP 404'); e.status = 404; throw e; },
      { sleep: s.sleep }),
    /HTTP 404/
  );
  assert.equal(calls, 1, '404 는 기다려도 달라지지 않으므로 한 번만 부른다');
  assert.deepEqual(s.slept, []);
});

/* 실측 2026-08-23: 빈 응답 102건을 2회씩 재시도했으나 **전부 그대로 실패**했다.
   한도 초과가 아니라 그 시즌이 실제로 없는 것이었다(개막 전 리그 등).
   기다려도 달라지지 않으므로 재시도하지 않는다 — 102건 × (3초+6초) = 15분 낭비였다. */
test('빈 응답(JSON 깨짐)은 다시 부르지 않는다 — 없는 시즌이다', async () => {
  const s = fakeSleep();
  let calls = 0;
  await assert.rejects(
    withRetry(async () => { calls++; throw new SyntaxError('Unexpected end of JSON input'); },
      { sleep: s.sleep, baseMs: 500 }),
    /Unexpected end of JSON input/
  );
  assert.equal(calls, 1, '한 번만 부른다');
  assert.deepEqual(s.slept, [], '기다리지 않는다');
});
