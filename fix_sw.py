import re

with open('public/sw.js', 'r') as f:
    content = f.read()

# Replace ASSETS array to use the correct GitHub Pages paths, 
# or just remove the hardcoded paths since runtime caching handles it.
bad_assets = """const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];"""
good_assets = """const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png'
];"""

if bad_assets in content:
    content = content.replace(bad_assets, good_assets)

with open('public/sw.js', 'w') as f:
    f.write(content)
