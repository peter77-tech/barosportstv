<?php
/**
 * 테마 일정 화면의 순수 함수 테스트 (WordPress 없이 돈다).
 * 실행: npm run test:php   (= php tests/php/run.php)
 */
define( 'ABSPATH', __DIR__ );
require __DIR__ . '/../../wp-theme/barosportstv/inc/schedule-view.php';

$failed = 0;
$passed = 0;
function check( $name, $cond ) {
	global $failed, $passed;
	if ( $cond ) {
		$passed++;
		echo "✔ {$name}\n";
	} else {
		$failed++;
		echo "✖ {$name}\n";
	}
}

function row( $over = array() ) {
	return array_merge(
		array(
			'id' => '1', 'sport' => 'Baseball', 'league' => 'MLB', 'leagueLabel' => 'MLB',
			'slug' => 'mlb', 'tier' => 1, 'state' => 'upcoming', 'clock' => '19:05',
			'home' => '홈', 'away' => '원정', 'homeScore' => null, 'awayScore' => null,
			'kickoff' => '2026-10-21T10:05:00.000Z',
		),
		$over
	);
}

/* ── valid_day_rejects ─────────────────────────────── */
$good = array( 'date' => '2026-10-21', 'events' => array( row() ) );
check( 'valid_day: 정상 표본', bstv_schedule_valid_day( $good, '2026-10-21' ) );
check( 'valid_day: 빈 날도 정상', bstv_schedule_valid_day( array( 'date' => '2026-10-21', 'events' => array() ), '2026-10-21' ) );
check( 'valid_day_rejects: null', ! bstv_schedule_valid_day( null, '2026-10-21' ) );
check( 'valid_day_rejects: HTML 문자열', ! bstv_schedule_valid_day( '<html>', '2026-10-21' ) );
check( 'valid_day_rejects: 다른 날짜', ! bstv_schedule_valid_day( $good, '2026-10-22' ) );
check( 'valid_day_rejects: events 없음', ! bstv_schedule_valid_day( array( 'date' => '2026-10-21' ), '2026-10-21' ) );
check( 'valid_day_rejects: 모르는 state', ! bstv_schedule_valid_day( array( 'date' => '2026-10-21', 'events' => array( row( array( 'state' => 'weird' ) ) ) ), '2026-10-21' ) );
$missing = row();
unset( $missing['home'] );
check( 'valid_day_rejects: 필드 누락', ! bstv_schedule_valid_day( array( 'date' => '2026-10-21', 'events' => array( $missing ) ), '2026-10-21' ) );

check( 'valid_index: 정상', bstv_schedule_valid_index( array( 'generatedAt' => '2026-10-21T03:00:00.000Z', 'days' => array( '2026-10-21' ) ) ) );
check( 'valid_index: days 비면 거부', ! bstv_schedule_valid_index( array( 'generatedAt' => 'x', 'days' => array() ) ) );
check( 'valid_index: 날짜 형식 거부', ! bstv_schedule_valid_index( array( 'generatedAt' => 'x', 'days' => array( '../etc' ) ) ) );

/* ── filter_top_empty ──────────────────────────────── */
$rows = array( row( array( 'id' => 'a', 'tier' => 2, 'slug' => 'mlb' ) ), row( array( 'id' => 'b', 'tier' => 3, 'slug' => 'nba' ) ) );
check( 'filter_top_empty: 1군이 없으면 빈 목록', array() === bstv_schedule_filter( $rows, 'top' ) );
check( 'filter: all 은 전부', 2 === count( bstv_schedule_filter( $rows, 'all' ) ) );
$mlb = bstv_schedule_filter( $rows, 'mlb' );
check( 'filter: slug 일치만', 1 === count( $mlb ) && 'a' === $mlb[0]['id'] );

