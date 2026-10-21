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
function delete_option( $k ) { unset( $GLOBALS['opts'][ $k ] ); return true; }
function get_transient( $k ) { return get_option( '_t_' . $k ); }
function set_transient( $k, $v ) { return update_option( '_t_' . $k, $v ); }
function delete_transient( $k ) { return delete_option( '_t_' . $k ); }
function is_wp_error( $x ) { return false; }
function wp_remote_get( $url ) { return isset( $GLOBALS['remote'][ $url ] ) ? $GLOBALS['remote'][ $url ] : array( 404, '' ); }
function wp_remote_retrieve_response_code( $r ) { return $r[0]; }
function wp_remote_retrieve_body( $r ) { return $r[1]; }
if ( ! defined( 'MINUTE_IN_SECONDS' ) ) {
	define( 'MINUTE_IN_SECONDS', 60 );
}

require __DIR__ . '/../../wp-theme/barosportstv/inc/schedule-data.php';

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
check( 'refresh: 잠금이 풀린다', false === get_transient( 'bstv_schedule_lock' ) );

$before = $GLOBALS['opts'];
serve( array( '2026-10-22', '2026-10-23' ), '2026-10-23' );
check( 'refresh_all_or_nothing: 하루라도 깨지면 false', false === bstv_schedule_refresh() );
check( 'refresh_all_or_nothing: 옵션은 그대로', $before == $GLOBALS['opts'] );

$GLOBALS['remote'] = array();
check( 'refresh_all_or_nothing: 서버가 404 면 false', false === bstv_schedule_refresh() );
check( 'refresh_all_or_nothing: 그래도 옵션은 그대로', $before == $GLOBALS['opts'] );

/* ── refresh_prunes_old ───────────────────────────── */
serve( array( '2026-10-22', '2026-10-23' ) );
check( 'refresh_prunes_old: 성공', true === bstv_schedule_refresh() );
check( 'refresh_prunes_old: 지난 날짜 옵션 삭제', false === get_option( 'bstv_schedule_day_2026-10-21' ) );
check( 'refresh_prunes_old: 새 날짜 저장', is_array( bstv_schedule_day( '2026-10-23' ) ) );
check( 'meta: index 그대로', array( '2026-10-22', '2026-10-23' ) === bstv_schedule_meta()['days'] );
