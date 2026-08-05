<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="The best automated tech news, product reviews, and exclusive tech ebooks. Continually updated.">
    <meta name="keywords" content="Tech, News, Reviews, Ebooks, Artificial Intelligence, Computing">
    <meta name="author" content="TechRadar Automator">
    <title>TechPassiveIncome | Auto-Generated Tech Hub</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo get_stylesheet_uri(); ?>">
    <?php wp_head(); ?>
</head>
<body>
    <header>
        <div class="header-inner">
            <h1><span>Tech</span>Radar Clone</h1>
        </div>
    </header>

    <nav class="nav-bar">
        <div class="nav-links">
            <a href="#">News</a>
            <a href="#">Reviews</a>
            <a href="#">Computing</a>
            <a href="#">AI</a>
            <a href="#">Ebooks</a>
        </div>
    </nav>

    <div class="container">
        <!-- Lead Generation / Newsletter Form -->
        <div style="background-color: #f3f4f6; padding: 20px; text-align: center; margin-bottom: 30px; border-radius: 8px;">
            <h3>Join our Tech Newsletter</h3>
            <p>Get the latest AI reviews and exclusive tech ebooks directly in your inbox!</p>
            <form style="display:flex; justify-content:center; gap: 10px; margin-top: 15px;">
                <input type="email" placeholder="Enter your email" style="padding: 10px; width: 300px; border: 1px solid #ccc; border-radius: 4px;">
                <button type="submit" style="padding: 10px 20px; background-color: #EF4444; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">Subscribe</button>
            </form>
        </div>

        <?php if ( have_posts() ) : ?>

            <div class="hero-grid">
                <?php
                // Hero main post
                the_post();
                ?>
                <article class="hero-main" style="background-image: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 60%, rgba(0,0,0,0) 100%), url('<?php echo get_the_post_thumbnail_url() ? get_the_post_thumbnail_url() : 'https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-1.2.1&auto=format&fit=crop&w=1200&q=80'; ?>'); background-size: cover; background-position: center;">
                    <span class="category">Top Story</span>
                    <h2><?php the_title(); ?></h2>
                    <p><?php echo wp_trim_words(get_the_excerpt(), 25, '...'); ?></p>
                </article>

                <div class="hero-side">
                    <?php
                    // Next 2 posts for side area
                    for ($i = 0; $i < 2; $i++) {
                        if ( have_posts() ) :
                            the_post();
                    ?>
                            <article class="side-card" style="background-image: linear-gradient(to top, rgba(0,0,0,0.8), rgba(0,0,0,0.1)), url('<?php echo get_the_post_thumbnail_url() ? get_the_post_thumbnail_url() : 'https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'; ?>'); background-size: cover; background-position: center;">
                                <span class="category">Trending</span>
                                <h2><?php the_title(); ?></h2>
                                <p><?php echo wp_trim_words(get_the_excerpt(), 15, '...'); ?></p>
                            </article>
                    <?php
                        endif;
                    }
                    ?>
                </div>
            </div>

            <h2 class="section-title">Latest News</h2>

            <div id="content" class="grid">
                <?php
                // Remaining posts
                while ( have_posts() ) : the_post();
                ?>
                    <article class="card">
                        <div class="card-img" style="background-image: url('<?php echo get_the_post_thumbnail_url() ? get_the_post_thumbnail_url() : 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'; ?>');"></div>
                        <div class="card-content">
                            <span class="category">Latest</span>
                            <h2><?php the_title(); ?></h2>
                            <p><?php echo wp_trim_words(get_the_content(), 20, '...'); ?></p>
                        </div>
                    </article>
                <?php
                endwhile;
                ?>
            </div>

        <?php else : ?>
            <p style="text-align:center; padding: 40px; font-size: 1.2rem; color: #6B7280;">No articles found. Run the automation script to populate news.</p>
        <?php endif; ?>
    </div>
    <?php wp_footer(); ?>
</body>
</html>
