<?php
/**
 * 보여줄 것이 없을 때. 404 와 빈 목록이 같이 쓴다.
 */
?>
<div class="max-w-3xl mx-auto w-full py-16 text-center">
	<h1 class="font-headline-lg text-headline-lg font-bold text-on-surface">
		<?php echo is_404() ? '페이지를 찾을 수 없습니다' : '아직 등록된 글이 없습니다'; ?>
	</h1>
	<p class="mt-4 text-body-md text-on-surface-variant">
		<?php echo is_404() ? '주소가 바뀌었거나 삭제된 페이지입니다.' : '곧 채워집니다.'; ?>
	</p>
	<p class="mt-8">
		<a href="<?php echo esc_url( home_url( '/' ) ); ?>"
		   class="inline-flex items-center gap-2 rounded-pill bg-hermes-orange px-6 py-3 font-headline-lg text-label-lg font-bold text-on-primary transition-opacity hover:opacity-90">
			<span class="material-symbols-outlined" aria-hidden="true">home</span>
			오늘의 경기 보기
		</a>
	</p>
</div>
