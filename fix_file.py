with open("src/components/PickingTasksView.tsx", "r") as f:
    lines = f.readlines()

# The bad part starts exactly after the regex string opens
# Let's find line 2407
bad_start = -1
bad_end = -1
for i, line in enumerate(lines):
    if "displayName = displayName.replace(new RegExp" in line:
        bad_start = i
        break

for i in range(bad_start, len(lines)):
    if ", 'i'), '');" in lines[i]:
        bad_end = i
        break

if bad_start != -1 and bad_end != -1:
    print(f"Found bad section from {bad_start} to {bad_end}")
    
    # We will replace from bad_start to bad_end + 1 (which includes the closing brace if it's there)
    # Actually let's just see what's around bad_start
    print("bad_start line:", lines[bad_start].strip())
    print("bad_end line:", lines[bad_end].strip())
    
    # The correct replacement:
    correct_lines = [
        "              displayName = displayName.replace(new RegExp(`\\\\s*\\\\(?\\\\[?\\\\s*${item.size}\\\\s*\\\\]?\\\\)?\\\\s*$`, 'i'), '');\n",
        "            }\n"
    ]
    
    # Let's check what line follows bad_end. If it's "}", we replace that too.
    end_replace_idx = bad_end
    if lines[bad_end + 1].strip() == "}":
        end_replace_idx = bad_end + 1

    new_lines = lines[:bad_start] + correct_lines + lines[end_replace_idx + 1:]
    
    with open("src/components/PickingTasksView.tsx", "w") as f:
        f.writelines(new_lines)
    print("Fixed!")
else:
    print("Could not find bad section")
