<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TechRadar Clone | Passive Income Tech</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php echo get_stylesheet_uri(); ?>">
</head>
<body>
    <header>
        <h1>TechRadar Clone</h1>
    </header>
    <div class="container">
        <div id="content" class="grid">
            <?php
            if ( have_posts() ) :
                while ( have_posts() ) : the_post();
            ?>
                    <div class="card">
                        <h2><?php the_title(); ?></h2>
                        <p><?php the_content(); ?></p>
                    </div>
            <?php
                endwhile;
            else :
            ?>
                <p>No articles found. Run the automation script!</p>
            <?php
            endif;
            ?>
        </div>
    </div>
</body>
</html>
