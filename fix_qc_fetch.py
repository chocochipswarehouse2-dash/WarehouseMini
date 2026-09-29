import re

with open('src/services/supabase.ts', 'r') as f:
    content = f.read()

# Fix fetchQcReportsFromSupabase
content = content.replace('''
  // Jika berhasil mengambil data dari server, jadikan data server sebagai sumber kebenaran (authoritative)
  // namun pertahankan data offline/pending (id > 1000000000)
  if (mergedMap.size > 0 || (mergedMap.size === 0 && localData.length > 0)) {
    const remoteReportNos = new Set(Array.from(mergedMap.keys()));
    const offlinePending = localData.filter((r) => 
      typeof r.id === 'number' && r.id > 1000000000 && !remoteReportNos.has(r.report_no)
    );
    for (const offline of offlinePending) {
      mergedMap.set(offline.report_no, offline);
    }
  }
''', '''
  // Supabase is the single source of truth.
  // We unconditionally clear local cache and use whatever the server gave us (even if it's empty).
  // We only preserve offline items that haven't been synced yet (id > 1000000000).
  const remoteReportNos = new Set(Array.from(mergedMap.keys()));
  const offlinePending = localData.filter((r) => 
    typeof r.id === 'number' && r.id > 1000000000 && !remoteReportNos.has(r.report_no)
  );
  for (const offline of offlinePending) {
    mergedMap.set(offline.report_no, offline);
  }
''')

# Fix fetchPerbaikanTicketsFromSupabase
content = content.replace('''
    if (allRemoteTickets.length > 0) {
      // Supabase is authoritative. Keep localData in sync with authoritative Supabase list
      const remoteTicketNos = new Set(allRemoteTickets.map(t => t.ticket_no).filter(Boolean));
      const offlinePending = localData.filter(t => 
        typeof t.id === 'number' && t.id > 1000000000 && !remoteTicketNos.has(t.ticket_no)
      );

      const merged = [...allRemoteTickets, ...offlinePending].sort((a, b) => 
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      localData = merged;
      try {
        localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(localData));
      } catch {}
      return localData;
    }
  } catch (err) {
    console.warn('Gagal memuat perbaikan_tickets dari Supabase, memuat dari local cache:', err);
  }

  return localData;
''', '''
    // Supabase is authoritative. If we successfully fetched (no errors), we replace the local cache completely.
    // We only preserve offline items that haven't been synced yet (id > 1000000000).
    const remoteTicketNos = new Set(allRemoteTickets.map(t => t.ticket_no).filter(Boolean));
    const offlinePending = localData.filter(t => 
      typeof t.id === 'number' && t.id > 1000000000 && !remoteTicketNos.has(t.ticket_no)
    );

    const merged = [...allRemoteTickets, ...offlinePending].sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    localData = merged;
    try {
      localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(localData));
    } catch {}
    return localData;
  } catch (err) {
    console.warn('Gagal memuat perbaikan_tickets dari Supabase, memuat dari local cache:', err);
  }

  return localData;
''')

with open('src/services/supabase.ts', 'w') as f:
    f.write(content)

