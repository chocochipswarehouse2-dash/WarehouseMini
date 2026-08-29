import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace the service worker script
bad_script = """    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js').catch(err => {
            console.log('SW registration error:', err);
          });
        });
      }
    </script>"""

good_script = """    <script type="module">
      const base = import.meta.env ? import.meta.env.BASE_URL : '/WarehouseMini/';
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(err => {
            console.log('SW registration error:', err);
          });
        });
      }
    </script>"""

if bad_script in content:
    content = content.replace(bad_script, good_script)
else:
    # Just a general replace if formatting differs
    content = re.sub(r'<script>\s*if\s*\(\'serviceWorker\'.*?</script>', good_script, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)
