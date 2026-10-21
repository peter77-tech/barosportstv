<?php
/**
 * 경기 일정 — 데이터 받기·저장
 *
 * 데이터는 GitHub Actions 프리베이크가 30분마다 GitHub Pages 에 굽는다(data/wp/).
 * 이 파일은 그것을 10분마다 받아 옵션에 넣어 둔다. 화면은 옵션만 읽는다 —
 * 방문자 요청이 GitHub 응답을 기다리지 않게 하기 위해서다.
 *
 * ⚠️ 받은 것이 하나라도 이상하면 **아무것도 바꾸지 않는다.** 마지막으로 받은
 *   정상 데이터를 계속 보여 주는 편이 빈 화면이나 반쪽 화면보다 낫다.
 *   오래된 정도는 화면이 generatedAt 으로 판단해 알린다(schedule-view.php).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BSTV_SCHEDULE_SOURCE', 'https://peter77-tech.github.io/barosportstv/data/wp/' );
define( 'BSTV_SCHEDULE_EVENT', 'bstv_schedule_refresh_event' );

function bstv_schedule_source() {
	return trailingslashit( apply_filters( 'bstv_schedule_source', BSTV_SCHEDULE_SOURCE ) );
}

/**
 * JSON 하나를 받는다. 실패하면 null.
 */
function bstv_schedule_fetch_json( $url ) {
	$res = wp_remote_get( $url, array( 'timeout' => 5 ) );
	if ( is_wp_error( $res ) || 200 !== (int) wp_remote_retrieve_response_code( $res ) ) {
		return null;
	}
	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	return is_array( $data ) ? $data : null;
}

/**
 * index 와 5일치를 모두 받아, 전부 정상일 때만 한꺼번에 바꾼다.
 */
function bstv_schedule_refresh() {
	// 크론과 첫 방문이 겹쳐도 한 번만 받는다
	if ( get_transient( 'bstv_schedule_lock' ) ) {
		return false;
	}
	set_transient( 'bstv_schedule_lock', 1, MINUTE_IN_SECONDS );

	try {
		$base  = bstv_schedule_source();
		$index = bstv_schedule_fetch_json( $base . 'index.json' );
		if ( ! bstv_schedule_valid_index( $index ) ) {
			return false;
		}

		$days = array();
		foreach ( $index['days'] as $date ) {
			$day = bstv_schedule_fetch_json( $base . 'day-' . $date . '.json' );
			if ( ! bstv_schedule_valid_day( $day, $date ) ) {
				return false;
			}
			$days[ $date ] = $day;
		}

		$old = bstv_schedule_meta();
		foreach ( $days as $date => $day ) {
			update_option( 'bstv_schedule_day_' . $date, $day, false );
		}
		update_option( 'bstv_schedule_meta', $index, false );

		// 지난 날짜는 지운다 — 남겨 두면 옵션 테이블에 하루 수백 KB씩 쌓인다
		if ( $old && ! empty( $old['days'] ) ) {
			foreach ( array_diff( $old['days'], $index['days'] ) as $gone ) {
				delete_option( 'bstv_schedule_day_' . $gone );
			}
		}
		return true;
	} finally {
		delete_transient( 'bstv_schedule_lock' );
	}
}

function bstv_schedule_meta() {
	$meta = get_option( 'bstv_schedule_meta' );
	return bstv_schedule_valid_index( $meta ) ? $meta : null;
}

function bstv_schedule_day( $date ) {
	$day = get_option( 'bstv_schedule_day_' . $date );
	return bstv_schedule_valid_day( $day, $date ) ? $day : null;
}

/**
 * 한 번도 받은 적이 없으면 지금 받는다 (테마를 처음 켠 직후의 첫 방문).
 */
function bstv_schedule_ensure() {
	if ( ! bstv_schedule_meta() ) {
		bstv_schedule_refresh();
	}
}

/**
 * 크론 — 10분마다. 데이터는 30분마다 바뀌지만 그 회차를 늦게 집으면
 * 최대 30분이 더 늦어지므로 더 자주 본다(받는 양은 하루 1~2MB).
 */
function bstv_schedule_cron_interval( $schedules ) {
	$schedules['bstv_10min'] = array(
		'interval' => 10 * MINUTE_IN_SECONDS,
		'display'  => '10분마다 (경기 일정)',
	);
	return $schedules;
}
add_filter( 'cron_schedules', 'bstv_schedule_cron_interval' );

function bstv_schedule_cron_register() {
	if ( ! wp_next_scheduled( BSTV_SCHEDULE_EVENT ) ) {
		wp_schedule_event( time(), 'bstv_10min', BSTV_SCHEDULE_EVENT );
	}
}
add_action( 'init', 'bstv_schedule_cron_register' );
add_action( BSTV_SCHEDULE_EVENT, 'bstv_schedule_refresh' );

/**
 * 다른 테마로 바꾸면 예약을 지운다 — 남겨 두면 함수가 없는 크론이 계속 돈다.
 */
function bstv_schedule_cron_clear() {
	wp_clear_scheduled_hook( BSTV_SCHEDULE_EVENT );
}
add_action( 'switch_theme', 'bstv_schedule_cron_clear' );
