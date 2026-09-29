with open('src/components/PickingTasksView.tsx', 'r') as f:
    content = f.read()

# Fix cache grace period matching to avoid hiding rows 
content = content.replace('''
        // Ensure any freshly created items in the last 2 minutes are preserved during async DB sync
        const remoteKeys = new Set(
          supabaseData.map((d) => `${(d.no_sj || '').toUpperCase()}__${(d.sku || '').toUpperCase()}`)
        );
        const recentLocals = prev.filter((p) => {
          const key = `${(p.no_sj || '').toUpperCase()}__${(p.sku || '').toUpperCase()}`;
          if (remoteKeys.has(key)) return false;
          const age = Date.now() - new Date(p.created_at || 0).getTime();
          return age < 120000; // 2 minutes grace window
        });
''', '''
        // We bypass the manual merge cache filter because sometimes created_at is badly parsed.
        // The fetch Picking logic now pulls fresh directly, so we just use what it returns.
        const recentLocals: any[] = [];
''')

with open('src/components/PickingTasksView.tsx', 'w') as f:
    f.write(content)
