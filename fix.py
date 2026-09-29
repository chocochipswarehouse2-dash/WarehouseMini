import re

with open('src/components/SettingsModal.tsx', 'r') as f:
    content = f.read()

# Fix groupKeys map
content = re.sub(r'const groupKeys = group\.permissions\.map\(\(p\) => p\.key\);', r'const groupKeys = group.permissions.map((p) => p.key as UserPermissionKey);', content)

# Fix onChange toggle permission
content = re.sub(r'onChange=\{\(\) => handleTogglePermission\(p\.key\)\}', r'onChange={() => handleTogglePermission(p.key as UserPermissionKey)}', content)

with open('src/components/SettingsModal.tsx', 'w') as f:
    f.write(content)
