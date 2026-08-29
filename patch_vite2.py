import re

with open('vite.config.ts', 'r') as f:
    content = f.read()

if "manifestFilename: 'manifest.json'," not in content:
    content = content.replace("workbox: {", "manifestFilename: 'manifest.json',\n        workbox: {")
    with open('vite.config.ts', 'w') as f:
        f.write(content)
