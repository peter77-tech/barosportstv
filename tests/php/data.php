<?php
/**
 * schedule-data.php — WordPress 함수를 메모리 스텁으로 바꿔 「전부 아니면 그대로」 규칙을 확인한다.
 * run.php 가 끝에서 불러 같은 check() 로 센다.
 */

$GLOBALS['opts']   = array();
$GLOBALS['remote'] = array();   // url => array( code, body )

function add_filter() {}
function add_action() {}
function apply_filters( $tag, $value ) { return $value; }
function trailingslashit( $s ) { return rtrim( $s, '/' ) . '/'; }
function get_option( $k ) { return isset( $GLOBALS['opts'][ $k ] ) ? $GLOBALS['opts'][ $k ] : false; }
function update_option( $k, $v ) { $GLOBALS['opts'][ $k ] = $v; return true; }
// 실제 add_option 은 INSERT 라 이미 있으면 실패한다 — 원자적 잠금이 이 성질에 기댄다
function add_option( $k, $v ) { if ( isset( $GLOBALS['opts'][ $k ] ) ) { return false; } $GLOBALS['opts'][ $k ] = $v; return true; }
function delete_option( $k ) { unset( $GLOBALS['opts'][ $k ] ); return true; }
function get_transient( $k ) { return get_option( '_t_' . $k ); }
function set_transient( $k, $v ) { return update_option( '_t_' . $k, $v ); }
function delete_transient( $k ) { return delete_option( '_t_' . $k ); }
function is_wp_error( $x ) { return false; }
$GLOBALS['calls'] = 0;
function wp_remote_get( $url ) { $GLOBALS['calls']++; return isset( $GLOBALS['remote'][ $url ] ) ? $GLOBALS['remote'][ $url ] : array( 404, '' ); }
function wp_remote_retrieve_response_code( $r ) { return $r[0]; }
function wp_remote_retrieve_body( $r ) { return $r[1]; }
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}

require __DIR__ . '/../../wp-theme/barosportstv/inc/schedule-data.php';

/* 일정 데이터 옵션만 (실패 표시·잠금 같은 운영용 값은 뺀다) */
function data_opts() {
	return array_filter( $GLOBALS['opts'], function ( $k ) {
		return 0 === strpos( $k, 'bstv_schedule_day_' ) || 'bstv_schedule_meta' === $k;
	}, ARRAY_FILTER_USE_KEY );
}

function serve( array $days, $broken = null ) {
	$GLOBALS['remote'] = array();
	$base              = BSTV_SCHEDULE_SOURCE;
	$GLOBALS['remote'][ $base . 'index.json' ] = array( 200, json_encode( array( 'generatedAt' => '2026-10-21T03:00:00.000Z', 'timezone' => 'Asia/Seoul', 'days' => $days ) ) );
	foreach ( $days as $d ) {
		$body = $d === $broken ? '<html>오류</html>' : json_encode( array( 'date' => $d, 'events' => array( row() ) ) );
		$GLOBALS['remote'][ $base . 'day-' . $d . '.json' ] = array( 200, $body );
	}
}

/* ── refresh_all_or_nothing ───────────────────────── */
serve( array( '2026-10-21', '2026-10-22' ) );
check( 'refresh: 정상이면 true', true === bstv_schedule_refresh() );
check( 'refresh: 날짜 옵션 저장', is_array( bstv_schedule_day( '2026-10-22' ) ) );
check( 'refresh: 잠금이 풀린다', false === get_option( 'bstv_schedule_lock' ) );

$before = data_opts();
serve( array( '2026-10-22', '2026-10-23' ), '2026-10-23' );
check( 'refresh_all_or_nothing: 하루라도 깨지면 false', false === bstv_schedule_refresh() );
check( 'refresh_all_or_nothing: 데이터 옵션은 그대로', $before == data_opts() );

$GLOBALS['remote'] = array();
check( 'refresh_all_or_nothing: 서버가 404 면 false', false === bstv_schedule_refresh() );
check( 'refresh_all_or_nothing: 그래도 데이터 옵션은 그대로', $before == data_opts() );

/* ── refresh_prunes_old ───────────────────────────── */
serve( array( '2026-10-22', '2026-10-23' ) );
check( 'refresh_prunes_old: 성공', true === bstv_schedule_refresh() );
check( 'refresh_prunes_old: 지난 날짜 옵션 삭제', false === get_option( 'bstv_schedule_day_2026-10-21' ) );
check( 'refresh_prunes_old: 새 날짜 저장', is_array( bstv_schedule_day( '2026-10-23' ) ) );
check( 'meta: index 그대로', array( '2026-10-22', '2026-10-23' ) === bstv_schedule_meta()['days'] );

/* ── refresh_lock (원자적 잠금) ───────────────────── */
serve( array( '2026-10-23', '2026-10-24' ) );
update_option( 'bstv_schedule_lock', 'other|' . time() );
$before = $GLOBALS['opts'];
check( 'refresh_lock: 다른 실행이 잡고 있으면 false', false === bstv_schedule_refresh() );
check( 'refresh_lock: 남의 잠금과 데이터는 그대로', $before == $GLOBALS['opts'] );

update_option( 'bstv_schedule_lock', 'other|' . ( time() - 300 ) );
check( 'refresh_lock: 오래된 잠금(120초 초과)은 넘어간다', true === bstv_schedule_refresh() );
check( 'refresh_lock: 끝나면 잠금이 남지 않는다', false === get_option( 'bstv_schedule_lock' ) );

/* ── ensure_backoff (첫 받기 실패 후 방문자 재시도 막기) ── */
$GLOBALS['opts']   = array();
$GLOBALS['remote'] = array();
$GLOBALS['calls']  = 0;
bstv_schedule_ensure();
$first = $GLOBALS['calls'];
check( 'ensure_backoff: 실패하면 실패 표시를 남긴다', false !== get_transient( 'bstv_schedule_fail' ) );
bstv_schedule_ensure();
check( 'ensure_backoff: 실패 표시가 있는 동안 방문자 경로는 다시 받지 않는다', $first === $GLOBALS['calls'] );
bstv_schedule_refresh();
check( 'ensure_backoff: 크론 경로(refresh)는 실패 표시를 무시한다', $GLOBALS['calls'] > $first );
serve( array( '2026-10-23' ) );
check( 'ensure_backoff: 성공하면 실패 표시를 지운다', true === bstv_schedule_refresh() && false === get_transient( 'bstv_schedule_fail' ) );
