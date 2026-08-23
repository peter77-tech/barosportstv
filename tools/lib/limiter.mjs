/* 분당 호출 수 제한기.
   유료 Single Developer 는 분당 100건이다. 넘기면 429 가 나고 프리베이크가
   반쯤 빈 채로 배포된다. 기본값은 여유를 둔 90건.

   `now`·`sleep` 을 주입받는 이유: 테스트에서 실제로 1분을 기다리지 않기 위해서다. */
export function createLimiter({
  perMinute = 90,
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms))
} = {}) {
  const stamps = [];              // 최근 1분 안의 호출 시각

  return async function run(fn) {
    for (;;) {
      const t = now();
      while (stamps.length && t - stamps[0] >= 60000) stamps.shift();
      if (stamps.length < perMinute) {
        stamps.push(t);           // 성공·실패와 무관하게 한 건으로 센다
        return fn();
      }
      await sleep(60000 - (t - stamps[0]) + 10);
    }
  };
}
