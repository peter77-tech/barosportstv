<?php
/**
 * 경기 일정 — 화면 계산 (순수 함수)
 *
 * 여기 있는 함수는 WordPress 함수를 부르지 않는다. 그래서 WordPress 없이
 * tests/php/run.php 로 테스트한다. 데이터를 받고 저장하는 쪽은 schedule-data.php 다.
 *
 * ⚠️ 경기 판정(상태·시각·한글 팀명·리그 등급·정렬)은 여기서 하지 않는다.
 *   프리베이크(tools/lib/wpschedule.mjs)가 정적 사이트의 data.js 를 그대로 돌려
 *   결과만 보내 준다. 여기에 규칙을 한 벌 더 만들면 반드시 어긋난다.
 *   유일한 예외가 리그 칩 필터 3줄인데, assets/app.js 의 matches() 와 똑같이 둔다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 리그 칩 — 정적 사이트 schedule.html 과 같은 순서.
 * F1 은 프리베이크가 굽는 종목(축구·농구·야구·미식축구)에 없어 뺐다.
 */
if ( ! defined( 'BSTV_SCHEDULE_LEAGUES' ) ) {
	define(
		'BSTV_SCHEDULE_LEAGUES',
		array(
			'top'            => '주요 리그',
			'all'            => '전체',
			'premier-league' => 'Premier League',
			'la-liga'        => 'La Liga',
			'nba'            => 'NBA',
			'mlb'            => 'MLB',
			'k-league'       => 'K-League',
			'nfl'            => 'NFL',
		)
	);
}

define( 'BSTV_SCHEDULE_PER_PAGE', 150 );
define( 'BSTV_SCHEDULE_STALE_SECONDS', 7200 );   // 2시간 — 30분 회차가 네 번 연속 빠진 것
define( 'BSTV_SCHEDULE_JSONLD_MAX', 100 );

function bstv_schedule_is_date_key( $value ) {
	return is_string( $value ) && 1 === preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value );
}

/**
 * index.json 이 쓸 만한가.
 */
function bstv_schedule_valid_index( $data ) {
	if ( ! is_array( $data ) || ! isset( $data['generatedAt'], $data['days'] ) ) {
		return false;
	}
	if ( ! is_string( $data['generatedAt'] ) || ! is_array( $data['days'] ) || ! $data['days'] ) {
		return false;
	}
	foreach ( $data['days'] as $day ) {
		if ( ! bstv_schedule_is_date_key( $day ) ) {
			return false;
		}
	}
	return true;
}

/**
 * day-YYYY-MM-DD.json 이 쓸 만한가. 하나라도 어긋나면 통째로 버린다 —
 * 반쯤 맞는 데이터로 화면을 그리면 빈 칸이 섞여 사실처럼 보인다.
 */
function bstv_schedule_valid_day( $data, $date ) {
	if ( ! is_array( $data ) || ! isset( $data['date'] ) || $data['date'] !== $date ) {
		return false;
	}
	if ( ! isset( $data['events'] ) || ! is_array( $data['events'] ) ) {
		return false;
	}
	$states = array( 'live', 'upcoming', 'postponed', 'finished' );
	foreach ( $data['events'] as $ev ) {
		if ( ! is_array( $ev ) ) {
			return false;
		}
		foreach ( array( 'id', 'league', 'slug', 'tier', 'state', 'clock', 'home', 'away' ) as $key ) {
			if ( ! array_key_exists( $key, $ev ) ) {
				return false;
			}
		}
		if ( ! in_array( $ev['state'], $states, true ) ) {
			return false;
		}
	}
	return true;
}

/**
 * 리그 칩 판정 — assets/app.js 의 matches() 와 같다.
 */
function bstv_schedule_filter( array $events, $league ) {
	if ( 'all' === $league ) {
		return array_values( $events );
	}
	$out = array();
	foreach ( $events as $ev ) {
		$hit = ( 'top' === $league ) ? ( 1 === (int) $ev['tier'] ) : ( $ev['slug'] === $league );
		if ( $hit ) {
			$out[] = $ev;
		}
	}
	return $out;
}

/**
 * 쿼리 문자열을 믿지 않는다. 목록에 없는 값은 전부 기본값으로 돌린다.
 */
function bstv_schedule_sanitize_request( array $get, array $days, array $leagues, $today ) {
	$d = isset( $get['d'] ) && is_string( $get['d'] ) ? $get['d'] : '';
	if ( ! in_array( $d, $days, true ) ) {
		$d = in_array( $today, $days, true ) ? $today : ( $days ? $days[0] : $today );
	}

	$l = isset( $get['l'] ) && is_string( $get['l'] ) ? $get['l'] : '';
	if ( ! in_array( $l, $leagues, true ) ) {
		$l = 'top';
	}

	$p = isset( $get['p'] ) && is_string( $get['p'] ) && ctype_digit( $get['p'] ) ? (int) $get['p'] : 1;
	if ( $p < 1 ) {
		$p = 1;
	}

	return array( 'd' => $d, 'l' => $l, 'p' => $p );
}

/**
 * 쪽 나눔. 넘친 쪽 번호는 마지막 쪽으로 붙인다.
 */
function bstv_schedule_page( array $rows, $page, $per = BSTV_SCHEDULE_PER_PAGE ) {
	$pages = max( 1, (int) ceil( count( $rows ) / $per ) );
	$page  = min( max( 1, (int) $page ), $pages );
	return array(
		'rows'  => array_slice( $rows, ( $page - 1 ) * $per, $per ),
		'page'  => $page,
		'pages' => $pages,
	);
}

/**
 * 데이터가 오래됐는가. 시각을 읽지 못해도 오래된 것으로 본다(안전한 쪽).
 */
function bstv_schedule_is_stale( $generated_at, $now, $max = BSTV_SCHEDULE_STALE_SECONDS ) {
	$t = strtotime( (string) $generated_at );
	if ( false === $t ) {
		return true;
	}
	return ( $now - $t ) > $max;
}

/**
 * 날짜 칩 라벨 — 오늘 · 내일 · 요일 한 글자.
 */
function bstv_schedule_day_label( $date, $today ) {
	$t    = strtotime( $date . 'T00:00:00Z' );
	$diff = (int) round( ( $t - strtotime( $today . 'T00:00:00Z' ) ) / 86400 );
	if ( 0 === $diff ) {
		return '오늘';
	}
	if ( 1 === $diff ) {
		return '내일';
	}
	$week = array( '일', '월', '화', '수', '목', '금', '토' );
	return $week[ (int) gmdate( 'w', $t ) ];
}

/**
 * 구조화 데이터 — 화면에 그린 실제 경기만. 시각을 모르는 경기는 넣지 않는다.
 */
function bstv_schedule_jsonld( array $rows, $page_url ) {
	$items = array();
	foreach ( $rows as $ev ) {
		if ( empty( $ev['kickoff'] ) ) {
			continue;
		}
		$items[] = array(
			'@type'    => 'ListItem',
			'position' => count( $items ) + 1,
			'item'     => array(
				'@type'     => 'SportsEvent',
				'name'      => $ev['home'] . ' vs ' . $ev['away'],
				'startDate' => $ev['kickoff'],
				'sport'     => isset( $ev['sport'] ) ? $ev['sport'] : '',
				'url'       => $page_url,
			),
		);
		if ( count( $items ) >= BSTV_SCHEDULE_JSONLD_MAX ) {
			break;
		}
	}
	return array(
		'@context'        => 'https://schema.org',
		'@type'           => 'ItemList',
		'itemListElement' => $items,
	);
}