/* ── sanitize_request ──────────────────────────────── */
$days    = array( '2026-10-21', '2026-10-22', '2026-10-23' );
$leagues = array_keys( BSTV_SCHEDULE_LEAGUES );
check(
	'sanitize_request: 이상한 값은 기본값',
	array( 'd' => '2026-10-21', 'l' => 'top', 'p' => 1 ) === bstv_schedule_sanitize_request( array( 'd' => '1999-01-01', 'l' => '<script>', 'pg' => '-3' ), $days, $leagues, '2026-10-21' )
);
check(
	'sanitize_request: 정상 값은 그대로 (쪽은 ?pg= — ?p= 는 WordPress 의 글 ID 다)',
	array( 'd' => '2026-10-22', 'l' => 'nba', 'p' => 2 ) === bstv_schedule_sanitize_request( array( 'd' => '2026-10-22', 'l' => 'nba', 'pg' => '2' ), $days, $leagues, '2026-10-21' )
);
check(
	'sanitize_request: ?p= 는 쪽 번호로 읽지 않는다',
	1 === bstv_schedule_sanitize_request( array( 'p' => '2' ), $days, $leagues, '2026-10-21' )['p']
);
check(
	'sanitize_request: 오늘이 목록에 없으면 첫 날',
	'2026-10-21' === bstv_schedule_sanitize_request( array(), $days, $leagues, '2026-10-30' )['d']
);
check(
	'sanitize_request: 배열로 온 값도 기본값',
	array( 'd' => '2026-10-21', 'l' => 'top', 'p' => 1 ) === bstv_schedule_sanitize_request( array( 'd' => array( 'x' ), 'l' => array( 'y' ), 'pg' => array( 1 ) ), $days, $leagues, '2026-10-21' )
);

/* ── page ──────────────────────────────────────────── */
$many = array_fill( 0, 301, row() );
$p1   = bstv_schedule_page( $many, 1 );
check( 'page: 301행은 3쪽', 3 === $p1['pages'] && 150 === count( $p1['rows'] ) );
$p9 = bstv_schedule_page( $many, 9 );
check( 'page: 넘친 쪽은 마지막 쪽', 3 === $p9['page'] && 1 === count( $p9['rows'] ) );
$p0 = bstv_schedule_page( array(), 1 );
check( 'page: 빈 목록은 1쪽', 1 === $p0['pages'] && array() === $p0['rows'] );

/* ── is_stale ──────────────────────────────────────── */
$now = strtotime( '2026-10-21T05:00:00Z' );
check( 'is_stale: 2시간 1초 전', bstv_schedule_is_stale( gmdate( 'Y-m-d\TH:i:s.000\Z', $now - 7201 ), $now ) );
check( 'is_stale: 1시간 전은 아님', ! bstv_schedule_is_stale( gmdate( 'Y-m-d\TH:i:s.000\Z', $now - 3600 ), $now ) );
check( 'is_stale: 해석 불가', bstv_schedule_is_stale( 'garbage', $now ) );

/* ── day_label ─────────────────────────────────────── */
check( 'day_label: 오늘', '오늘' === bstv_schedule_day_label( '2026-10-21', '2026-10-21' ) );
check( 'day_label: 내일', '내일' === bstv_schedule_day_label( '2026-10-22', '2026-10-21' ) );
check( 'day_label: 요일', '토' === bstv_schedule_day_label( '2026-10-24', '2026-10-21' ) );

/* ── kst_today · visible_days ──────────────────────── */
check( 'kst_today: UTC 15:30 은 한국 다음 날', '2026-10-22' === bstv_schedule_kst_today( strtotime( '2026-10-21T15:30:00Z' ) ) );
check( 'kst_today: UTC 14:59 는 같은 날', '2026-10-21' === bstv_schedule_kst_today( strtotime( '2026-10-21T14:59:00Z' ) ) );
check( 'visible_days: 지난 날짜는 뺀다', array( '2026-10-21', '2026-10-22' ) === bstv_schedule_visible_days( array( '2026-10-20', '2026-10-21', '2026-10-22' ), '2026-10-21' ) );
check( 'visible_days: 전부 지났으면 그대로 둔다(오래됨 안내와 함께 보여 준다)', array( '2026-10-18', '2026-10-19' ) === bstv_schedule_visible_days( array( '2026-10-18', '2026-10-19' ), '2026-10-21' ) );

