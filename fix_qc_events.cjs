const fs = require('fs');
let lqc = fs.readFileSync('src/components/LaporanQcView.tsx', 'utf8');

const target = `  useEffect(() => {
    loadQcReports();
  }, []);`;

const replace = `  useEffect(() => {
    loadQcReports();
    
    // Listen to settings modal events
    const handleForceSync = () => loadQcReports();
    const handleOpenSql = () => setShowSqlModal(true);
    
    window.addEventListener('force-qc-sync', handleForceSync);
    window.addEventListener('open-qc-sql', handleOpenSql);
    
    return () => {
      window.removeEventListener('force-qc-sync', handleForceSync);
      window.removeEventListener('open-qc-sql', handleOpenSql);
    };
  }, []);`;

lqc = lqc.replace(target, replace);
fs.writeFileSync('src/components/LaporanQcView.tsx', lqc, 'utf8');
console.log('Laporan QC updated');
