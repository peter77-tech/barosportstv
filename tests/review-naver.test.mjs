/* 네이버 일정 카드 검색어 뽑기·짝짓기 (tools/review/naver.mjs, aliases.mjs).
   fixture 는 2026-10-22 에 받은 일정 카드 영역의 고정 사본이라 날짜가 흘러도 테스트는 변하지 않는다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseNaverSchedule, fetchNaverEntries, resetNaverThrottle, pairQuery, splitFullNames } from '../tools/review/naver.mjs';
import { ALIASES } from '../tools/review/aliases.mjs';
import { LEAGUES } from '../tools/review/config.mjs';

const fixture = (name) => readFileSync(new URL(`./fixtures/review/${name}`, import.meta.url), 'utf8');

test('kbl_picks_schedule_card_format_only', () => {
  const e = parseNaverSchedule(fixture('naver-kbl.html'));
  assert.ok(e.some(x => x.query === '2026년10월21일 서울 삼성 썬더스 부산 KCC 이지스'));
  assert.ok(!e.some(x => /^2026년 10월 2\d일/.test(x.query)));    // 띄어 쓴 미끼 형식은 제외 (BD 확인 §6)
});
test('kbl_decoy_is_really_in_fixture', () => {            // 미끼가 fixture 에 없으면 위 단언이 아무것도 못 막는다
  assert.match(fixture('naver-kbl.html'), /query=2026%EB%85%84%2010%EC%9B%94%2023%EC%9D%BC/);
});
test('kbo_stage_query_verbatim', () => {
  const e = parseNaverSchedule(fixture('naver-kbo-준플레이오프.html'));
  assert.ok(e.some(x => x.query === '2026년 10월 20일 KIA 타이거즈 LG 트윈스' && x.date === '2026-10-20'));
});
test('kbo_open_tab_and_wildcard', () => {
  const ks = parseNaverSchedule(fixture('naver-kbo.html'));
  assert.deepEqual(ks[0], { query: '2026년 10월 25일 KIA 타이거즈 삼성 라이온즈', date: '2026-10-25', text: 'KIA 타이거즈 삼성 라이온즈' });
  assert.equal(ks.length, 5);
  const wc = parseNaverSchedule(fixture('naver-kbo-와일드카드.html'));
  assert.deepEqual(wc.map(x => x.date), ['2026-10-14']);
});
test('kl1_nospace_date_parsed', () => {
  const e = parseNaverSchedule(fixture('naver-kl1.html'));
  assert.ok(e.some(x => x.query === '2026년10월18일 전북 현대 모터스 제주 SK FC' && x.date === '2026-10-18'));
  assert.ok(e.some(x => x.date === '2026-08-29'));        // 한 자리 달도 0 을 채워 날짜로
});
test('outside_container_links_ignored_wkbl', () => {
  const html = fixture('naver-wkbl.html');
  assert.ok(html.includes(encodeURIComponent('여자프로농구') + '%20' + encodeURIComponent('경기일정')),
    '컨테이너 밖 미끼가 fixture 에 있어야 한다');
  const e = parseNaverSchedule(html);
  assert.ok(e.length > 30);
  assert.ok(!e.some(x => /경기일정/.test(x.query)));
  assert.ok(e.some(x => x.query === '2026년11월1일 청주 KB스타즈 BNK 썸'));
});
test('volley_card_dedupes_double_links', () => {
  const e = parseNaverSchedule(fixture('naver-vm.html'));
  const q = '2026년 10월 19일 OK저축은행 읏맨 배구단 현대캐피탈 스카이워커스 배구단';
  assert.equal(e.filter(x => x.query === q).length, 1);
  assert.equal(e.length, 9);
});
test('no_schedule_card_gives_empty', () => {
  assert.deepEqual(parseNaverSchedule('<html><a href="?query=2026%EB%85%8410%EC%9B%9421%EC%9D%BC%20A%20B">x</a></html>'), []);
  assert.deepEqual(parseNaverSchedule(''), []);
});

test('pair_by_date_and_alias_tokens', () => {
  const g = { league: 'kbl', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC' };
  assert.equal(pairQuery(g, parseNaverSchedule(fixture('naver-kbl.html'))).query,
    '2026년10월21일 서울 삼성 썬더스 부산 KCC 이지스');
});
test('pair_works_with_reversed_order_and_alone_nickname', () => {
  const es = parseNaverSchedule(fixture('naver-kbl.html'));
  assert.equal(pairQuery({ league: 'kbl', date: '2026-10-16', home: '울산 현대모비스', away: '고양 소노' }, es).query,
    '2026년10월16일 스카이거너스 울산 현대모비스 피버스');
  assert.equal(pairQuery({ league: 'kbo', date: '2026-10-20', home: 'LG Twins', away: 'Kia Tigers' },
    parseNaverSchedule(fixture('naver-kbo-준플레이오프.html'))).query, '2026년 10월 20일 KIA 타이거즈 LG 트윈스');
  assert.equal(pairQuery({ league: 'kl1', date: '2026-10-18', home: '제주', away: '전북' },
    parseNaverSchedule(fixture('naver-kl1.html'))).query, '2026년10월18일 전북 현대 모터스 제주 SK FC');
});
test('match_ambiguous_returns_null', () => {
  const es = [{ query: 'A', date: '2026-05-01', text: 'KIA 타이거즈 LG 트윈스' },
              { query: 'B', date: '2026-05-01', text: 'LG 트윈스 KIA 타이거즈' }];
  assert.equal(pairQuery({ league: 'kbo', date: '2026-05-01', home: 'LG Twins', away: 'Kia Tigers' }, es), null);
});
test('wrong_date_returns_null', () => {
  assert.equal(pairQuery({ league: 'kbl', date: '2026-10-28', home: '서울 삼성', away: '부산 KCC' },
    parseNaverSchedule(fixture('naver-kbl.html'))), null);
});
test('unknown_team_returns_null', () => {
  assert.equal(pairQuery({ league: 'kbl', date: '2026-10-21', home: '없는 팀', away: '부산 KCC' },
    parseNaverSchedule(fixture('naver-kbl.html'))), null);
  assert.equal(pairQuery({ league: 'zzz', date: '2026-10-21', home: 'a', away: 'b' }, []), null);
});

test('split_full_names', () => {
  const g = { league: 'kbl', date: '2026-10-21', home: '서울 삼성', away: '부산 KCC' };
  const e = { query: '2026년10월21일 서울 삼성 썬더스 부산 KCC 이지스', date: '2026-10-21', text: '서울 삼성 썬더스 부산 KCC 이지스' };
  assert.deepEqual(splitFullNames(e, g), { home: '서울 삼성 썬더스', away: '부산 KCC 이지스' });
});
test('split_full_names_reversed_and_city_prefix', () => {
  const g = { league: 'kbl', home: '창원 LG', away: '고양 소노' };
  assert.deepEqual(splitFullNames({ text: '스카이거너스 창원 LG 세이커스' }, g), { home: '창원 LG 세이커스', away: '스카이거너스' });
  const k = { league: 'kl1', home: '서울', away: '전북' };
  assert.deepEqual(splitFullNames({ text: '전북 현대 모터스 FC서울' }, k), { home: 'FC서울', away: '전북 현대 모터스' });
  const b = { league: 'kbo', home: 'Samsung Lions', away: 'Kia Tigers' };
  assert.deepEqual(splitFullNames({ text: 'KIA 타이거즈 삼성 라이온즈' }, b), { home: '삼성 라이온즈', away: 'KIA 타이거즈' });
});
test('split_impossible_gives_nulls', () => {
  const g = { league: 'kbl', home: '서울 삼성', away: '부산 KCC' };
  assert.deepEqual(splitFullNames({ text: '서울 삼성 썬더스' }, g), { home: null, away: null });
  assert.deepEqual(splitFullNames({ text: 'x' }, { league: 'kbl', home: '없는 팀', away: '부산 KCC' }), { home: null, away: null });
});

test('aliases_cover_every_team_seen_in_fixtures', () => {
  const need = {
    kbl: ['naver-kbl.html', ['서울 삼성', '서울 SK', '고양 소노', '부산 KCC', '창원 LG', '대구 한국가스공사', '안양 정관장', '울산 현대모비스', '원주 DB', '수원 KT']],
    kl1: ['naver-kl1.html', ['전북', '제주', '대전', '광주', '서울', '김천', '울산', '부천', '포항', '안양', '강원', '인천']],
    wkbl: ['naver-wkbl.html', ['청주 KB스타즈', 'BNK 썸', '용인 삼성생명', '부천 하나은행', '인천 신한은행', '우리은행']],
    vm: ['naver-vm.html', ['한국전력', '우리카드', '삼성화재', 'OK저축은행', '현대캐피탈', 'KB손해보험', '대한항공']],
  };
  for (const [league, [file, teams]] of Object.entries(need)) {
    const text = parseNaverSchedule(fixture(file)).map(x => x.text).join('\n');
    for (const t of teams) {
      const tok = ALIASES[league][t];
      assert.ok(tok, `${league} ${t} 별칭 없음`);
      assert.ok(text.includes(tok), `${league} ${t} → ${tok} 가 fixture 에 없음`);
    }
  }
  assert.equal(Object.keys(ALIASES.kbo).length, 10);
  assert.deepEqual(Object.keys(ALIASES).sort(), Object.keys(LEAGUES).sort());
});

/* 가짜 시계: sleep 은 시계만 앞으로 돌린다 (실제로 기다리지 않는다). */
function fakeClock() {
  const c = { t: 1_000_000, now: () => c.t, sleep: async (ms) => { c.t += ms; } };
  return c;
}

