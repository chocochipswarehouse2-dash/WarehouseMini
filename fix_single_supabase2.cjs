const fs = require('fs');
let code = fs.readFileSync('src/services/supabase.ts', 'utf-8');

const oldReturn = `    }
    return true;
  } catch (err) {
    console.warn('Supabase remote sync failed, but task saved to local cache:', err);
    return true;
  }
}`;

const newReturn = `    }
    
    // Also sync to peminjaman (legacy support)
    if (cleanNoSj.startsWith('SPS') || cleanNoSj.startsWith('PJM')) {
      await supabaseFetch('peminjaman', 'PATCH', { 
        status: 'SELESAI'
      }, \`no_peminjaman=eq.\${encodeURIComponent(cleanNoSj)}\`).catch(() => {});
    }

    return true;
  } catch (err) {
    console.warn('Supabase remote sync failed, but task saved to local cache:', err);
    return true;
  }
}`;

if (code.includes(oldReturn)) {
  code = code.replace(oldReturn, newReturn);
  fs.writeFileSync('src/services/supabase.ts', code);
  console.log('Fixed single supabase sync to peminjaman');
} else {
  console.log('Could not find oldReturn block');
}
