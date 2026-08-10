<?php
function tech_passive_income_setup() {
    add_theme_support('post-thumbnails');
}
add_action('after_setup_theme', 'tech_passive_income_setup');
