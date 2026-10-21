<?php
/**
 * header.php - BaroSports TV
 * 원본: 정적 사이트 index.html 1~184행을 그대로 이식했다.
 * 마크업을 바꾸지 않는 것이 목적이다 - 디자인이 그대로 재현돼야 한다.
 */
?>
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0">


<!-- Open Graph : 커뮤니티 공유 시 링크 미리보기 -->
<meta name="theme-color" content="#E85110">

<!-- Tailwind: 빌드된 CSS. 토큰은 assets/theme.js 에서 고치고 `npm run build:css` 로 다시 만든다 -->

<!-- 구조화 데이터(JSON-LD)는 Rank Math가 소유한다 — 테마에서 출력하지 않는다.
     2026-09-04 ① 테마가 WebSite를 직접 출력해 Rank Math #website 노드와 중복됐던 것을 제거했다.
     2026-09-04 ② 이 위치에 있던 잘못된 head 종료 태그를 제거했다 — wp_head() 가 head 밖에서
        실행되어 Rank Math의 title·robots·og·JSON-LD 가 전부 head 바깥으로 떨어지고 있었다.
     2026-09-04 ③ 중복된 meta charset·viewport 2행을 제거했다.
     경기·팀 스키마는 assets/seo.js 가 붙인다. 클라이언트 렌더링이므로 P07-009 3-1 원칙 3
        (서버 렌더링 필수 · T-21·D-14)과 어긋난다 — 데이터 연동 시 서버 렌더링으로 옮긴다(U-47). -->

<?php wp_head(); ?>
</head>
<body <?php body_class( 'bg-background text-on-surface font-body-md antialiased overflow-x-hidden flex min-h-screen' ); ?>>

<a class="skip-link" href="#main">본문으로 건너뛰기</a>
<div class="scrim md:hidden" id="scrim" aria-hidden="true"></div>

<!-- ══════════════════ 사이드바 ══════════════════ -->
<aside id="sidebar" class="sidebar flex flex-col h-screen py-8 left-0 fixed border-r border-outline-variant bg-shadow-navy z-50 overflow-y-auto overflow-x-hidden"
       aria-label="종목 탐색">
  <div class="carbon-texture absolute inset-0 pointer-events-none"></div>

  <div class="px-6 mb-8 relative z-10 flex items-center gap-3">
    <div class="w-10 h-10 bg-surface-container-highest rounded-pill flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined text-shadow-navy" style="font-variation-settings:'FILL' 1" aria-hidden="true">dashboard</span>
    </div>
    <div class="sidebar-header-text whitespace-nowrap">
      <p class="font-headline-lg text-body-md font-bold text-on-primary">DASHBOARD</p>
      <p class="font-label-caps text-[10px] text-surface-variant/70">v4.2.0-STABLE</p>
    </div>
  </div>

  <div class="px-4 mb-8 relative z-10">
    <button type="button" class="sidebar-switch-btn w-full bg-primary-container hover:bg-primary-hover text-on-primary font-label-caps py-3 px-4 rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-colors flex justify-center items-center gap-2">
      <span class="sidebar-switch-text whitespace-nowrap">SWITCH MODE</span>
      <span class="material-symbols-outlined sidebar-switch-icon hidden" aria-hidden="true">swap_horiz</span>
    </button>
  </div>

  <nav class="flex-1 relative z-10 space-y-1">
    <?php bstv_nav( 'sidebar' ); ?>
  </nav>

  <div class="px-6 mt-auto relative z-10 border-t border-surface-variant/20 pt-6 space-y-3">
    <p class="sidebar-status-container flex items-center gap-2">
      <span class="material-symbols-outlined text-emerald-400 text-sm shrink-0" style="font-variation-settings:'FILL' 1" aria-hidden="true">check_circle</span>
      <span class="sidebar-status-text font-label-caps text-[10px] text-surface-variant whitespace-nowrap">Status: Online</span>
    </p>
    <p class="sidebar-status-container flex items-center gap-2">
      <span class="material-symbols-outlined text-apex-blue text-sm shrink-0" aria-hidden="true">speed</span>
      <span class="sidebar-status-text font-label-caps text-[10px] text-surface-variant whitespace-nowrap">Latency: 24ms</span>
    </p>
  </div>
</aside>

