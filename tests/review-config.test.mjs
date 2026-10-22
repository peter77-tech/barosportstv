/* 경기 리뷰 자동 발행 설정(tools/review/config.mjs)의 표와 제목 규칙. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LEAGUES, titleFor, reviewSlug, windowDays } from '../tools/review/config.mjs';

test('titleFor_keeps_query_verbatim', () => {
  assert.equal(titleFor('kbl', '2026년10월21일 서울 삼성 썬더스 부산 KCC 이지스'),
    'KBL 2026년10월21일 서울 삼성 썬더스 부산 KCC 이지스 경기 리뷰');
  assert.equal(titleFor('vm', '2026년 10월 19일 OK저축은행 읏맨 배구단 현대캐피탈 스카이워커스 배구단'),
    'V리그 남자부 2026년 10월 19일 OK저축은행 읏맨 배구단 현대캐피탈 스카이워커스 배구단 경기 리뷰');
});
test('league_table_matches_spec', () => {
  assert.deepEqual(Object.keys(LEAGUES).sort(), ['kbl','kbo','kl1','vm','vw','wkbl']);
  assert.equal(LEAGUES.kbo.titleName, 'KBO리그');
  assert.ok(LEAGUES.kbo.naverQueries.includes('프로야구 준플레이오프 일정'));
  assert.equal(LEAGUES.wkbl.internal.scheduleSlug, null);       // WKBL 페이지 없음 (§8)
});
test('window_never_before_start', () => {
  assert.deepEqual(windowDays(new Date('2026-10-22T03:00:00Z')), ['2026-10-22']);
  assert.deepEqual(windowDays(new Date('2026-10-25T03:00:00Z')), ['2026-10-23','2026-10-24','2026-10-25']);
  // 첫 실행 따라잡기(§3): since 를 주면 그날부터 오늘까지, 단 START_DATE 이전은 잘린다
  assert.deepEqual(windowDays(new Date('2026-10-25T03:00:00Z'), '2026-10-20'), ['2026-10-22','2026-10-23','2026-10-24','2026-10-25']);
});
test('slug_is_ascii', () => assert.equal(reviewSlug('kbl-S49G01N31'), 'match-review-kbl-s49g01n31'));
