<?php
/**
 * 목록에서 쓰는 카드 하나.
 * 클래스는 정적 사이트의 카드와 같은 토큰을 쓴다.
 */
?>
<article <?php post_class( 'group rounded-xl bg-surface-container border border-outline-variant overflow-hidden transition-shadow hover:shadow-lg' ); ?>>
	<a href="<?php the_permalink(); ?>" class="block">
		<?php if ( has_post_thumbnail() ) : ?>
			<div class="aspect-video overflow-hidden bg-surface-container-high">
				<?php the_post_thumbnail( 'medium_large', array( 'class' => 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105' ) ); ?>
			</div>
		<?php endif; ?>

		<div class="p-5">
			<h2 class="font-headline-lg text-headline-md font-bold text-on-surface text-balance group-hover:text-hermes-orange transition-colors">
				<?php the_title(); ?>
			</h2>
			<p class="mt-2 text-body-sm text-on-surface-variant line-clamp-2">
				<?php echo esc_html( wp_trim_words( get_the_excerpt(), 24 ) ); ?>
			</p>
		</div>
	</a>
</article>