<!-- ══════════════════ 본문 래퍼 ══════════════════ -->
<div class="main-wrap flex-1 flex flex-col md:pl-64 min-h-screen relative w-full">
  <div class="absolute inset-0 technical-grid pointer-events-none -z-10"></div>

  <!-- ── 상단 바 ── -->
  <header class="app-header w-full top-0 sticky bg-surface/90 backdrop-blur border-b-2 border-hermes-orange z-40">
    <div class="flex justify-between items-center px-margin-mobile md:px-gutter py-4 max-w-container-max mx-auto">

      <div class="flex items-center gap-3 lg:gap-6 xl:gap-10 min-w-0">
        <button type="button" id="sidebar-toggle" aria-expanded="true" aria-controls="sidebar"
                class="cursor-pointer text-on-surface hover:text-hermes-orange transition-colors p-2 rounded-pill hover:bg-surface-container-highest shrink-0">
          <span class="material-symbols-outlined block" aria-hidden="true">menu</span>
          <span class="sr-only">메뉴 열기·닫기</span>
        </button>

        <a href="<?php echo esc_url( home_url( '/' ) ); ?>" class="font-display-lg text-[22px] sm:text-[26px] font-bold tracking-tighter text-on-surface flex items-center whitespace-nowrap shrink-0">
          바로스포츠<span class="font-medium text-hermes-orange">티비</span>
        </a>

        <!-- 🔴 브레이크포인트 주의: Tailwind의 lg/xl은 "화면 폭" 기준인데, 이 헤더가 쓰는
             실제 폭은 사이드바 256px을 뺀 값이다. 그래서 판단 기준을 한 단계씩 올려 잡는다.
             (예: 가용폭 1024px가 필요하면 xl=1280 이 아니라 2xl=1536에서 켠다)
             Command Center는 가장 길어 1560px 이상에서만 노출하고, 그 아래에서는 사이드바로 접근한다. -->
        <!-- 🔴 규칙 ② — `gap-8` 을 없애고 `gap-4` 하나로 통일했다 (2026-08-21, 5차).
             ⚠️ 4차 기록의 「검색창에 가려짐」은 원인이 틀렸다. 실제로는 검색창이 덮는 게
                아니라 **이 `nav` 의 `overflow-hidden` 이 잘라내는** 것이다.
                재는 법: `nav.scrollWidth − nav.clientWidth` (요소 사각형 비교로는 안 보인다).
             `gap-8` 일 때 1536~1610px 에서 66.8px 잘렸고, `gap-4` 로 3px(1536~1559px)까지
             줄었다. 마지막 3px 은 `Command Center` 를 `2xl`(1536) 대신 실측값
             **`min-[1560px]`** 부터 보여 없앴다. nav 콘텐츠 폭은 401px 이다. -->
        <!-- 🔴 규칙 ② — nav 를 `md`(768) 에 켜면 사이드바 256px 이 켜지는 순간
             폭이 모자라 `overflow-hidden` 이 메뉴를 잘라낸다. 800px 에서는 nav 폭이
             **0** 이라 아무것도 안 보였다 (필요 679px vs 헤더 465px — 물리적으로 불가).
             실측: 1080px 7px 잘림 · 1090px 0. 그래서 **`min-[1090px]`** 부터 켠다.
             그 아래에서는 사이드바로 이동한다. 잘린 메뉴보다 없는 메뉴가 낫다.
             (2026-08-21, 5차 · BD 승인) -->
        <nav class="hidden min-[1090px]:flex items-center gap-4 overflow-hidden" aria-label="주 메뉴">
          <?php bstv_nav( 'primary' ); ?>
        </nav>
      </div>

      <div class="flex items-center gap-1 sm:gap-2 xl:gap-4 shrink-0">
        <!-- 검색: xl에서 좁게, 2xl 이상에서 넉넉하게. 그 아래는 아이콘 버튼으로 대체 -->
        <form class="relative hidden xl:block" role="search" onsubmit="return false">
          <label class="sr-only" for="site-search">경기·팀 검색</label>
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-sm" aria-hidden="true">search</span>
          <input id="site-search" type="search" placeholder="경기, 팀 검색…"
                 class="bg-surface-container pl-9 pr-3 py-2 rounded-pill text-sm font-body-sm border-none focus:ring-1 focus:ring-hermes-orange w-40 2xl:w-56 inset-panel">
        </form>
        <button type="button" class="xl:hidden text-outline hover:text-hermes-orange transition-colors p-2 shrink-0">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <span class="sr-only">검색</span>
        </button>

        <button type="button" class="bg-primary-container text-on-primary font-label-caps px-4 py-2 rounded shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-primary-hover transition-colors text-xs font-bold uppercase whitespace-nowrap shrink-0 hidden sm:block">GO PRO</button>

        <button type="button" class="text-outline hover:text-hermes-orange transition-colors p-2 shrink-0">
          <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
          <span class="sr-only">알림</span>
        </button>
        <button type="button" class="text-outline hover:text-hermes-orange transition-colors p-2 shrink-0 hidden 2xl:block">
          <span class="material-symbols-outlined" aria-hidden="true">settings</span>
          <span class="sr-only">설정</span>
        </button>

        <div class="w-8 h-8 rounded-pill bg-surface-variant overflow-hidden border-2 border-outline-variant shrink-0">
          <img class="w-full h-full object-cover" src="assets/img/avatar.svg" alt="내 계정" width="32" height="32">
        </div>
      </div>
    </div>
  </header>

  <!-- ── 메인 ── -->
  <main id="main" class="flex-1 p-margin-mobile md:p-gutter w-full max-w-container-max mx-auto pb-section-gap">
