/* 429(호출 한도) 는 잠깐 기다리면 풀린다. 한 번에 버리면 그 팀·순위표가
   통째로 빠지고, 화면은 멀쩡한 채 영문 팀명과 하드코딩으로 되돌아간다.
   실측 2026-08-23: 이 재시도로 팀 328/421 → 409/421, 429 가 0 건이 됐다.

   ⚠️ 빈 응답("Unexpected end of JSON input") 은 재시도하지 않는다.
     한도 초과의 다른 얼굴일 것으로 보고 재시도해 봤지만, 102건이 2회 재시도
     후에도 전부 그대로 실패했다 — 그 시즌이 실제로 없는 것이었다(개막 전 리그).
     기다려도 달라지지 않는데 회차가 14분 → 29분으로 늘어 크론 주기를 넘겼다.

   404 처럼 기다려도 달라지지 않는 오류도 재시도하지 않는다.

   `sleep` 을 주입받는 이유: 테스트에서 실제로 기다리지 않기 위해서다. */

function 기다릴만한가(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  if (err instanceof SyntaxError) return false;             // 빈 응답 — 없는 시즌이다
  return /HTTP 429/.test(String(err.message || ''));
}

export async function withRetry(fn, {
  retries = 2,
  baseMs = 3000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
} = {}) {
  let wait = baseMs;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !기다릴만한가(err)) throw err;
      await sleep(wait);
      wait *= 2;
    }
  }
}
