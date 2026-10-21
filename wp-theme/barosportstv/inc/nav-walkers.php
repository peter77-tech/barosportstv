<?php
/**
 * 메뉴 워커 2종.
 *
 * 왜 워커를 쓰는가 — 워드프레스 기본 wp_nav_menu() 는 <ul><li> 를 뱉는데,
 * 정적 사이트의 내비는 <a> 를 그대로 나열하는 구조이고 클래스 문자열이 길다.
 * 기본 출력에 CSS 를 맞추려 하면 디자인이 어긋난다. 마크업을 그대로 재현하는 쪽이 안전하다.
 *
 * 🔴 클래스 문자열은 정적 사이트 header 에서 그대로 가져왔다. 임의로 줄이지 마십시오 —
 *    Tailwind 는 빌드 시 소스에 있는 문자열만 남기므로, 문자열을 조립하면 클래스가 사라진다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * 상단 GNB.
 *
 * 현재 페이지 항목만 다른 클래스를 받는다 (주황 밑줄 + aria-current).
 */
class BSTV_Walker_Primary extends Walker_Nav_Menu {

	/** 현재 페이지 */
	const ACTIVE = 'text-primary font-bold border-b-2 border-hermes-orange pb-1 font-label-caps text-label-caps uppercase whitespace-nowrap';

	/** 그 외 */
	const IDLE = 'text-on-surface-variant font-medium hover:text-primary transition-colors font-label-caps text-label-caps uppercase whitespace-nowrap';

	public function start_lvl( &$output, $depth = 0, $args = null ) {
		// GNB 는 1단이다. 하위 메뉴를 만들지 않는다.
	}

	public function end_lvl( &$output, $depth = 0, $args = null ) {}

	public function start_el( &$output, $item, $depth = 0, $args = null, $id = 0 ) {
		if ( $depth > 0 ) {
			return; // 2단 이하는 무시한다
		}

		$classes = (array) $item->classes;
		$is_here = in_array( 'current-menu-item', $classes, true )
			|| in_array( 'current_page_item', $classes, true )
			|| in_array( 'current-menu-ancestor', $classes, true );

		$output .= sprintf(
			'<a class="%1$s" href="%2$s"%3$s>%4$s</a>',
			esc_attr( $is_here ? self::ACTIVE : self::IDLE ),
			esc_url( $item->url ),
			$is_here ? ' aria-current="page"' : '',
			esc_html( $item->title )
		);
	}

	public function end_el( &$output, $item, $depth = 0, $args = null ) {}
}

/**
 * 좌측 사이드바 — 종목 탐색.
 *
 * 항목마다 아이콘이 필요하다. 워드프레스 메뉴에는 아이콘 칸이 없으므로
 * 메뉴 항목의 "CSS 클래스" 칸에 `icon-<이름>` 형태로 적는다.
 *
 *   예) icon-sports_basketball  ->  Material Symbols 의 sports_basketball
 *
 * 「CSS 클래스」 칸이 안 보이면 메뉴 화면 우상단 <화면 옵션>에서 켠다.
 * 지정하지 않으면 기본 아이콘(sports)이 붙는다 — 깨지지는 않는다.
 */
class BSTV_Walker_Sidebar extends Walker_Nav_Menu {

	const LINK  = 'sidebar-link flex items-center gap-3 px-6 py-3 hover:bg-white/10 transition-all group';
	const ICON  = 'material-symbols-outlined text-outline group-hover:text-hermes-orange shrink-0';
	const LABEL = 'sidebar-label font-label-caps text-surface-variant group-hover:text-hermes-orange whitespace-nowrap';

	public function start_lvl( &$output, $depth = 0, $args = null ) {}
	public function end_lvl( &$output, $depth = 0, $args = null ) {}

	public function start_el( &$output, $item, $depth = 0, $args = null, $id = 0 ) {
		if ( $depth > 0 ) {
			return;
		}

		$icon = 'sports';
		foreach ( (array) $item->classes as $class ) {
			if ( 0 === strpos( $class, 'icon-' ) ) {
				$icon = substr( $class, 5 );
				break;
			}
		}

		$output .= sprintf(
			'<a class="%1$s" href="%2$s"><span class="%3$s" aria-hidden="true">%4$s</span><span class="%5$s">%6$s</span></a>',
			esc_attr( self::LINK ),
			esc_url( $item->url ),
			esc_attr( self::ICON ),
			esc_html( $icon ),
			esc_attr( self::LABEL ),
			esc_html( $item->title )
		);
	}

	public function end_el( &$output, $item, $depth = 0, $args = null ) {}
}

/**
 * 메뉴를 출력한다. 지정된 메뉴가 없으면 아무것도 내보내지 않는다.
 *
 * 기본 폴백("페이지 목록")을 쓰지 않는 이유 — 우리 마크업과 형태가 달라
 * 내비가 깨진 채로 노출된다. 비어 있는 편이 낫고, 관리자에게는 아래에서 알린다.
 */
function bstv_nav( $location ) {
	if ( ! has_nav_menu( $location ) ) {
		if ( current_user_can( 'edit_theme_options' ) ) {
			printf(
				'<!-- BSTV: "%s" 위치에 지정된 메뉴가 없습니다. 외모 → 메뉴 에서 지정하십시오. -->',
				esc_html( $location )
			);
		}
		return;
	}

	$walker = ( 'sidebar' === $location ) ? new BSTV_Walker_Sidebar() : new BSTV_Walker_Primary();

	wp_nav_menu(
		array(
			'theme_location' => $location,
			'container'      => false,
			'items_wrap'     => '%3$s', // <ul> 을 만들지 않는다 — <a> 만 나열한다
			'depth'          => 1,
			'walker'         => $walker,
			'fallback_cb'    => false,
		)
	);
}
