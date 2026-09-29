const fs = require('fs');
let content = fs.readFileSync('src/components/QuickTagToolbar.tsx', 'utf8');

content = content.replace(/<div\n      id="quickTagToolbar"/, `<div
      id="quickTagToolbar"
      style={{ display: isVisible ? 'block' : 'none' }}`);

content = content.replace(/interface QuickTagToolbarProps {/, `interface QuickTagToolbarProps {
  isVisible?: boolean;`);

content = content.replace(/export const QuickTagToolbar: React.FC<QuickTagToolbarProps> = \({/, `export const QuickTagToolbar: React.FC<QuickTagToolbarProps> = ({
  isVisible = true,`);

fs.writeFileSync('src/components/QuickTagToolbar.tsx', content);
