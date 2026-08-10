#!/bin/bash
set -e

echo "Downloading WP-CLI..."
curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
chmod +x wp-cli.phar

echo "Setting up WordPress..."
if [ ! -d "wordpress" ]; then
    mkdir wordpress
    ./wp-cli.phar core download --path=wordpress --skip-content --version=6.2
fi

echo "Installing SQLite integration..."
if [ ! -f "sqlite-integration.1.8.1.zip" ]; then
    curl -O https://downloads.wordpress.org/plugin/sqlite-integration.1.8.1.zip
fi
rm -rf sqlite-integration
unzip -q sqlite-integration.1.8.1.zip
cp -r sqlite-integration wordpress/wp-content/plugins/
# Fix PHP 8 curly brace syntax
sed -i 's/$param{strlen($param)-1}/$param[strlen($param)-1]/g' wordpress/wp-content/plugins/sqlite-integration/pdoengine.class.php
sed -i 's/$param{0}/$param[0]/g' wordpress/wp-content/plugins/sqlite-integration/pdoengine.class.php
# Fix PHP 8 ReturnTypeWillChange
sed -i 's/public function query(\$query) {/#\[\\ReturnTypeWillChange\] public function query(\$query, ?int \$fetchMode = null, mixed ...\$fetchModeArgs) {/g' wordpress/wp-content/plugins/sqlite-integration/pdoengine.class.php

cp wordpress/wp-content/plugins/sqlite-integration/db.php wordpress/wp-content/db.php

echo "Configuring WordPress..."
cd wordpress
../wp-cli.phar config create --dbname=wordpress --dbuser=root --dbpass=root --dbhost=localhost --path=. --skip-check
../wp-cli.phar core install --url=http://localhost:8000 --title="TechPassiveIncome" --admin_user=admin --admin_password=admin --admin_email=admin@example.com --path=.

echo "Setting up Theme..."
mkdir -p wp-content/themes
cp -r ../wp-content/themes/tech-passive-income-theme wp-content/themes/
../wp-cli.phar theme activate tech-passive-income-theme --path=.

echo "Setup complete. You can run the server with: php -S 0.0.0.0:8000 -t wordpress"
