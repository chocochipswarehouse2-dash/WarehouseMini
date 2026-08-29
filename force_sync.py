with open('package.json', 'r') as f:
    content = f.read()

if '"description"' not in content:
    content = content.replace('"version": "0.0.0",', '"version": "0.0.0",\n  "description": "WMS Scanner PWA",')

with open('package.json', 'w') as f:
    f.write(content)
