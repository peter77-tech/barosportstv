/* 내부 링크 표와 SportsEvent JSON-LD. 링크 주소는 이 표에서만 나온다 — AI 는 주소를 다루지 않는다 (§8). */
import { LEAGUES } from './config.mjs';

const SITE = 'https://barosportstv.com/';
const MAX_NON_REVIEW = 4;      // 리뷰 외 링크 상한 (§8)
const MAX_RELATED = 2;

/* 팀 페이지 표 — 사이트에 페이지가 있는 팀만 (§8). */
const TEAM_PAGES = { '삼성 라이온즈': 'samsung', '한화 이글스': 'hanwha' };

const RELAY_LABEL = { baseball: '야구 중계 보기', football: '축구 중계 보기', basketball: '농구 중계 보기', volleyball: '배구 중계 보기' };

/** 리뷰 외 링크를 표의 순서(리그 일정 → 팀 → 중계 → 가이드 → 경기일정)로 최대 4개, 이어서 관련 리뷰 최대 2개. */
export function internalLinks(facts, related = []) {
  const lg = LEAGUES[facts.league];
  const at = (slug) => `${SITE}${slug}/`;
  const out = [];
  if (lg.internal.scheduleSlug) out.push({ url: at(lg.internal.scheduleSlug), label: `${lg.titleName} 경기 일정` });
  for (const side of [facts.home, facts.away]) {
    const slug = TEAM_PAGES[side.name];
    if (slug) out.push({ url: at(slug), label: `${side.name} 경기 일정` });
  }
  if (lg.internal.relaySlug) out.push({ url: at(lg.internal.relaySlug), label: RELAY_LABEL[lg.sport] });
  if (lg.internal.guideSlug) out.push({ url: at(lg.internal.guideSlug), label: `${lg.titleName} 무료 시청 가이드` });
  out.push({ url: at('경기일정'), label: '오늘의 전체 경기 일정' });
  const rel = related
    .filter((r) => typeof r.url === 'string' && r.url.startsWith(SITE) && r.title)
    .slice(0, MAX_RELATED)
    .map((r) => ({ url: r.url, label: r.title }));
  return [...out.slice(0, MAX_NON_REVIEW), ...rel];
}

/** 경기 하나의 SportsEvent. Article·FAQ 스키마는 쓰지 않는다 (§3, §12). */
export function sportsEventJsonLd(facts) {
  const team = (s) => ({ '@type': 'SportsTeam', name: s.full ?? s.name });
  const home = team(facts.home);
  const away = team(facts.away);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${away.name} vs ${home.name}`,
    startDate: facts.date,
    sport: LEAGUES[facts.league].sport,
    homeTeam: home,
    awayTeam: away,
  };
  if (facts.venue) ld.location = { '@type': 'Place', name: facts.venue };
  return ld;
}
