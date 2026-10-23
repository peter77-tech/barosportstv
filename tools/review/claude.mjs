/* Anthropic Messages API 호출 (SDK 없이 fetch). 응답은 반드시 스트리밍(SSE)으로 받는다 —
   한 번에 받으면 긴 응답에서 연결이 끊겼다(시험 실측, UND_ERR_SOCKET, 설계 §9).

   재시도: 네트워크 오류(fetch 실패·스트림 도중 끊김)와 서버 쪽 일시 오류(429·5xx·스트림 error 이벤트)만
   2회까지 다시 부른다. 400·401 처럼 다시 불러도 같은 오류는 바로 던진다.
   호출 하나(응답 머리글 + 스트림 끝까지)에 전체 시간 제한을 둔다. 넘기면 요청을 끊고 네트워크 오류로 다룬다(재시도 대상).
   `fetchImpl`·`sleep` 은 테스트에서 가짜를 넣기 위해 주입받는다. */

import { MODEL } from './config.mjs';

const URL_MESSAGES = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const RETRIES = 2;
const BASE_WAIT_MS = 5000;
const TIMEOUT_MS = 5 * 60 * 1000;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
/* status 없는 오류 = 네트워크 오류(fetch 실패·스트림 끊김) */
const retryable = (err) => err.status == null || err.status === 429 || err.status >= 500;

/* SSE 를 읽어 text_delta 를 잇고, 사용량·멈춘 이유를 모은다. 바이트·줄이 조각나 와도 된다. */
async function readStream(body) {
  const decoder = new TextDecoder();
  const out = { text: '', usage: {}, stopReason: null };
  let buf = '';

  const handle = (data) => {
    const ev = JSON.parse(data);
    switch (ev.type) {
      case 'message_start': Object.assign(out.usage, ev.message?.usage); break;
      case 'content_block_delta': if (ev.delta?.type === 'text_delta') out.text += ev.delta.text; break;
      case 'message_delta':
        if (ev.delta?.stop_reason) out.stopReason = ev.delta.stop_reason;
        Object.assign(out.usage, ev.usage);
        break;
      case 'error': {
        const e = new Error(`Anthropic 스트림 오류: ${ev.error?.type ?? ''} ${ev.error?.message ?? ''}`.trim());
        e.status = ev.error?.type === 'invalid_request_error' ? 400 : 503;
        throw e;
      }
      default: break;   // ping, content_block_start/stop, message_stop, thinking 블록 등
    }
  };
  const flushEvent = (block) => {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (data) handle(data);
  };

  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.search(/\r?\n\r?\n/)) !== -1) {
      const sep = buf.slice(i).match(/^\r?\n\r?\n/)[0].length;
      flushEvent(buf.slice(0, i));
      buf = buf.slice(i + sep);
    }
  }
  buf += decoder.decode();
  if (buf.trim()) flushEvent(buf);
  return out;
}

async function request({ system, user, maxTokens, apiKey, fetchImpl, signal }) {
  const res = await fetchImpl(URL_MESSAGES, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      stream: true,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new HttpError(res.status, `Anthropic HTTP ${res.status}: ${detail}`);
  }
  return readStream(res.body);
}

/* status 없는 Error 로 거절 = 재시도하는 네트워크 오류. 진 쪽(끊긴 요청)의 늦은 거절은 삼킨다. */
async function once({ timeoutMs, ...req }) {
  const ac = new AbortController();
  let timer;
  const timedOut = new Promise((_, rej) => {
    timer = setTimeout(() => { ac.abort(); rej(new Error(`Anthropic 호출 시간 초과 ${timeoutMs}ms`)); }, timeoutMs);
  });
  const work = request({ ...req, signal: ac.signal });
  work.catch(() => {});
  try {
    return await Promise.race([work, timedOut]);
  } finally { clearTimeout(timer); }
}

/**
 * @returns {Promise<{ text: string, usage: object, stopReason: string|null }>}
 *   stopReason 이 'end_turn' 이 아니면(예 'max_tokens'·'refusal') 부르는 쪽이 실패로 다룬다.
 */
export async function callClaude({
  system, user, maxTokens = 16000,
  apiKey = process.env.ANTHROPIC_API_KEY,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = TIMEOUT_MS,
}) {
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 가 없다');
  let wait = BASE_WAIT_MS;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await once({ system, user, maxTokens, apiKey, fetchImpl, timeoutMs });
    } catch (err) {
      if (attempt >= RETRIES || !retryable(err)) throw err;
      await sleep(wait);
      wait *= 2;
    }
  }
}
