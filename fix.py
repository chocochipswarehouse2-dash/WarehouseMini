with open("src/components/CameraScanner.tsx", "r") as f:
    content = f.read()

import re

# find the Floating camera button block
btn_block_re = r"(\s*{\/\* Floating Camera Toggle Button \*\/}\s*{cameras\.length > 1 && \(\s*<button.*?</button>\s*\)}\s*)"
match = re.search(btn_block_re, content, re.DOTALL)
if match:
    btn_code = match.group(1)
    # remove it from current pos
    content = content.replace(btn_code, "")
    
    # insert before "</div>\n\n        {/* Error message */}"
    insert_pos_re = r"(\s*</div>\s*{\/\* Error message \*\/})"
    match2 = re.search(insert_pos_re, content)
    if match2:
        new_content = content[:match2.start()] + btn_code + content[match2.start():]
        with open("src/components/CameraScanner.tsx", "w") as f:
            f.write(new_content)
        print("Success")
    else:
        print("Insert pos not found")
else:
    print("Button not found")
