<?php
/**
 * 경기 일정 — 행 하나.
 *
 * 마크업·클래스는 정적 사이트 schedule.html 의 행을 그대로 옮겼다.
 * ⚠️ 새 Tailwind 클래스를 넣지 마십시오 — 테마의 tailwind.css 는 빌드본이라
 *   한 번도 쓰인 적 없는 클래스는 조용히 무시된다(다음세션_재개.md 규칙 10).
 *
 * 경기 상세·팀 화면이 워드프레스에 없으므로 링크와 「중계 보기」 버튼은 두지 않는다.
 *
 * @var array $args { row: array, stale: bool }
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ev     = $args['row'];
$stale  = ! empty( $args['stale'] );
$scored = in_array( $ev['state'], array( 'live', 'finished' ), true ) && null !== $ev['homeScore'];
$badge  = 'font-label-data text-[11px] text-secondary whitespace-nowrap';
?>
<li data-league="<?php echo esc_attr( $ev['slug'] ); ?>" data-tier="<?php echo esc_attr( $ev['tier'] ); ?>" class="flex flex-col xl:flex-row xl:items-center gap-3 xl:gap-gutter py-gutter border-b border-outline-variant/40 last:border-b-0">
	<div class="flex items-center gap-3 xl:w-32 2xl:w-44 shrink-0">
		<?php if ( ! empty( $ev['kickoff'] ) ) : ?>
			<time datetime="<?php echo esc_attr( $ev['kickoff'] ); ?>" class="font-label-data text-label-data text-on-surface whitespace-nowrap shrink-0"><?php echo esc_html( $ev['clock'] ); ?></time>
		<?php else : ?>
			<span class="font-label-data text-label-data text-on-surface whitespace-nowrap shrink-0"><?php echo esc_html( $ev['clock'] ); ?></span>
		<?php endif; ?>
		<span class="font-label-caps text-[10px] text-secondary uppercase truncate"><?php echo esc_html( $ev['leagueLabel'] ); ?></span>
	</div>
	<div class="flex-1 flex items-center justify-between xl:justify-start gap-4 min-w-0">
		<span class="font-body-md font-semibold text-on-surface truncate flex-1 xl:flex-none xl:w-32 2xl:w-44 text-right"><?php echo esc_html( $ev['home'] ); ?></span>
		<?php if ( $scored ) : ?>
			<span class="flex items-center shrink-0 px-3"><span class="font-label-data text-label-data text-xl font-bold text-on-surface"><?php echo esc_html( $ev['homeScore'] ); ?></span><span class="px-1">-</span><span class="font-label-data text-label-data text-xl font-bold text-on-surface"><?php echo esc_html( $ev['awayScore'] ); ?></span></span>
		<?php else : ?>
			<span class="flex items-center shrink-0 px-3"><span class="font-label-data text-label-data text-secondary">vs</span></span>
		<?php endif; ?>
		<span class="font-body-md font-semibold text-on-surface truncate flex-1 xl:flex-none xl:w-32 2xl:w-44"><?php echo esc_html( $ev['away'] ); ?></span>
	</div>
	<div class="flex items-center justify-between xl:justify-end gap-3 xl:w-40 shrink-0 xl:ml-auto">
		<?php if ( 'live' === $ev['state'] && ! $stale ) : ?>
			<span class="inline-flex items-center gap-1.5 bg-error-container text-on-error-container px-2.5 py-1 rounded-pill font-label-data text-[11px] whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-pill bg-error pulse-live" aria-hidden="true"></span>진행 중</span>
		<?php elseif ( 'live' === $ev['state'] ) : ?>
			<span class="<?php echo esc_attr( $badge ); ?>">확인 필요</span>
		<?php elseif ( 'finished' === $ev['state'] ) : ?>
			<span class="<?php echo esc_attr( $badge ); ?>">종료</span>
		<?php elseif ( 'postponed' === $ev['state'] ) : ?>
			<span class="<?php echo esc_attr( $badge ); ?>"><?php echo esc_html( $ev['clock'] ); ?></span>
		<?php else : ?>
			<span class="<?php echo esc_attr( $badge ); ?>">예정</span>
		<?php endif; ?>
	</div>
</li>
