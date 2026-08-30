import * as fs from 'fs';
let contentSidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');
contentSidebar = contentSidebar.replace(/Supabase Live/g, 'Live Database');
contentSidebar = contentSidebar.replace(/Live Supabase/g, 'Live Database');
fs.writeFileSync('src/components/Sidebar.tsx', contentSidebar);

let contentNavbar = fs.readFileSync('src/components/Navbar.tsx', 'utf-8');
contentNavbar = contentNavbar.replace(/Supabase Realtime/g, 'Database Realtime');
fs.writeFileSync('src/components/Navbar.tsx', contentNavbar);
