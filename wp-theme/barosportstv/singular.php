<?php
/**
 * singular.php — 글(single)과 페이지(page)를 함께 처리한다.
 * 두 템플릿이 사실상 같아서 분리하지 않았다. 달라지면 그때 나눈다.
 */
get_header();
?>
<article <?php post_class( 'max-w-container-max mx-auto w-full' ); ?>>

	<header class="mb-8 bstv-readwidth">
		<h1 class="font-headline-lg text-headline-lg font-bold text-on-surface text-balance">
			<?php the_title(); ?>
		</h1>

		<?php if ( is_single() ) : ?>
			<p class="mt-3 text-body-sm text-on-surface-variant">
				<time datetime="<?php echo esc_attr( get_the_date( 'c' ) ); ?>"><?php echo esc_html( get_the_date() ); ?></time>
			</p>
		<?php endif; ?>
	</header>

	<?php if ( has_post_thumbnail() ) : ?>
		<figure class="mb-8 overflow-hidden rounded-xl">
			<?php the_post_thumbnail( 'large', array( 'class' => 'w-full h-auto' ) ); ?>
		</figure>
	<?php endif; ?>

	<div class="bstv-prose">
		<?php
		the_content();
		wp_link_pages( array( 'before' => '<nav class="mt-6">', 'after' => '</nav>' ) );
		?>
	</div>

</article>
<?php
get_footer();