/* ── jsonld ────────────────────────────────────────── */
$list = array();
for ( $i = 0; $i < 120; $i++ ) {
	$list[] = row( array( 'id' => (string) $i, 'kickoff' => 0 === $i ? null : '2026-10-21T10:05:00.000Z' ) );
}
$ld = bstv_schedule_jsonld( $list, 'https://barosportstv.com/x/' );
check( 'jsonld: ItemList', 'ItemList' === $ld['@type'] );
check( 'jsonld: 최대 100건', 100 === count( $ld['itemListElement'] ) );
check( 'jsonld: SportsEvent', 'SportsEvent' === $ld['itemListElement'][0]['item']['@type'] );
check( 'jsonld: kickoff 없는 행 제외', '홈 vs 원정' === $ld['itemListElement'][0]['item']['name'] && '2026-10-21T10:05:00.000Z' === $ld['itemListElement'][0]['item']['startDate'] );

/* ── template_globals ──────────────────────────────────
 * 페이지 템플릿은 WordPress 가 전역 범위에서 include 한다. 거기서 $page 같은 이름을 쓰면
 * the_post() → setup_postdata() 가 덮어써 목록이 통째로 사라진다(검토에서 실제로 잡힌 결함). */
$reserved = array( 'page', 'pages', 'post', 'posts', 'more', 'numpages', 'multipage', 'wp_query', 'wp', 'id', 'authordata', 'currentday', 'currentmonth', 'paged', 'year', 'name', 'order', 's', 'm', 'p', 'w', 'cat', 'tag', 'day' );
foreach ( array( 'page-templates/schedule.php', 'template-parts/schedule-row.php' ) as $tpl ) {
	$src = file_get_contents( __DIR__ . '/../../wp-theme/barosportstv/' . $tpl );
	preg_match_all( '/\$([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/', $src, $m );
	$hit = array_values( array_intersect( array_unique( $m[1] ), $reserved ) );
	check( "template_globals: {$tpl} 가 WordPress 전역 이름에 쓰지 않는다" . ( $hit ? ' (' . implode( ',', $hit ) . ')' : '' ), ! $hit );
}

/* ── 경기 리뷰 JSON-LD 태그 ─────────────────────────── */
require __DIR__ . '/../../wp-theme/barosportstv/inc/review.php';
$ld  = '{"@type":"SportsEvent","name":"A vs B","description":"</script><b>"}';
$tag = bstv_review_jsonld_tag( $ld );
check( 'jsonld_tag: 올바른 JSON 은 script 로 감싼다', 0 === strpos( $tag, '<script type="application/ld+json">' ) && '</script>' === substr( $tag, -9 ) );
check( 'jsonld_tag: 본문의 </ 는 <\/ 로 바꾼다', 1 === substr_count( $tag, '</' ) && false !== strpos( $tag, '<\/script><b>' ) );
$inner = substr( $tag, strlen( '<script type="application/ld+json">' ), -strlen( '</script>' ) );
check( 'jsonld_tag: 바꾼 뒤에도 JSON 내용이 같다', json_decode( $inner, true ) === json_decode( $ld, true ) );
check( 'jsonld_tag: 깨진 JSON 은 빈 문자열', '' === bstv_review_jsonld_tag( '{"a":' ) );
check( 'jsonld_tag: 빈 값은 빈 문자열', '' === bstv_review_jsonld_tag( '' ) && '' === bstv_review_jsonld_tag( '   ' ) );
check( 'jsonld_tag: 객체가 아닌 JSON 은 빈 문자열', '' === bstv_review_jsonld_tag( '"x"' ) && '' === bstv_review_jsonld_tag( '12' ) && '' === bstv_review_jsonld_tag( 'null' ) );

/* ── 데이터 받기·저장 (WordPress 스텁) ─────────────── */
require __DIR__ . '/data.php';

echo "\npass {$passed} · fail {$failed}\n";
exit( $failed ? 1 : 0 );
