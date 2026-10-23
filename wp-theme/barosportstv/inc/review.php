<?php
/**
 * 경기 리뷰 글 — SportsEvent JSON-LD 출력과 스타일 적용 판정.
 *
 * 글 본문의 표·점수판·막대는 tools/review 가 `bstv-*` 클래스로 그려 보낸다.
 * 이 파일은 (1) 메타에 저장된 JSON-LD 를 wp_head 에 찍고, (2) 리뷰 글에서만 review.css 를 싣는다.
 * 순수 함수(bstv_review_jsonld_tag)는 WordPress 없이 tests/php/run.php 가 검사한다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * JSON 문자열을 <script type="application/ld+json"> 로 감싼다.
 *
 * 올바른 JSON 객체가 아니면 빈 문자열을 돌려준다(깨진 값을 페이지에 찍지 않는다).
 * 값 안의 `</` 는 `<\/` 로 바꿔 </script> 로 태그가 닫히는 일을 막는다 — JSON 에서 `\/` 는 `/` 와 같다.
 */
function bstv_review_jsonld_tag( $json ) {
	if ( ! is_string( $json ) || '' === trim( $json ) ) {
		return '';
	}
	$data = json_decode( $json, true );
	if ( ! is_array( $data ) ) {
		return '';
	}
	return '<script type="application/ld+json">' . str_replace( '</', '<\/', trim( $json ) ) . '</script>';
}

/**
 * 경기 리뷰 글인가? (카테고리 slug `match-review` 의 단일 글)
 */
function bstv_is_review_post() {
	return is_single() && has_category( 'match-review' );
}

/**
 * wp_head — 리뷰 글이면 SportsEvent JSON-LD 를 찍는다.
 */
function bstv_review_head() {
	if ( ! bstv_is_review_post() ) {
		return;
	}
	$tag = bstv_review_jsonld_tag( (string) get_post_meta( get_the_ID(), 'bstv_review_jsonld', true ) );
	if ( '' !== $tag ) {
		echo $tag . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput -- 위에서 JSON 검증·태그 닫힘 방지를 마쳤다.
	}
}

/**
 * review.css — 리뷰 글에서만 싣는다. Tailwind 빌드와 무관한 일반 CSS 다.
 */
function bstv_review_assets() {
	if ( bstv_is_review_post() ) {
		wp_enqueue_style( 'bstv-review', get_theme_file_uri( 'assets/review.css' ), array( 'bstv-wp' ), BSTV_VERSION );
	}
}
