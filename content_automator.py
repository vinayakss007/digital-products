import requests
from bs4 import BeautifulSoup
import openai
import os
import subprocess

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

def generate_article(title, url):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {
            "title": f"Breaking: {title}",
            "content": f"This is an automated engaging tech article based on the recent news about '{title}'. It is a very exciting development in the tech world. Read more at the original source: {url}"
        }

    client = openai.OpenAI(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a tech journalist. Rewrite the provided tech news headline into a full, engaging article for a tech blog, similar in style to TechRadar. Start with a compelling headline on the first line, followed by the article content. Do not include markdown formatting for the title."},
                {"role": "user", "content": f"Headline: {title}\nURL: {url}\nPlease generate the article."}
            ]
        )
        result = response.choices[0].message.content.strip().split('\n', 1)
        generated_title = result[0].strip()
        generated_content = result[1].strip() if len(result) > 1 else ""
        return {
            "title": generated_title,
            "content": generated_content
        }
    except Exception as e:
        print(f"Error generating article: {e}")
        return None

def publish_to_cms(article_title, article_content):
    try:
        # Use Docker WP-CLI to create the post
        cmd = [
            "docker-compose", "run", "--rm", "wpcli", "wp", "post", "create",
            f"--post_title={article_title}",
            f"--post_content={article_content}",
            "--post_status=publish"
        ]
        # Note: If running locally without docker, replace with native wp-cli command:
        # cmd = ["wp", "post", "create", "--path=/path/to/wordpress", f"--post_title={article_title}", f"--post_content={article_content}", "--post_status=publish"]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        print(f"Successfully published: {article_title}")
    except subprocess.CalledProcessError as e:
        print(f"Failed to publish '{article_title}': {e.stderr}")

if __name__ == "__main__":
    print("Scraping Hacker News...")
    news_items = scrape_news()

    for item in news_items:
        print(f"Generating article for: {item['title']}")
        article = generate_article(item['title'], item['url'])

        if article:
            publish_to_cms(article['title'], article['content'])
        else:
            print("Failed to generate article.")

    print("Automation complete.")
