import os
import re

app_path = "src/App.tsx"
with open(app_path, "r") as f:
    content = f.read()

# Remove Navbar import
content = re.sub(r"import\s+\{\s*Navbar\s*\}\s+from\s+['\"]\.?/?components/Navbar['\"];?\n", "", content)

# Remove <Navbar ... /> from render
navbar_regex = re.compile(r"<\s*Navbar\s+[^>]*\/>", re.MULTILINE | re.DOTALL)
content = navbar_regex.sub("", content)

# Add floating hamburger button for mobile inside the <main> tag, just before ErrorBoundary
floating_btn = """
              {/* Floating Mobile Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden fixed bottom-6 right-6 z-40 p-3.5 bg-primary-500 text-white rounded-full shadow-lg shadow-primary-500/40 hover:bg-primary-600 hover:scale-105 active:scale-95 transition-all"
                title="Buka Menu Navigasi"
              >
                <Menu className="w-6 h-6" />
              </button>
"""
content = content.replace("<ErrorBoundary", floating_btn + "\n          <ErrorBoundary")

with open(app_path, "w") as f:
    f.write(content)

# Now let's fix paddings in all views
import glob

views = glob.glob("src/components/**/*View.tsx", recursive=True)
views.extend(glob.glob("src/components/*View.tsx", recursive=True))

for view in set(views):
    with open(view, "r") as f:
        v_content = f.read()
    
    # Reduce paddings and gaps
    v_content = v_content.replace('p-4 sm:p-6', 'p-2 sm:p-3')
    v_content = v_content.replace('p-4 sm:p-5', 'p-2 sm:p-3')
    v_content = v_content.replace('space-y-6', 'space-y-3')
    v_content = v_content.replace('space-y-4', 'space-y-2')
    v_content = v_content.replace('gap-6', 'gap-3')
    v_content = v_content.replace('gap-4', 'gap-2')
    v_content = v_content.replace('mb-6', 'mb-3')
    v_content = v_content.replace('mb-4', 'mb-2')
    v_content = v_content.replace('mt-6', 'mt-3')
    v_content = v_content.replace('mt-4', 'mt-2')
    v_content = v_content.replace('py-4', 'py-2')
    v_content = v_content.replace('py-6', 'py-3')
    v_content = v_content.replace('px-4', 'px-2')
    v_content = v_content.replace('px-6', 'px-3')

    with open(view, "w") as f:
        f.write(v_content)

print("Done fixing App and Views padding")
