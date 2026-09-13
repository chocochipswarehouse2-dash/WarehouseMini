const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "dashboard: 'dashboard',",
  "dashboard: 'dashboard',\n  operasi_stok: 'operasi-stok',"
);

code = code.replace(
  "'dashboard': 'dashboard',",
  "'dashboard': 'dashboard',\n  'operasi-stok': 'operasi_stok',"
);

code = code.replace(
  "const [confirmDialog, setConfirmDialog] = useState<{",
  "const [confirmDialog, setConfirmDialog] = useState<{\n    cancelText?: string;\n    confirmText?: string;"
);

code = code.replace(
  "}>({ isOpen: false, title: '', message: '', onConfirm: () => {} });",
  "}>({ isOpen: false, title: '', message: '', onConfirm: () => {}, cancelText: 'Batal', confirmText: 'Ya, Lanjutkan' });"
);

// RoadmapView
code = code.replace(
  "<RoadmapView />",
  "<RoadmapView />"
);

// Ah wait, it errored on line 1586: "RoadmapView" in my bottomCode block? No, I added RoadmapView without props. Wait.
