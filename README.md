# Passive Income Tech Content Automator

This project is a centralized, automated tech news and product website using WordPress as the CMS. It includes a custom WordPress theme styled like TechRadar, and a Python automation script that continuously scrapes tech news, generates articles via an LLM, and publishes them to the CMS.

## Architecture

- **WordPress:** Acts as the CMS and frontend.
- **Theme:** The custom `tech-passive-income-theme` displays articles in a grid-like news structure.
- **Python Script:** The `content_automator.py` handles the scraping (`requests`, `beautifulsoup4`) and generation logic (`openai`), and communicates with WordPress using `wp-cli` commands.

## Prerequisites

- Docker and Docker Compose
- Python 3
- Required Python packages: `requests`, `beautifulsoup4`, `openai`

## Installation

1. Start the WordPress environment using Docker Compose:
   ```bash
   docker-compose up -d
   ```
   *Note: Ensure your environment supports Docker's OverlayFS without permission restrictions. The WordPress site will be available at `http://localhost:8000`.*

2. Install Python dependencies for the automation script:
   ```bash
   pip install requests beautifulsoup4 openai
   ```

## Setup WordPress Theme & Auth

Use the `wpcli` container to install the core and activate the custom theme:

```bash
docker-compose run --rm wpcli wp core install --url="http://localhost:8000" --title="Tech Passive Income" --admin_user="admin" --admin_password="password" --admin_email="admin@example.com"
docker-compose run --rm wpcli wp theme activate tech-passive-income-theme
```

## Running the Content Automator

The `content_automator.py` script pulls trending stories from Hacker News and generates articles.

1. Ensure you have your `OPENAI_API_KEY` set as an environment variable (otherwise, it will use a mock fallback response for generating articles).
2. Modify the script's `publish_to_cms` function to target the container properly using WP-CLI via Docker, or if running locally with WP-CLI installed natively, just ensure the path points to the WordPress root.
3. Run the script:
   ```bash
   python3 content_automator.py
   ```
