# 경기 리뷰 자동 발행 공통 자료형

아래 블록은 globals.md 「공통 자료형」을 그대로 옮긴 것이다 (JSDoc 용).

```js
LeagueKey = 'kbo' | 'kl1' | 'kbl' | 'wkbl' | 'vm' | 'vw'

Game = {                       // 수집기의 「끝난 경기」 목록 한 줄
  league: LeagueKey, gameKey: string,   // 'kbl-S49G01N31' 처럼 리그 접두 + 원본 id, 영숫자·하이픈만
  date: 'YYYY-MM-DD',          // 한국 날짜
  home: string, away: string,  // 원본 기록의 팀 이름(짝짓기 입력)
  homeScore: number, awayScore: number,
  stage: string | null,        // '정규시즌' | '준플레이오프' ...
  ref: object                  // 그 수집기가 fetchFacts 에 다시 쓰는 원본 id 묶음
}

MatchFacts = {
  league, gameKey, date, stage,
  venue: string, crowd: number | null,
  home: { name: string, short: string, full: string | null },   // name=본문 표기, short=이미지, full=네이버 정식명(짝짓기 후 채움)
  away: { name, short, full },
  score: { home: number, away: number },                          // 무승부 가능
  periods: { labels: string[], home: (number|null)[], away: (number|null)[] },
  teamStats: [{ label: string, home: string|number, away: string|number, lowerBetter?: true }],   // 최대 8줄
  playerColumns: string[],                                        // 선수 표 머리글
  players: [{ side: 'home'|'away', name: string, cells: (string|number)[] }],
  timeline: string[],                                             // K리그만, 그 외 []
  ai: object,                                                     // AI·검토에 넘길 원본 기록(다듬은 것)
  source: { name: string, url: string }                           // 출처 이름 + 공식 기록 페이지
}

NaverEntry = { query: string, date: 'YYYY-MM-DD', text: string }  // text = 날짜 뒤 팀 부분

ReviewDoc = { meta_description: string, answer: string, key_points: string[],
              body_html: string, verdict_html: string }

Outcome = { gameKey, title: string|null, status: 'publish'|'draft'|'skip'|'giveup'|'exists'|'error',
            reason?: string, postId?: number }
```
