<?php
/**
 * 경기 일정 — 페이지 연결 (템플릿 「경기 일정」 이 쓰는 것)
 *
 * 한 요청 안에서 화면 계산을 한 번만 한다. 템플릿 본문과 <head> 의 JSON-LD 가
 * 같은 결과를 봐야 「화면에 그린 경기만 구조화 데이터로」 가 지켜진다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BSTV_SCHEDULE_TEMPLATE', 'page-templates/schedule.php' );

function bstv_is_schedule_page() {
	return is_page_template( BSTV_SCHEDULE_TEMPLATE );
}

/**
 * 지금 요청의 화면 상태.
 *
 * @return array{has_data:bool,stale:bool,generated:string,today:string,days:array,req:array,total:int,page:array,live:int}
 */
function bstv_schedule_context() {
	static $ctx = null;
	if ( null !== $ctx ) {
		return $ctx;
	}

	$now   = time();
	$today = bstv_schedule_kst_today( $now );
	$meta  = bstv_schedule_meta();
	$days  = $meta ? bstv_schedule_visible_days( $meta['days'], $today ) : array();
	$req   = bstv_schedule_sanitize_request( wp_unslash( $_GET ), $days, array_keys( BSTV_SCHEDULE_LEAGUES ), $today ); // phpcs:ignore WordPress.Security.NonceVerification -- 읽기 전용 필터

	$day      = $meta ? bstv_schedule_day( $req['d'] ) : null;
	$filtered = $day ? bstv_schedule_filter( $day['events'], $req['l'] ) : array();
	$stale    = $meta ? bstv_schedule_is_stale( $meta['generatedAt'], $now ) : true;

	$live = 0;
	foreach ( $filtered as $ev ) {
		if ( 'live' === $ev['state'] ) {
			$live++;
		}
	}

	$ctx = array(
		'has_data'  => (bool) $day,
		'stale'     => $stale,
		'generated' => $meta ? gmdate( 'm.d H:i', strtotime( $meta['generatedAt'] ) + 9 * 3600 ) : '',
		'today'     => $today,
		'days'      => $days,
		'req'       => $req,
		'total'     => count( $filtered ),
		'page'      => bstv_schedule_page( $filtered, $req['p'] ),
		'live'      => $stale ? 0 : $live,
	);
	return $ctx;
}

/**
 * 칩·쪽 링크. 기본값과 같아도 명시한다 — 링크마다 주소가 하나로 정해져야 캐시·공유가 단순하다.
 */
function bstv_schedule_url( $d, $l, $pg = 1 ) {
	$args = array( 'd' => $d, 'l' => $l );
	if ( $pg > 1 ) {
		$args['pg'] = $pg;
	}
	return add_query_arg( $args, get_permalink() );
}

/**
 * 이 페이지는 페이지 캐시에 넣지 않는다. 점수가 30분마다 바뀌는데 캐시가
 * 그보다 오래 붙잡으면 끝난 경기가 「진행 중」 으로 남는다.
 * 데이터는 이미 옵션에 있어 그리는 비용이 작다.
 */
function bstv_schedule_template_redirect() {
	if ( ! bstv_is_schedule_page() ) {
		return;
	}
	if ( ! defined( 'DONOTCACHEPAGE' ) ) {
		define( 'DONOTCACHEPAGE', true );   // Breeze 등 페이지 캐시 플러그인
	}
	nocache_headers();                       // Varnish·브라우저
	bstv_schedule_ensure();
}
add_action( 'template_redirect', 'bstv_schedule_template_redirect' );

/**
 * 구조화 데이터 — 화면에 그린 경기만. 데이터가 오래됐으면 내보내지 않는다
 * (검색엔진에 틀린 상태를 알리지 않기 위해).
 */
function bstv_schedule_head_jsonld() {
	if ( ! bstv_is_schedule_page() ) {
		return;
	}
	$ctx = bstv_schedule_context();
	if ( $ctx['stale'] || ! $ctx['page']['rows'] ) {
		return;
	}
	$ld = bstv_schedule_jsonld( $ctx['page']['rows'], get_permalink() );
	// JSON_HEX_TAG — 팀 이름에 </script> 가 섞여 와도 태그 밖으로 나가지 못하게 한다
	echo '<script type="application/ld+json">' . wp_json_encode( $ld, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ) . "</script>\n";
}
add_action( 'wp_head', 'bstv_schedule_head_jsonld' );
