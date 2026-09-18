const fs = require('fs');
let content = fs.readFileSync('src/components/AgendaView.tsx', 'utf8');

const regexStatus = /<span className=\{\`text-\[10px\] font-black uppercase px-2\.5 py-1 rounded-md tracking-wider \$\{stCfg\.badge\}\`\}>\s*\{stCfg\.label\}\s*<\/span>/;

const replacementStatus = `<select
                          value={proj.status}
                          onChange={async (e) => {
                            const newStatus = e.target.value;
                            try {
                              await saveProject({ 
                                ...proj, 
                                status: newStatus as any, 
                                progress: newStatus === 'completed' ? 100 : proj.progress 
                              });
                              loadData();
                            } catch(err) {
                              console.error(err);
                            }
                          }}
                          className={\`text-[10px] font-black uppercase px-2 py-1 rounded-md tracking-wider cursor-pointer border-none outline-none appearance-none \${stCfg.badge}\`}
                        >
                          <option value="planned">MULAI (PLANNED)</option>
                          <option value="in_progress">BERJALAN (IN PROGRESS)</option>
                          <option value="review">EVALUASI (REVIEW)</option>
                          <option value="completed">SELESAI (COMPLETED)</option>
                          <option value="on_hold">DITUNDA (ON HOLD)</option>
                        </select>`;

content = content.replace(regexStatus, replacementStatus);

fs.writeFileSync('src/components/AgendaView.tsx', content);
