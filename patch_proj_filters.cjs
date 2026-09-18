const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

content = content.replace(
  /<select\s*value=\{projectStatusFilter\}\s*onChange=\{\(e\) => setProjectStatusFilter\(e\.target\.value\)\}\s*className="px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary\/50 outline-none min-w-\[150px\]"\s*>\s*<option value="all">Semua Status<\/option>\s*<option value="planned">Mulai \(Planned\)<\/option>\s*<option value="in_progress">Berjalan \(In Progress\)<\/option>\s*<option value="review">Evaluasi \(Review\)<\/option>\s*<option value="completed">Selesai \(Completed\)<\/option>\s*<option value="on_hold">Ditunda \(On Hold\)<\/option>\s*<\/select>/,
  `<select
                value={projectStatusFilter}
                onChange={(e) => setProjectStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none min-w-[150px] bg-white"
              >
                <option value="all">Semua Status</option>
                <option value="planned">Mulai (Planned)</option>
                <option value="in_progress">Berjalan (In Progress)</option>
                <option value="review">Evaluasi (Review)</option>
                <option value="completed">Selesai (Completed)</option>
                <option value="on_hold">Ditunda (On Hold)</option>
              </select>
              <select
                value={projectPriorityFilter}
                onChange={(e) => setProjectPriorityFilter(e.target.value)}
                className="px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none min-w-[150px] bg-white"
              >
                <option value="all">Semua Urgensi</option>
                <option value="low">Rendah (Low)</option>
                <option value="medium">Sedang (Medium)</option>
                <option value="high">Tinggi (High)</option>
                <option value="urgent">Mendesak (Urgent)</option>
              </select>
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                className="px-4 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none min-w-[150px] bg-white"
              >
                <option value="all">Semua Pembuat</option>
                {[...new Set(projects.map(p => p.created_by).filter(Boolean))].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>`
);

// We need a quick way to update project status.
// Let's replace the project status badge with a select dropdown for easy updating.
content = content.replace(
  /\{p\.status === 'completed' \&\& <CheckCircle2 className="w-5 h-5 text-green-500" \/>\}\s*\{p\.status === 'in_progress' \&\& <Clock className="w-5 h-5 text-blue-500" \/>\}\s*\{p\.status === 'planned' \&\& <Calendar className="w-5 h-5 text-purple-500" \/>\}\s*\{p\.status === 'review' \&\& <Eye className="w-5 h-5 text-orange-500" \/>\}\s*\{p\.status === 'on_hold' \&\& <AlertTriangle className="w-5 h-5 text-red-500" \/>\}/,
  `{/* Quick status dropdown */}
                            <select
                              value={p.status}
                              onClick={e => e.stopPropagation()}
                              onChange={async (e) => {
                                const newStatus = e.target.value as ProjectStatus;
                                try {
                                  await saveProject({ ...p, status: newStatus, progress: newStatus === 'completed' ? 100 : p.progress });
                                  loadData();
                                } catch(err) {
                                  console.error(err);
                                }
                              }}
                              className={\`appearance-none cursor-pointer border-none bg-transparent outline-none font-medium text-sm pr-6 \${
                                p.status === 'completed' ? 'text-green-600' :
                                p.status === 'in_progress' ? 'text-blue-600' :
                                p.status === 'planned' ? 'text-purple-600' :
                                p.status === 'review' ? 'text-orange-600' :
                                'text-red-600'
                              }\`}
                            >
                              <option value="planned">Mulai</option>
                              <option value="in_progress">Berjalan</option>
                              <option value="review">Evaluasi</option>
                              <option value="completed">Selesai</option>
                              <option value="on_hold">Ditunda</option>
                            </select>
                            {p.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500 absolute right-1 pointer-events-none" />}
                            {p.status === 'in_progress' && <Clock className="w-4 h-4 text-blue-500 absolute right-1 pointer-events-none" />}
                            {p.status === 'planned' && <Calendar className="w-4 h-4 text-purple-500 absolute right-1 pointer-events-none" />}
                            {p.status === 'review' && <Eye className="w-4 h-4 text-orange-500 absolute right-1 pointer-events-none" />}
                            {p.status === 'on_hold' && <AlertTriangle className="w-4 h-4 text-red-500 absolute right-1 pointer-events-none" />}
                          `
);

// We need to fix the parent div of the status select to allow absolute positioning for the icon
content = content.replace(
  /<div className="flex items-center gap-2 bg-gray-50 px-3 py-1\.5 rounded-lg">/,
  `<div className="flex items-center gap-1 bg-gray-50 px-2 py-1.5 rounded-lg relative overflow-hidden">`
);


fs.writeFileSync('src/components/AgendaView.tsx', content);
