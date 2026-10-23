<?php
/**
 * BaroSports TV — 테마 기능
 *
 * 원칙 3가지
 *   1. 디자인 토큰의 원본은 여전히 assets/theme.js 한 곳이다.
 *      토큰을 고치면 `npm run build:css` 로 assets/tailwind.css 를 다시 만든다.
 *   2. 에셋은 전부 filemtime() 으로 버전을 붙인다.
 *      붙이지 않으면 파일을 고쳐도 브라우저가 옛 것을 계속 쓴다 (2026-08 실제로 겪은 문제).
 *   3. 상단·하단 마크업은 정적 사이트에서 그대로 가져왔다. 손대지 않는다.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'BSTV_VERSION', '0.3.0' );

/**
 * 파일 수정 시각을 버전으로 쓴다. 파일이 없으면 테마 버전으로 떨어진다.
 */
function bstv_asset_version( $relative_path ) {
	$file = get_theme_file_path( $relative_path );
	return file_exists( $file ) ? (string) filemtime( $file ) : BSTV_VERSION;
}

/**
 * 테마가 지원하는 것들.
 */
function bstv_setup() {
	load_theme_textdomain( 'bstv', get_template_directory() . '/languages' );

	add_theme_support( 'title-tag' );
	add_theme_support( 'post-thumbnails' );
	add_theme_support( 'automatic-feed-links' );
	add_theme_support( 'responsive-embeds' );
	add_theme_support(
		'html5',
		array( 'search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script' )
	);

	/*
	 * IA 3축 (P07-009 진입 페이지 유형 ①③④).
	 *   primary — 상단 GNB
	 *   sidebar — 좌측 종목 탐색 (정적 사이트의 <aside id="sidebar">)
	 */
	register_nav_menus(
		array(
			'primary' => __( '상단 내비게이션 (GNB)', 'bstv' ),
			'sidebar' => __( '사이드바 — 종목 탐색', 'bstv' ),
		)
	);
}
add_action( 'after_setup_theme', 'bstv_setup' );

/**
 * 메뉴 워커. 정적 사이트의 <a> 나열 구조를 그대로 재현한다.
 */
require_once get_theme_file_path( 'inc/nav-walkers.php' );

/**
 * 경기 일정 — 화면 계산(순수 함수)과 데이터 받기·저장(크론).
 * 페이지 템플릿 page-templates/schedule.php 가 쓴다.
 */
require_once get_theme_file_path( 'inc/schedule-view.php' );
require_once get_theme_file_path( 'inc/schedule-data.php' );
require_once get_theme_file_path( 'inc/schedule-page.php' );
require_once get_theme_file_path( 'inc/review.php' );
add_action( 'wp_enqueue_scripts', 'bstv_review_assets' );
add_action( 'wp_head', 'bstv_review_head' );

/**
 * 스타일·스크립트.
 *
 * 순서가 중요하다: tailwind.css 가 먼저, app.css 가 나중이다.
 * app.css 가 Tailwind 유틸리티를 덮어쓰는 규칙을 갖고 있다.
 */
