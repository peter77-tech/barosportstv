/* 경기 리뷰 자동 발행 설정. 리그 표, 제목 규칙, 날짜 창을 한곳에 둔다.
   자료형 설명은 같은 폴더의 types.md 를 본다. */

export const START_DATE = '2026-10-22';   // 이날(한국) 이전 경기는 쓰지 않는다
export const MAX_POSTS_PER_RUN = 12;      // 한 회차 새 글 상한 (비용)
export const MODEL = 'claude-sonnet-5-5';

/* 리그 표. 키는 LeagueKey (types.md). */
export const LEAGUES = {
  kbo:  {
    titleName: 'KBO리그',
    naverQueries: ['프로야구 일정', '프로야구 와일드카드 일정', '프로야구 준플레이오프 일정', '프로야구 플레이오프 일정', '프로야구 한국시리즈 일정'],
    sport: 'baseball', sourceName: 'TheSportsDB',
    internal: { scheduleSlug: 'kbo', relaySlug: '야구중계', guideSlug: 'guide/kbo-free' },
  },
  kl1:  {
    titleName: 'K리그1',
    naverQueries: ['K리그1 일정'],
    sport: 'football', sourceName: 'K리그 공식 기록',
    internal: { scheduleSlug: 'kleague', relaySlug: '축구중계', guideSlug: null },
  },
  kbl:  {
    titleName: 'KBL',
    naverQueries: ['KBL 일정'],
    sport: 'basketball', sourceName: 'KBL 공식 기록',
    internal: { scheduleSlug: 'kbl', relaySlug: '농구중계', guideSlug: null },
  },
  wkbl: {
    titleName: 'WKBL',
    naverQueries: ['WKBL 일정'],
    sport: 'basketball', sourceName: 'WKBL 공식 기록',
    internal: { scheduleSlug: null, relaySlug: '농구중계', guideSlug: null },   // WKBL 페이지 없음 (§8)
  },
  vm:   {
    titleName: 'V리그 남자부',
    naverQueries: ['V리그 남자부 일정'],   // Task 2 에서 실측 후 확정
    sport: 'volleyball', sourceName: 'KOVO 공식 기록',
    internal: { scheduleSlug: 'v-league', relaySlug: '배구중계', guideSlug: null },
  },
  vw:   {
    titleName: 'V리그 여자부',
    naverQueries: ['V리그 여자부 일정'],   // Task 2 에서 실측 후 확정
    sport: 'volleyball', sourceName: 'KOVO 공식 기록',
    internal: { scheduleSlug: 'v-league', relaySlug: '배구중계', guideSlug: null },
  },
};

/* 제목 = 「리그명 + 네이버 검색어 + 경기 리뷰」. 검색어는 한 바이트도 바꾸지 않는다 (§6). */
export function titleFor(league, naverQuery) {
  const entry = LEAGUES[league];
  if (!entry) throw new Error(`알 수 없는 리그: ${league}`);
  return `${entry.titleName} ${naverQuery} 경기 리뷰`;
}

/* 경기 키 → 워드프레스 slug. 영문 소문자·숫자·하이픈만 남긴다. */
export function reviewSlug(gameKey) {
  return `match-review-${gameKey.toLowerCase()}`;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* 한국 날짜 'YYYY-MM-DD' (UTC+9, 서머타임 없음). */
export function kstToday(now) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(key, n) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/* 리뷰를 쓸 날짜 목록(한국 날짜). 기본은 오늘 포함 최근 3일, since 를 주면 그날부터 오늘까지.
   START_DATE 이전은 항상 잘린다. 시작이 오늘을 넘으면 빈 목록. */
export function windowDays(now, since) {
  const today = kstToday(now);
  const first = since ?? addDays(today, -2);
  const start = first > START_DATE ? first : START_DATE;
  const days = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  return days;
}
