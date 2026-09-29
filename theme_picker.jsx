              {/* Theme Color Picker */}
              <div className="p-3.5 bg-slate-50 dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">
                      Warna Aksen Tema
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Pilih warna tema utama aplikasi sesuai selera Anda
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { id: 'rose', name: 'Rose / Pink', colorClass: 'bg-rose-500' },
                    { id: 'blue', name: 'Blue', colorClass: 'bg-blue-500' },
                    { id: 'emerald', name: 'Emerald', colorClass: 'bg-emerald-500' },
                    { id: 'purple', name: 'Purple', colorClass: 'bg-purple-500' },
                    { id: 'orange', name: 'Orange', colorClass: 'bg-orange-500' },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeColor(theme.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                        themeColor === theme.id
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${theme.colorClass}`}></span>
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
