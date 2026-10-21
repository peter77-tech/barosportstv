<?php
/**
 * index.php — 최후의 폴백 템플릿.
 * 다른 템플릿이 하나도 맞지 않을 때 워드프레스가 이것을 쓴다.
 */
get_header();
?>
<div class="max-w-container-max mx-auto w-full">

	<?php if ( have_posts() ) : ?>

		<?php if ( ! is_front_page() && ( is_archive() || is_home() ) ) : ?>
			<header class="mb-8">
				<h1 class="font-headline-lg text-headline-lg font-bold text-on-surface">
					<?php echo esc_html( wp_get_document_title() ); ?>
				</h1>
			</header>
		<?php endif; ?>

		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			<?php
			while ( have_posts() ) :
				the_post();
				get_template_part( 'template-parts/card' );
			endwhile;
			?>
		</div>

		<?php
		the_posts_pagination(
			array(
				'mid_size'  => 2,
				'prev_text' => '이전',
				'next_text' => '다음',
				'class'     => 'mt-10',
			)
		);
		?>

	<?php else : ?>
		<?php get_template_part( 'template-parts/none' ); ?>
	<?php endif; ?>

</div>
<?php
get_footer();
