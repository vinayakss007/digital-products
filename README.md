# Passive Income Tech Content Automator

This project is a centralized, automated tech news and product website using WordPress as the CMS. It includes a custom WordPress theme styled like TechRadar, and a Python automation script that continuously scrapes tech news, generates articles via an LLM, and publishes them to the CMS.

## Architecture

- **WordPress:** Acts as the CMS and frontend.
- **Theme:** The custom `tech-passive-income-theme` displays articles in a grid-like news structure.
- **Python Script:** The `content_automator.py` handles the scraping (`requests`, `beautifulsoup4`) and generation logic (`openai`), and communicates with WordPress using `wp-cli` commands.

## Prerequisites

- PHP 8.x
- Python 3
- Required Python packages: `requests`, `beautifulsoup4`, `openai`
- `curl`, `unzip`

## Installation & Setup

We provide an automated setup script that downloads and configures WordPress locally with SQLite (no separate MySQL database needed), installs a custom theme, and prepares everything.

1. Run the setup script:
   ```bash
   ./setup.sh
   ```

2. Start the local PHP development server:
   ```bash
   cd wordpress
   php -S 0.0.0.0:8000
   ```
   *The WordPress site will be available at `http://localhost:8000`.*

3. Install Python dependencies for the automation script:
   ```bash
   pip install requests beautifulsoup4 openai
   ```

## Running the Content Automator

The `content_automator.py` script pulls trending stories from Hacker News and generates categorized articles (News, Reviews, Ebooks).

1. Ensure you have your `OPENAI_API_KEY` set as an environment variable (otherwise, it will use a mock fallback response for generating articles).
2. The script runs natively and uses `wp-cli.phar` (downloaded during setup) to publish directly to the local WordPress installation.
3. Run the script:
   ```bash
   python3 content_automator.py
   ```