function bstv_assets() {

	// 웹폰트 — 정적 사이트와 동일한 조합
	wp_enqueue_style(
		'bstv-fonts',
		'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
		array(),
		null
	);
	wp_enqueue_style(
		'bstv-icons',
		'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap',
		array(),
		null
	);

	wp_enqueue_style( 'bstv-tailwind', get_theme_file_uri( 'assets/tailwind.css' ), array(), bstv_asset_version( 'assets/tailwind.css' ) );
	wp_enqueue_style( 'bstv-app', get_theme_file_uri( 'assets/app.css' ), array( 'bstv-tailwind' ), bstv_asset_version( 'assets/app.css' ) );

	// 워드프레스 전용 스타일 (에디터 마크업 · 정렬 · 접근성). app.css 와 역할이 다르다.
	wp_enqueue_style( 'bstv-wp', get_theme_file_uri( 'assets/wp.css' ), array( 'bstv-app' ), bstv_asset_version( 'assets/wp.css' ) );

	// style.css 는 테마 식별용이다. 실제 스타일은 위 두 개가 갖고 있다.
	wp_enqueue_style( 'bstv-style', get_stylesheet_uri(), array( 'bstv-wp' ), BSTV_VERSION );

	/*
	 * 스크립트. 의존 순서가 정적 사이트의 <script> 나열 순서와 같아야 한다.
	 * apipath → leagues → teams → app → search → user → seo → data → data-pages
	 */
	$scripts = array(
		'bstv-apipath'    => array( 'assets/apipath.js',    array() ),
		'bstv-leagues'    => array( 'assets/leagues.js',    array( 'bstv-apipath' ) ),
		'bstv-teams'      => array( 'assets/teams.js',      array( 'bstv-leagues' ) ),
		'bstv-app'        => array( 'assets/app.js',        array( 'bstv-teams' ) ),
		'bstv-search'     => array( 'assets/search.js',     array( 'bstv-app' ) ),
		'bstv-user'       => array( 'assets/user.js',       array( 'bstv-app' ) ),
		'bstv-seo'        => array( 'assets/seo.js',        array( 'bstv-app' ) ),
		'bstv-data'       => array( 'assets/data.js',       array( 'bstv-app' ) ),
		'bstv-data-pages' => array( 'assets/data-pages.js', array( 'bstv-data' ) ),
	);

	foreach ( $scripts as $handle => $conf ) {
		list( $path, $deps ) = $conf;
		if ( file_exists( get_theme_file_path( $path ) ) ) {
			wp_enqueue_script( $handle, get_theme_file_uri( $path ), $deps, bstv_asset_version( $path ), true );
		}
	}
}
add_action( 'wp_enqueue_scripts', 'bstv_assets' );

/**
 * 사이드바·헤더의 정적 링크를 워드프레스 메뉴로 대체할 때 쓰는 헬퍼.
 *
 * 메뉴가 아직 지정되지 않았으면 아무것도 출력하지 않는다 —
 * 워드프레스 기본 "페이지 목록" 폴백은 우리 디자인과 맞지 않는다.
 */
function bstv_menu( $location, $args = array() ) {
	if ( ! has_nav_menu( $location ) ) {
		return;
	}
	wp_nav_menu(
		wp_parse_args(
			$args,
			array(
				'theme_location' => $location,
				'container'      => false,
				'depth'          => 2,
				'fallback_cb'    => false,
			)
		)
	);
}

/**
 * Rank Math 의 SEO 제목·설명을 REST 에서 다룰 수 있게 등록한다.
 *
 * Rank Math 는 이 값들을 postmeta 에 넣지만 REST 에 노출하지 않는다.
 * 그래서 관리자 화면에서 손으로 넣는 것 말고는 방법이 없다.
 * 등록만 해두면 콘텐츠 작업을 스크립트로 처리할 수 있다.
 *
 * 저장 권한은 편집 권한이 있는 사용자로 제한한다.
 */
function bstv_expose_rank_math_meta() {
	foreach ( array( 'page', 'post' ) as $type ) {
		foreach ( array( 'rank_math_title', 'rank_math_description', 'rank_math_focus_keyword' ) as $key ) {
			register_post_meta(
				$type,
				$key,
				array(
					'type'          => 'string',
					'single'        => true,
					'show_in_rest'  => true,
					'auth_callback' => function () {
						return current_user_can( 'edit_posts' );
					},
				)
			);
		}
	}
}
add_action( 'init', 'bstv_expose_rank_math_meta' );

/**
 * 경기 리뷰 글의 SportsEvent JSON-LD 를 담는 메타. 자동 발행기가 REST 로 저장하고,
 * 테마가 wp_head 에 찍는다 (inc/review.php). Article 스키마는 Rank Math 가 맡는다.
 */
function bstv_expose_review_meta() {
	register_post_meta(
		'post',
		'bstv_review_jsonld',
		array(
			'type'          => 'string',
			'single'        => true,
			'show_in_rest'  => true,
			'auth_callback' => function ( $a, $b, $post_id ) {
				return current_user_can( 'edit_post', $post_id );
			},
		)
	);
}
add_action( 'init', 'bstv_expose_review_meta' );

/**
 * 고유주소 구조를 REST 에서 다룰 수 있게 노출한다.
 *
 * 워드프레스는 이 값을 REST 설정에 열어두지 않아 관리자 화면에서만 바꿀 수 있다.
 * 가이드 글은 상시 콘텐츠인데 기본값(날짜 기반)이면 /2026/09/01/... 이 되고,
 * 읽는 사람에게 "오래된 글"로 보인다. P07-009 는 /guide/... 를 지정한다.
 */
