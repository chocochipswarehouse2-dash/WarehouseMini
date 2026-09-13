cat << 'PY_EOF' > fix_dock.py
import re

with open('src/components/LoadingDockView.tsx', 'r') as f:
    content = f.read()

# I want to remove the title and subtitle div
pattern = r'<div className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">.*?</div>'
content = re.sub(pattern, '', content, flags=re.DOTALL)

with open('src/components/LoadingDockView.tsx', 'w') as f:
    f.write(content)
PY_EOF
python3 fix_dock.py
