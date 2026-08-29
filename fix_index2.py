import re

with open('index.html', 'r') as f:
    content = f.read()

bad_script = """    <script type="module">
      const base = import.meta.env ? import.meta.env.BASE_URL : '/WarehouseMini/';
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(err => {
            console.log('SW registration error:', err);
          });
        });
      }
    </script>"""

good_script = """    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          // Detect base path automatically for GitHub pages
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const swPath = isLocal ? '/sw.js' : '/WarehouseMini/sw.js';
          
          navigator.serviceWorker.register(swPath).catch(err => {
            console.log('SW registration error:', err);
          });
        });
      }
    </script>"""

if bad_script in content:
    content = content.replace(bad_script, good_script)

with open('index.html', 'w') as f:
    f.write(content)
