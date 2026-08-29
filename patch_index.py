import re

with open('index.html', 'r') as f:
    content = f.read()

# Remove our manual manifest link
content = re.sub(r'<link rel="manifest" href="/manifest.json" />', '', content)

# Remove our manual service worker script
content = re.sub(r'<script>\s*if \(\'serviceWorker\'.*?</script>', '', content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
