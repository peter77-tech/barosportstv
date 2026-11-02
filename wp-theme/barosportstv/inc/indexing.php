<?php
/**
 * 색인 정책 — 경기 리뷰 글만 검색엔진에 연다.
 *
 * 왜 — 중계 안내·종목 소개 페이지는 지금 색인되면 득보다 실이 많다(BD 결정 2026-11-02).
 * 공식 기록으로 만든 경기 리뷰만 연다. 나머지는 noindex 지만 follow 로 두어,
 * 검색엔진이 좌측 메뉴 등의 링크를 따라 리뷰까지는 찾아가게 한다.
 *
 * 🔴 「설정 → 읽기 → 검색 엔진 차단」(blog_public = 0)이 켜져 있는 동안에는 아무것도 바꾸지 않는다.
 *    Rank Math 는 차단 설정으로 noindex 를 강제한 **뒤에** rank_math/frontend/robots 를 부르므로,
 *    이 조건이 없으면 테마를 올리는 순간 리뷰가 열린다 (Rank Math class-paper.php get_robots 확인).
 *
 * 순수 함수 3개는 WordPress 없이 tests/php/run.php 가 검사한다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Rank Math robots 배열(키 index·follow 등)을 정책에 맞게 고친다.
 *
 * 리뷰는 Rank Math 값을 그대로 둔다 — 글마다 직접 건 noindex 를 존중한다.
 */
function bstv_index_robots( array $robots, $site_public, $is_review ) {
	if ( ! $site_public || $is_review ) {
		return $robots;
	}
	$robots['index']  = 'noindex';
	$robots['follow'] = 'follow';
	return $robots;
}

/**
 * 사이트맵 — post 외의 글 유형(page 등)은 뺀다. post 는 아래 항목 필터가 리뷰만 남긴다.
 */
function bstv_index_sitemap_exclude_type( $exclude, $type ) {
	return 'post' === $type ? $exclude : true;
}

/**
 * 사이트맵 항목 — 리뷰가 아니면 false(Rank Math 는 빈 값이면 그 글을 건너뛴다).
 */
function bstv_index_sitemap_entry( $url, $is_review ) {
	return $is_review ? $url : false;
}

/**
 * sitemap/entry 가 넘기는 글 객체에서 ID 를 꺼낸다. 없으면 0.
 *
 * 🔴 Rank Math 는 WP_Post 가 아니라 $wpdb 로 읽은 DB 행(stdClass)을 넘긴다 — instanceof WP_Post 로
 *    거르면 리뷰까지 전부 빠져 post-sitemap.xml 이 404 가 된다(2026-11-02 실서버, 0.4.1).
 */
function bstv_index_post_id( $object ) {
	return is_object( $object ) && isset( $object->ID ) ? (int) $object->ID : 0;
}

/* ── WordPress 연결 ─────────────────────────────── */

if ( function_exists( 'add_filter' ) ) {
	add_filter(
		'rank_math/frontend/robots',
		function ( $robots ) {
			return bstv_index_robots( (array) $robots, '1' === (string) get_option( 'blog_public' ), bstv_is_review_post() );
		}
	);
	/* 사이트맵 캐시를 파일 대신 DB(transient)에 둔다. 2026-11-02 실측: 글 저장·사이트맵 설정 변경 뒤에도
	   uploads/rank-math/ 의 옛 사이트맵이 계속 나왔다(파일 캐시는 만료가 없고, 삭제가 실패하면 영영 남는다). */
	add_filter(
		'rank_math/sitemap/cache_mode',
		function () {
			return 'db';
		}
	);
	add_filter( 'rank_math/sitemap/exclude_post_type', 'bstv_index_sitemap_exclude_type', 10, 2 );
	// 카테고리·태그 목록 페이지는 noindex 이므로 사이트맵에서도 뺀다
	add_filter( 'rank_math/sitemap/exclude_taxonomy', '__return_true' );
	add_filter(
		'rank_math/sitemap/entry',
		function ( $url, $type, $object ) {
			if ( 'post' !== $type ) {
				return $url;
			}
			$id = bstv_index_post_id( $object );
			return bstv_index_sitemap_entry( $url, $id > 0 && has_category( 'match-review', $id ) );
		},
		10,
		3
	);
}
