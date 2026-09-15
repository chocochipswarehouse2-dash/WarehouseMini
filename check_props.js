const fs = require('fs');
const files = [
  'src/components/MutasiLogView.tsx',
  'src/components/StockOpnameView.tsx',
  'src/components/PickingTasksView.tsx',
  'src/components/QualityControlView.tsx',
  'src/components/hr/KaryawanView.tsx',
  'src/components/hr/PresensiView.tsx',
  'src/components/hr/RosterShiftView.tsx',
  'src/components/hr/LemburCutiView.tsx',
  'src/components/PusatResolusi/PusatResolusiView.tsx',
  'src/components/SupabaseMigrationView.tsx'
];

files.forEach(f => {
  if(fs.existsSync(f)) {
    const code = fs.readFileSync(f, 'utf8');
    if (code.includes('onNotify:')) console.log(f, 'EXPECTS onNotify');
    if (code.includes('onShowToast:')) console.log(f, 'EXPECTS onShowToast');
  }
});
