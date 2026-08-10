import requests
from bs4 import BeautifulSoup
import openai
import os
import subprocess
import urllib.parse
import re

def scrape_news():
    url = "https://news.ycombinator.com/"
    response = requests.get(url)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')

    news_items = []
    links = soup.select('span.titleline > a')
    for link in links[:5]:
        news_items.append({
            'title': link.text,
            'url': link['href']
        })
    return news_items

def get_image_from_url(url):
    try:
        if not url.startswith('http'):
            return None
        response = requests.get(url, timeout=5)
        soup = BeautifulSoup(response.text, 'html.parser')
        og_image = soup.find('meta', property='og:image')
        if og_image and og_image.get('content'):
            return og_image['content']
    except Exception as e:
        print(f"Could not extract image from {url}: {e}")
    return None

def generate_article(title, url, article_type="news"):
    api_key = os.environ.get("OPENAI_API_KEY")

    if article_type == "review":
        prompt_system = "You are a tech product reviewer. Write an engaging product review based on the provided topic, similar in style to TechRadar. Start with a compelling headline on the first line, followed by the review content. Conclude with a strong buying recommendation. Do not include markdown formatting for the title."
        prompt_user = f"Topic: {title}\nPlease generate the review."
    elif article_type == "ebook":
        prompt_system = "You are a tech author and marketer. Write an engaging promotional post for a new tech-related ebook based on the provided topic. Start with a catchy headline on the first line, followed by the promotional content, outlining what readers will learn. Do not include markdown formatting for the title."
        prompt_user = f"Topic: {title}\nPlease generate the ebook promotional post."
    else:
        prompt_system = "You are a tech journalist. Rewrite the provided tech news headline into a full, engaging article for a tech blog, similar in style to TechRadar. Start with a compelling headline on the first line, followed by the article content. Do not include markdown formatting for the title."
        prompt_user = f"Headline: {title}\nURL: {url}\nPlease generate the article."

    if not api_key:
        if article_type == "review":
            return {
                "title": f"Review: {title}",
                "content": f"This is an automated engaging tech review based on '{title}'. It is a very exciting product. <br><br> <strong><a href='http://affiliatelink.com/buy/{urllib.parse.quote(title)}'>Buy Now on Amazon!</a></strong>"
            }
        elif article_type == "ebook":
            return {
                "title": f"Ebook: Mastering {title}",
                "content": f"This is an automated engaging promotional post for our new ebook about '{title}'. You will learn a lot! <br><br> <strong><a href='http://affiliatelink.com/buy/ebook'>Get the Ebook Now!</a></strong>"
            }
        else:
            return {
                "title": f"Breaking: {title}",
                "content": f"This is an automated engaging tech article based on the recent news about '{title}'. It is a very exciting development in the tech world. Read more at the original source: {url}"
            }

    client = openai.OpenAI(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": prompt_system},
                {"role": "user", "content": prompt_user}
            ]
        )
        result = response.choices[0].message.content.strip().split('\n', 1)
        generated_title = result[0].strip()
        generated_content = result[1].strip() if len(result) > 1 else ""

        # Add affiliate placeholders
        if article_type == "review":
            generated_content += f"\n\n<br><br><strong><a href='http://affiliatelink.com/buy/{urllib.parse.quote(title)}'>Buy Now on Amazon!</a></strong>"
        elif article_type == "ebook":
            generated_content += f"\n\n<br><br><strong><a href='http://affiliatelink.com/buy/ebook'>Get the Ebook Now!</a></strong>"

        return {
            "title": generated_title,
            "content": generated_content
        }
    except Exception as e:
        print(f"Error generating article: {e}")
        return None

def download_image(url, filename):
    try:
        response = requests.get(url, stream=True, timeout=5)
        response.raise_for_status()
        with open(filename, 'wb') as f:
            for chunk in response.iter_content(1024):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"Failed to download image {url}: {e}")
        return False

def publish_to_cms(article_title, article_content, image_url=None):
    try:
        cmd = [
            "./wp-cli.phar", "--path=./wordpress", "post", "create",
            f"--post_title={article_title}",
            f"--post_content={article_content}",
            "--post_status=publish",
            "--porcelain"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        post_id = result.stdout.strip()
        print(f"Successfully published: {article_title} with ID {post_id}")

        if image_url:
            safe_title = re.sub(r'[^a-zA-Z0-9]', '_', article_title)[:20]
            image_filename = f"/tmp/{safe_title}.jpg"
            if download_image(image_url, image_filename):
                attach_image_to_post(post_id, image_filename)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to publish '{article_title}': {e.stderr}")
        return False
    except FileNotFoundError:
        print("Failed to run WP-CLI. Make sure ./wp-cli.phar is available (run setup.sh first).")
        return False

def attach_image_to_post(post_id, image_path):
    try:
        cmd = [
            "./wp-cli.phar", "--path=./wordpress", "media", "import", image_path,
            f"--post_id={post_id}", "--featured_image"
        ]

        subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"Successfully attached image to post {post_id}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to attach image to post {post_id}: {e.stderr}")


if __name__ == "__main__":
    print("Scraping Hacker News...")
    news_items = scrape_news()

    # Generate News
    print("\n--- Generating News ---")
    for item in news_items[:3]:
        print(f"Generating news for: {item['title']}")
        article = generate_article(item['title'], item['url'], "news")
        if article:
            image_url = get_image_from_url(item['url'])
            publish_to_cms(article['title'], article['content'], image_url)

    # Generate Review
    print("\n--- Generating Review ---")
    if len(news_items) > 3:
        item = news_items[3]
        print(f"Generating review for: {item['title']}")
        article = generate_article(item['title'], item['url'], "review")
        if article:
            image_url = get_image_from_url(item['url'])
            publish_to_cms(article['title'], article['content'], image_url)

    # Generate Ebook
    print("\n--- Generating Ebook Promo ---")
    if len(news_items) > 4:
        item = news_items[4]
        print(f"Generating ebook promo for: {item['title']}")
        article = generate_article(item['title'], item['url'], "ebook")
        if article:
            image_url = get_image_from_url(item['url'])
            publish_to_cms(article['title'], article['content'], image_url)

    print("\nAutomation complete.")
