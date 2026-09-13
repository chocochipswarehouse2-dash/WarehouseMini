const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

code = code.replace(
  "  const [confirmDialog, setConfirmDialog] = useState<{\n    isOpen: boolean;\n    title: string;\n    message: string;\n    onConfirm: () => void;\n  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });",
  "  const [confirmDialog, setConfirmDialog] = useState<{\n    isOpen: boolean;\n    title: string;\n    message: string;\n    onConfirm: () => void;\n    cancelText?: string;\n    confirmText?: string;\n  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });"
);

fs.writeFileSync('src/App.tsx', code);
console.log('Fixed confirm');