test('fetch_merges_queries_and_dedupes', async () => {
  resetNaverThrottle();
  const clock = fakeClock();
  const calls = [];
  const pages = {
    '프로야구 일정': fixture('naver-kbo.html'),
    '프로야구 와일드카드 일정': fixture('naver-kbo-와일드카드.html'),
    '프로야구 준플레이오프 일정': fixture('naver-kbo-준플레이오프.html'),
    '프로야구 플레이오프 일정': fixture('naver-kbo.html'),      // 같은 한국시리즈 탭이 또 나와도 한 번만
    '프로야구 한국시리즈 일정': fixture('naver-kbo.html'),
  };
  const fake = async (url, init) => {
    const q = decodeURIComponent(new URL(url).searchParams.get('query'));
    calls.push({ q, t: clock.now(), ua: init?.headers?.['User-Agent'] });
    return { ok: true, status: 200, text: async () => pages[q] };
  };
  const e = await fetchNaverEntries('kbo', fake, clock);
  assert.deepEqual(calls.map(c => c.q), LEAGUES.kbo.naverQueries);
  assert.ok(calls.every(c => /Chrome/.test(c.ua)));
  for (let i = 1; i < calls.length; i++) assert.ok(calls[i].t - calls[i - 1].t >= 700, '요청 간격 700ms');
  assert.equal(e.length, 5 + 1 + 3);
  assert.equal(new Set(e.map(x => x.query)).size, e.length);
});
test('fetch_gap_holds_across_consecutive_calls', async () => {
  resetNaverThrottle();
  const clock = fakeClock();
  const times = [];
  const fake = async () => { times.push(clock.now()); return { ok: true, status: 200, text: async () => fixture('naver-kl1.html') }; };
  await fetchNaverEntries('kl1', fake, clock);     // 질의어 1개짜리 리그를 연달아
  await fetchNaverEntries('kbl', fake, clock);
  assert.equal(times.length, 2);
  assert.ok(times[1] - times[0] >= 700, '호출 사이에도 700ms');
});
test('fetch_http_error_throws', async () => {
  resetNaverThrottle();
  await assert.rejects(() => fetchNaverEntries('kl1', async () => ({ ok: false, status: 503, text: async () => '' }), fakeClock()), /503/);
});
