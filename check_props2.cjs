const fs = require('fs');
const files = [
  'src/components/hr/HrApprovalView.tsx',
  'src/components/hr/HrRekapView.tsx',
  'src/components/PusatResolusi/PusatResolusiView.tsx',
  'src/components/SupabaseMigrationView.tsx',
  'src/components/CetakLabelView.tsx',
  'src/components/PesananSaya/PesananSayaView.tsx'
];

files.forEach(f => {
  if(fs.existsSync(f)) {
    const code = fs.readFileSync(f, 'utf8');
    if (code.includes('onNotify')) console.log(f, 'EXPECTS onNotify');
    if (code.includes('onShowToast')) console.log(f, 'EXPECTS onShowToast');
  }
});
