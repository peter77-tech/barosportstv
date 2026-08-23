import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from '../tools/lib/limiter.mjs';

/* 가짜 시계. sleep 을 부르면 시간이 그만큼 흐른다 — 실제로 기다리지 않는다. */
function fakeClock() {
  let t = 0;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    advance: (ms) => { t += ms; },
    slept
  };
}

test('한도 안에서는 기다리지 않는다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 3, now: c.now, sleep: c.sleep });
  const out = [];
  for (let i = 0; i < 3; i++) await run(async () => out.push(i));
  assert.deepEqual(out, [0, 1, 2]);
  assert.deepEqual(c.slept, [], '한도 안이므로 잠들지 않아야 한다');
});

test('한도를 넘으면 창이 열릴 때까지 기다린다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 2, now: c.now, sleep: c.sleep });
  await run(async () => 'a');
  await run(async () => 'b');
  await run(async () => 'c');
  assert.equal(c.slept.length, 1, '세 번째에서 한 번 기다려야 한다');
  assert.ok(c.slept[0] > 0 && c.slept[0] <= 60050,
    `기다린 시간이 이상하다: ${c.slept[0]} (창이 열리도록 10ms 여유를 더하므로 60010 이 정상)`);
});

test('1분이 지나면 창이 비워져 다시 즉시 통과한다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 2, now: c.now, sleep: c.sleep });
  await run(async () => 'a');
  await run(async () => 'b');
  c.advance(60001);
  await run(async () => 'c');
  assert.deepEqual(c.slept, [], '창이 비었으므로 기다리지 않아야 한다');
});

test('호출 결과를 그대로 돌려준다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 10, now: c.now, sleep: c.sleep });
  assert.equal(await run(async () => 42), 42);
});

test('호출이 던진 예외를 그대로 올려보낸다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 10, now: c.now, sleep: c.sleep });
  await assert.rejects(() => run(async () => { throw new Error('boom'); }), /boom/);
});

test('예외가 나도 호출 한 건으로 세어진다 — API 는 실패한 호출도 한도에 넣는다', async () => {
  const c = fakeClock();
  const run = createLimiter({ perMinute: 1, now: c.now, sleep: c.sleep });
  await assert.rejects(() => run(async () => { throw new Error('boom'); }));
  await run(async () => 'next');
  assert.equal(c.slept.length, 1, '실패한 호출도 한도를 차지해야 한다');
});
