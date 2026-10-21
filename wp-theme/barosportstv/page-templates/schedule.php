<?php
/**
 * Template Name: 경기 일정
 *
 * 한국 시각 오늘부터 5일치 경기를 서버에서 완성된 HTML 로 그린다.
 * 날짜·리그 칩은 링크(?d= &l=)라 JS 없이 동작하고, 조합마다 주소가 생긴다.
 *
 * 데이터 흐름: GitHub Actions 프리베이크 → data/wp/*.json(GitHub Pages)
 *   → 10분 크론(inc/schedule-data.php) → 옵션 → 이 템플릿.
 * 화면 계산은 inc/schedule-page.php 의 bstv_schedule_context() 하나에서 한다.
 *
 * ⚠️ 마크업·클래스는 정적 사이트 schedule.html 에서 옮겼다. 새 Tailwind 클래스 금지(규칙 10).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();

// ⚠️ 이 파일은 WordPress 가 전역 범위에서 include 한다. 변수는 반드시 bstv_ 로 시작한다 —
//   $page 같은 이름은 the_post() 가 덮어써 목록이 통째로 사라진다(tests/php/run.php template_globals).
$bstv_ctx  = bstv_schedule_context();
$bstv_req  = $bstv_ctx['req'];
$bstv_page = $bstv_ctx['page'];
?>
<div class="max-w-container-max mx-auto w-full">

	<header class="mt-stack-lg mb-stack-lg">
		<h1 class="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2"><?php the_title(); ?></h1>
		<?php
		while ( have_posts() ) :
			the_post();
			if ( '' !== trim( get_the_content() ) ) :
				?>
				<div class="bstv-prose font-body-md text-on-surface-variant"><?php the_content(); ?></div>
				<?php
			endif;
		endwhile;
		?>
		<?php if ( $bstv_ctx['generated'] ) : ?>
			<p class="mt-1 font-label-data text-[11px] text-secondary"><?php echo esc_html( $bstv_ctx['generated'] ); ?> 기준 · 약 30분마다 갱신</p>
		<?php endif; ?>
		<?php if ( $bstv_ctx['has_data'] && $bstv_ctx['stale'] ) : ?>
			<p class="mt-1 font-body-md text-on-surface-variant" role="status">경기 정보 갱신이 지연되고 있습니다. 점수와 진행 상태가 최신이 아닐 수 있습니다.</p>
		<?php endif; ?>
	</header>

	<?php if ( ! $bstv_ctx['days'] ) : ?>

		<section class="depth-panel mb-section-gap">
			<p class="font-body-md text-on-surface-variant">경기 일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
		</section>

	<?php else : ?>

		<!-- 날짜 선택 -->
		<nav class="mb-stack-lg" aria-label="날짜 선택">
			<div class="flex overflow-x-auto gap-stack-sm pb-3 snap-x no-scrollbar">
				<?php foreach ( $bstv_ctx['days'] as $bstv_d ) : ?>
					<a href="<?php echo esc_url( bstv_schedule_url( $bstv_d, $bstv_req['l'] ) ); ?>"<?php echo $bstv_d === $bstv_req['d'] ? ' aria-current="page"' : ''; ?> class="date-chip snap-start shrink-0 px-5 py-3 rounded-xl glass-card text-center min-w-[84px] transition-colors">
						<span class="block font-label-caps text-[10px] text-secondary uppercase"><?php echo esc_html( bstv_schedule_day_label( $bstv_d, $bstv_ctx['today'] ) ); ?></span>
						<span class="block font-label-data text-label-data mt-1"><?php echo esc_html( substr( $bstv_d, 5, 2 ) . '.' . substr( $bstv_d, 8, 2 ) ); ?></span>
					</a>
				<?php endforeach; ?>
			</div>
		</nav>

		<!-- 리그 필터 -->
		<nav class="mb-stack-lg" aria-label="리그 필터">
			<div class="flex overflow-x-auto gap-stack-md pb-3 snap-x no-scrollbar">
				<?php foreach ( BSTV_SCHEDULE_LEAGUES as $bstv_key => $bstv_label ) : ?>
					<?php $bstv_on = $bstv_key === $bstv_req['l']; ?>
					<a href="<?php echo esc_url( bstv_schedule_url( $bstv_req['d'], $bstv_key ) ); ?>"<?php echo $bstv_on ? ' aria-current="page"' : ''; ?> class="league-chip snap-start shrink-0 px-6 py-3 rounded-pill<?php echo $bstv_on ? '' : ' glass-card hover:border-hermes-orange text-on-surface'; ?> font-label-caps text-label-caps whitespace-nowrap transition-colors"><?php echo esc_html( $bstv_label ); ?></a>
				<?php endforeach; ?>
			</div>
		</nav>

		<section class="depth-panel mb-section-gap" aria-labelledby="schedule-day-title">
			<div class="flex items-center gap-3 mb-stack-md">
				<h2 id="schedule-day-title" class="font-headline-md text-headline-md text-on-surface">
					<?php
					echo esc_html(
						bstv_schedule_day_label( $bstv_req['d'], $bstv_ctx['today'] ) . ' · '
						. (int) substr( $bstv_req['d'], 5, 2 ) . '월 ' . (int) substr( $bstv_req['d'], 8, 2 ) . '일'
					);
					?>
				</h2>
				<?php if ( $bstv_ctx['live'] ) : ?>
					<span class="bg-error-container text-on-error-container px-3 py-1 rounded-pill font-label-data text-label-data flex items-center gap-2">
						<span class="w-1.5 h-1.5 rounded-pill bg-error pulse-live" aria-hidden="true"></span><?php echo (int) $bstv_ctx['live']; ?> LIVE</span>
				<?php endif; ?>
			</div>

			<?php if ( ! $bstv_ctx['has_data'] ) : ?>
				<p class="font-body-md text-on-surface-variant">경기 일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
			<?php elseif ( ! $bstv_page['rows'] && 'top' === $bstv_req['l'] ) : ?>
				<p class="font-body-md text-on-surface-variant">주요 리그 경기가 없습니다. <a class="text-primary hover:text-primary" href="<?php echo esc_url( bstv_schedule_url( $bstv_req['d'], 'all' ) ); ?>">전체 보기</a></p>
			<?php elseif ( ! $bstv_page['rows'] ) : ?>
				<p class="font-body-md text-on-surface-variant">이 날 해당 리그 경기가 없습니다.</p>
			<?php else : ?>
				<div class="glass-card rounded-xl px-gutter">
					<ul class="divide-y-0">
						<?php
						foreach ( $bstv_page['rows'] as $bstv_row ) {
							get_template_part( 'template-parts/schedule-row', null, array( 'row' => $bstv_row, 'stale' => $bstv_ctx['stale'] ) );
						}
						?>
					</ul>
				</div>

				<?php if ( $bstv_page['pages'] > 1 ) : ?>
					<nav class="mt-stack-md flex items-center justify-center gap-4 font-label-data text-label-data" aria-label="쪽 나눔">
						<?php if ( $bstv_page['page'] > 1 ) : ?>
							<a class="text-primary hover:text-primary" href="<?php echo esc_url( bstv_schedule_url( $bstv_req['d'], $bstv_req['l'], $bstv_page['page'] - 1 ) ); ?>">이전</a>
						<?php endif; ?>
						<span class="text-secondary"><?php echo (int) $bstv_page['page']; ?> / <?php echo (int) $bstv_page['pages']; ?> · 전체 <?php echo (int) $bstv_ctx['total']; ?>경기</span>
						<?php if ( $bstv_page['page'] < $bstv_page['pages'] ) : ?>
							<a class="text-primary hover:text-primary" href="<?php echo esc_url( bstv_schedule_url( $bstv_req['d'], $bstv_req['l'], $bstv_page['page'] + 1 ) ); ?>">다음</a>
						<?php endif; ?>
					</nav>
				<?php endif; ?>
			<?php endif; ?>
		</section>

	<?php endif; ?>

</div>
<?php
get_footer();