function bstv_expose_permalink_setting() {
	register_setting(
		'permalink',
		'permalink_structure',
		array(
			'type'         => 'string',
			'show_in_rest' => true,
			'default'      => '',
		)
	);
}
add_action( 'init', 'bstv_expose_permalink_setting' );

/**
 * 구조가 바뀌면 재작성 규칙을 다시 만든다.
 * 이걸 하지 않으면 주소는 바뀌었는데 열리지 않는다 (404).
 */
function bstv_flush_on_permalink_change() {
	flush_rewrite_rules();
}
add_action( 'update_option_permalink_structure', 'bstv_flush_on_permalink_change' );

/**
 * 재작성 규칙 1회 갱신.
 *
 * 고유주소를 REST 로 바꾸면 그 요청 안에서의 flush 가 반영되지 않는 경우가 있다.
 * 버전 값을 올려 두면 다음 요청 때 한 번만 다시 만들고, 그 뒤로는 아무것도 하지 않는다.
 * 규칙을 매 요청마다 다시 만들면 느려지므로 이 방식이 필요하다.
 */
function bstv_maybe_flush_rewrite() {
	$want = '2';
	if ( get_option( 'bstv_rewrite_version' ) === $want ) {
		return;
	}
	flush_rewrite_rules();
	update_option( 'bstv_rewrite_version', $want );
}
add_action( 'init', 'bstv_maybe_flush_rewrite', 99 );

/**
 * 출시 체크리스트 — 관리자 화면 상단 알림.
 *
 * 왜 코드로 띄우는가 — 아래 4건은 전부 "출시일에 아무도 기억하지 못하는" 종류다.
 * 특히 색인 차단은 풀지 않으면 사이트가 열려도 검색에 잡히지 않는다.
 * 문서(원장)에 적어 두는 것만으로는 그날 눈에 띄지 않는다.
 *
 * 각 항목은 조건이 충족되면 자동으로 목록에서 빠진다. 전부 끝나면 알림 자체가 사라진다.
 */
function bstv_launch_checklist() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	$todo = array();

	// 1. 색인 차단 — 소프트런칭 2026-12-01 에 반드시 해제
	if ( '1' !== get_option( 'blog_public' ) ) {
		$todo[] = sprintf(
			'<strong>검색 엔진 노출이 차단돼 있습니다.</strong> 출시 준비 중이라면 정상입니다. 출시일에 <a href="%s">설정 → 읽기</a>에서 해제하십시오.',
			esc_url( admin_url( 'options-reading.php' ) )
		);
	}

	// 2. Breeze 페이지 캐시 — 작업 중 꺼 두었다. 출시 전 다시 켠다.
	if ( ! function_exists( 'is_plugin_active' ) ) {
		include_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
	if ( ! is_plugin_active( 'breeze/breeze.php' ) ) {
		$todo[] = sprintf(
			'<strong>Breeze 캐시가 꺼져 있습니다.</strong> 개발 중에는 이게 맞습니다. 출시 전 <a href="%s">플러그인</a>에서 다시 켜십시오 — 켜지 않으면 응답이 느립니다.',
			esc_url( admin_url( 'plugins.php' ) )
		);
	}

	// 3·4. 사람이 확인해야만 아는 것들 — 1·2 가 남아 있는 동안만 같이 보여준다.
	if ( $todo ) {
		$todo[] = '<strong>Search Console</strong> 소유권 확인 + 사이트맵(<code>/sitemap_index.xml</code>) 제출 — 색인 차단을 푸는 날 함께.';
		$todo[] = '<strong>GA4</strong> 측정 ID 연결 (원장 <code>D-22</code>).';
	}

	if ( ! $todo ) {
		return;
	}

	echo '<div class="notice notice-warning"><p><strong>출시 전 확인 — 소프트런칭 2026-12-01</strong></p><ol style="margin:.5em 0 .8em 2em">';
	foreach ( $todo as $item ) {
		echo '<li style="margin-bottom:.35em">' . wp_kses_post( $item ) . '</li>';
	}
	echo '</ol></div>';
}
add_action( 'admin_notices', 'bstv_launch_checklist' );

/**
 * 워드프레스가 <head> 에 넣는 불필요한 태그를 정리한다.
 * 이모지 스크립트는 쓰지 않으며, 로드되면 그만큼 느려진다.
 */
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'wp_head', 'wp_generator' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'rsd_link' );
