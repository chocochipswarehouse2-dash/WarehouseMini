const fs = require('fs');
let code = fs.readFileSync('src/components/MutasiLogView.tsx', 'utf8');

const target = `    // Supabase Realtime via global store
    let debounceTimer: any = null;
    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadLogs();
      }, 400);
    };

    const unsub = globalRealtimeStore.subscribe('log_produk', triggerDebouncedSync);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };`;

const replacement = `    // Supabase Realtime via global store
    let debounceTimer: any = null;
    let newLogsQueue: any[] = [];

    const handleNewLog = (payload: any) => {
      if (payload && payload.new && Object.keys(payload.new).length > 0) {
        newLogsQueue.push(payload.new);
      }
      
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (newLogsQueue.length > 0) {
          setLogs((prev) => {
            const combined = [...newLogsQueue, ...prev];
            combined.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
            const unique = Array.from(
              new Map(combined.map((item) => [item.id || \`\${item.invoice}_\${item.sku}_\${item.created_at}\`, item])).values()
            );
            return unique;
          });
          newLogsQueue = [];
        }
      }, 500);
    };

    const unsub = globalRealtimeStore.subscribe('log_produk', handleNewLog);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };`;

code = code.replace(target, replacement);
fs.writeFileSync('src/components/MutasiLogView.tsx', code);
