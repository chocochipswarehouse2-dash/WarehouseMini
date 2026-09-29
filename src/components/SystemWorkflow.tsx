import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, ArrowLeft, Edit, Trash2, Plus, CheckCircle2, 
  Database, MessageSquare, Save, Settings, X, RefreshCw, Layers, AlignLeft
} from 'lucide-react';
import { getSystemDocs, saveSystemDoc } from '../services/supabase';

export interface FlowNode {
  id: string;
  title: string;
  desc: string;
  dbInfo: string[];
  features: string[];
}

export interface FlowCategory {
  id: string;
  title: string;
  desc: string;
  nodes: FlowNode[];
  comment: string;
}

const DEFAULT_FLOWS: FlowCategory[] = [
  {
    id: 'flow_inbound',
    title: '1. Inbound & Laporan QC',
    desc: 'Alur penerimaan barang produksi hingga inspeksi mutu.',
    nodes: [
      {
        id: 'n_in1', title: 'Penerimaan Produksi', desc: 'Kedatangan barang Lokal CMT atau Kargo.',
        dbInfo: ['INSERT: penerimaan_produksi', 'SELECT: master_produk'],
        features: ['Input Qty & Warna', 'Cetak Bukti Terima']
      },
      {
        id: 'n_in2', title: 'Inspeksi QC', desc: 'Hitung jumlah OKE dan REJECT.',
        dbInfo: ['GET: penerimaan_produksi', 'INSERT: qc_reports'],
        features: ['Validasi Standar Mutu', 'Upload Foto Reject']
      },
      {
        id: 'n_in3', title: 'Stok Masuk (OKE)', desc: 'Barang lolos QC masuk fisik.',
        dbInfo: ['INSERT: log_produk (IN)'],
        features: ['Update Saldo Realtime']
      },
      {
        id: 'n_in4', title: 'Tiket Perbaikan', desc: 'Barang reject masuk antrean repair.',
        dbInfo: ['INSERT: perbaikan_tickets'],
        features: ['Auto-generate tiket perbaikan']
      }
    ],
    comment: 'Frontend: Saat QC submit, backend memecah data menjadi 2 flow (log_produk untuk OKE, perbaikan_tickets untuk REJECT).'
  },
  {
    id: 'flow_peminjaman',
    title: '2. Peminjaman & Stok Blok F',
    desc: 'Modul form peminjaman barang dan pemantauan rak khusus Blok F.',
    nodes: [
      {
        id: 'n_pem1', title: 'Form Peminjaman', desc: 'Input peminjaman barang oleh tim/user.',
        dbInfo: ['SELECT: master_produk, stok_real, lokasi', 'INSERT: peminjaman', 'INSERT: picking_list'],
        features: ['Kirim Notifikasi WA otomatis', 'Cetak Surat Jalan (SJ) PDF']
      },
      {
        id: 'n_pem2', title: 'Stok Blok F', desc: 'Monitoring stok terpisah untuk area Blok F.',
        dbInfo: ['SELECT: master_produk, stok_real, lokasi', 'WHERE: lokasi = Blok F'],
        features: ['Filter per Rak/Lokasi', 'Realtime tracking saldo']
      },
      {
        id: 'n_pem3', title: 'Pengembalian', desc: 'Penerimaan kembali barang pinjaman.',
        dbInfo: ['UPDATE: peminjaman (status)', 'INSERT: log_produk (IN)'],
        features: ['Validasi Kondisi Barang', 'Update Status Selesai']
      }
    ],
    comment: 'Catatan AI: Pastikan logic filter stok_real pada Blok F tidak tercampur dengan gudang utama agar tidak terjadi double-counting saat fitur Stock Opname dijalankan.'
  },
  {
    id: 'flow_tarikan',
    title: '3. Tarikan MD (Surat Jalan)',
    desc: 'Komparasi dokumen Surat Jalan dari MD vs stok fisik.',
    nodes: [
      {
        id: 'n_tar1', title: 'Upload CSV', desc: 'Upload file Tarikan SJ MD.',
        dbInfo: ['Parsing CSV Client-Side (Papaparse)'],
        features: ['Mapping Kolom Otomatis', 'Validasi Format']
      },
      {
        id: 'n_tar2', title: 'Scan Fisik', desc: 'Scan barcode fisik aktual.',
        dbInfo: ['SELECT: master_produk', 'State: React Local Context'],
        features: ['Bunyi Beep Scanner', 'Counter Realtime Item']
      },
      {
        id: 'n_tar3', title: 'Komparasi Hasil', desc: 'Cek selisih dokumen vs fisik.',
        dbInfo: ['INSERT: pengecekan_sj_record'],
        features: ['Highlight Selisih/Kurang/Lebih', 'Export Report Excel/PDF']
      }
    ],
    comment: ''
  },
  {
    id: 'flow_picking',
    title: '4. Picking & Outbound',
    desc: 'Pengambilan barang dari rak hingga dipacking.',
    nodes: [
      {
        id: 'n_pick1', title: 'Request Picking', desc: 'Generate daftar ambil barang via scanner atau App Script.',
        dbInfo: ['INSERT: picking_list', 'SELECT: log_produk'],
        features: ['Auto-routing Rak', 'Generate QR List']
      },
      {
        id: 'n_pick2', title: 'Checker Ambil', desc: 'Gudang scan untuk ambil barang dari rak.',
        dbInfo: ['UPDATE: picking_list (qty_picked, status)'],
        features: ['Validasi Barcode per Item', 'Lock Task User']
      },
      {
        id: 'n_pick3', title: 'Packing', desc: 'Scan ulang validasi (resi) saat bungkus kardus.',
        dbInfo: ['UPDATE: picking_list (status: SELESAI)', 'INSERT: log_produk (OUT)'],
        features: ['Cetak Label Pengiriman', 'Notif Selesai Packing']
      }
    ],
    comment: ''
  }
];

const Arrow = () => (
  <div className="flex-1 h-0.5 bg-slate-300 dark:bg-slate-700 relative min-w-[20px] shrink-0 z-0 hidden lg:block">
    <ArrowRight className="absolute -right-2 -top-2 w-4 h-4 text-slate-400 dark:text-slate-600" />
  </div>
);
const DownArrow = () => (
  <div className="h-6 w-0.5 bg-slate-300 dark:bg-slate-700 relative my-1 z-0 lg:hidden block">
    <ArrowRight className="absolute -bottom-2 -left-2 w-4 h-4 text-slate-400 dark:text-slate-600 rotate-90" />
  </div>
);

export default function SystemWorkflow({ session, onShowToast }: any) {
  const [flows, setFlows] = useState<FlowCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  const [editingNode, setEditingNode] = useState<{ catId: string, node: FlowNode } | null>(null);
  const [editNodeForm, setEditNodeForm] = useState({ title: '', desc: '', dbInfo: '', features: '' });

  useEffect(() => {
    fetchFlows();
  }, []);

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const docs = await getSystemDocs();
      const target = docs.find(d => d.section_id === 'dynamic_workflow_v1');
      if (target && target.content) {
        setFlows(JSON.parse(target.content));
      } else {
        setFlows(DEFAULT_FLOWS);
      }
    } catch (err) {
      console.error(err);
      setFlows(DEFAULT_FLOWS);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlobal = async (updatedFlows: FlowCategory[]) => {
    setSaving(true);
    try {
      await saveSystemDoc({
        section_id: 'dynamic_workflow_v1',
        content: JSON.stringify(updatedFlows),
        updated_by: session?.name || session?.username || 'Admin'
      });
      setFlows(updatedFlows);
      onShowToast('Workflow berhasil disimpan!', 'success');
    } catch (err) {
      onShowToast('Gagal menyimpan workflow', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Node Actions
  const openEditNode = (catId: string, node: FlowNode) => {
    setEditingNode({ catId, node });
    setEditNodeForm({
      title: node.title,
      desc: node.desc,
      dbInfo: node.dbInfo.join('\n'),
      features: node.features.join('\n')
    });
  };

  const saveEditNode = () => {
    if (!editingNode) return;
    const updated = flows.map(cat => {
      if (cat.id === editingNode.catId) {
        return {
          ...cat,
          nodes: cat.nodes.map(n => n.id === editingNode.node.id ? {
            ...n,
            title: editNodeForm.title,
            desc: editNodeForm.desc,
            dbInfo: editNodeForm.dbInfo.split('\n').filter(s => s.trim() !== ''),
            features: editNodeForm.features.split('\n').filter(s => s.trim() !== '')
          } : n)
        };
      }
      return cat;
    });
    setEditingNode(null);
    handleSaveGlobal(updated);
  };

  const deleteNode = (catId: string, nodeId: string) => {
    if (!window.confirm('Hapus node ini?')) return;
    const updated = flows.map(cat => {
      if (cat.id === catId) {
        return { ...cat, nodes: cat.nodes.filter(n => n.id !== nodeId) };
      }
      return cat;
    });
    handleSaveGlobal(updated);
  };

  const addNode = (catId: string) => {
    const newNode: FlowNode = {
      id: 'n_' + Date.now(),
      title: 'Node Baru',
      desc: 'Deskripsi langkah',
      dbInfo: [],
      features: []
    };
    const updated = flows.map(cat => {
      if (cat.id === catId) {
        return { ...cat, nodes: [...cat.nodes, newNode] };
      }
      return cat;
    });
    handleSaveGlobal(updated);
  };

  const moveNode = (catId: string, nodeId: string, dir: -1 | 1) => {
    const updated = flows.map(cat => {
      if (cat.id === catId) {
        const idx = cat.nodes.findIndex(n => n.id === nodeId);
        if (idx === -1) return cat;
        if (idx + dir < 0 || idx + dir >= cat.nodes.length) return cat;
        const newNodes = [...cat.nodes];
        const temp = newNodes[idx];
        newNodes[idx] = newNodes[idx + dir];
        newNodes[idx + dir] = temp;
        return { ...cat, nodes: newNodes };
      }
      return cat;
    });
    handleSaveGlobal(updated);
  };

  const updateCategoryComment = (catId: string, comment: string) => {
    const updated = flows.map(cat => cat.id === catId ? { ...cat, comment } : cat);
    setFlows(updated); // local state first
  };

  const saveCategoryComment = (catId: string) => {
    handleSaveGlobal(flows);
  };

  const addCategory = () => {
    const newCat: FlowCategory = {
      id: 'c_' + Date.now(),
      title: 'Kategori Workflow Baru',
      desc: 'Deskripsi workflow',
      nodes: [],
      comment: ''
    };
    handleSaveGlobal([...flows, newCat]);
  };

  const deleteCategory = (catId: string) => {
    if (!window.confirm('Hapus seluruh workflow ini?')) return;
    handleSaveGlobal(flows.filter(c => c.id !== catId));
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Memuat workflow...</div>;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-50 dark:bg-[#0a0f1c] h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto w-full space-y-8 pb-20">
        
        {/* TOOLBAR */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-white dark:bg-[#131d31] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm gap-4">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2 text-base">
              <Layers className="w-5 h-5 text-primary-500" />
              Interactive Workflow Builder
            </h3>
            <p className="text-xs text-slate-500 mt-1">Flowchart ini sepenuhnya dinamis. Anda bisa menambah, mengubah, dan mengomentari setiap node.</p>
          </div>
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shrink-0 cursor-pointer ${
              isEditMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            {isEditMode ? 'Tutup Mode Edit' : 'Mode Builder'}
          </button>
        </div>

        {/* FLOWS RENDERING */}
        {flows.map((cat) => (
          <div key={cat.id} className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm relative transition-all">
            
            {isEditMode && (
              <button onClick={() => deleteCategory(cat.id)} className="absolute top-4 right-4 p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <div className="mb-6 max-w-2xl pr-12">
              {isEditMode ? (
                <input 
                  className="font-black text-slate-800 dark:text-white text-lg bg-transparent border-b border-dashed border-slate-400 w-full mb-2 outline-none focus:border-primary-500 py-1" 
                  value={cat.title} 
                  onChange={(e) => setFlows(flows.map(c => c.id === cat.id ? {...c, title: e.target.value} : c))} 
                  onBlur={() => handleSaveGlobal(flows)}
                  placeholder="Judul Workflow..."
                />
              ) : (
                <h3 className="font-black text-slate-800 dark:text-white text-lg">{cat.title}</h3>
              )}
              
              {isEditMode ? (
                <input 
                  className="text-xs text-slate-500 dark:text-slate-400 bg-transparent border-b border-dashed border-slate-400 w-full outline-none focus:border-primary-500 py-1" 
                  value={cat.desc} 
                  onChange={(e) => setFlows(flows.map(c => c.id === cat.id ? {...c, desc: e.target.value} : c))} 
                  onBlur={() => handleSaveGlobal(flows)}
                  placeholder="Deskripsi singkat..."
                />
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">{cat.desc}</p>
              )}
            </div>
            
            {/* NODES ROW */}
            <div className="flex flex-col lg:flex-row items-center justify-start gap-2 lg:gap-0 overflow-x-auto pb-4 pt-2">
              {cat.nodes.map((node, idx) => (
                <React.Fragment key={node.id}>
                  <div className={`w-64 shrink-0 bg-white dark:bg-[#1a233a] rounded-xl border border-slate-200 dark:border-slate-700 p-4 relative group shadow-sm hover:shadow-md transition-shadow ${isEditMode ? 'ring-2 ring-transparent hover:ring-primary-300' : ''}`}>
                    
                    {isEditMode && (
                      <div className="absolute -top-3 right-2 flex items-center gap-1 bg-white dark:bg-slate-800 shadow-md rounded-lg border border-slate-200 dark:border-slate-700 p-1 z-20">
                        <button onClick={() => moveNode(cat.id, node.id, -1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded cursor-pointer"><ArrowLeft className="w-3 h-3"/></button>
                        <button onClick={() => openEditNode(cat.id, node)} className="p-1 hover:bg-blue-100 text-blue-600 rounded cursor-pointer"><Edit className="w-3 h-3"/></button>
                        <button onClick={() => deleteNode(cat.id, node.id)} className="p-1 hover:bg-rose-100 text-rose-600 rounded cursor-pointer"><Trash2 className="w-3 h-3"/></button>
                        <button onClick={() => moveNode(cat.id, node.id, 1)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded cursor-pointer"><ArrowRight className="w-3 h-3"/></button>
                      </div>
                    )}

                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1.5 leading-tight">{node.title}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">{node.desc}</p>
                    
                    {node.features.length > 0 && (
                      <div className="mb-3 flex flex-col gap-1.5">
                        {node.features.map((f, i) => (
                          <div key={i} className="flex gap-1.5 items-start text-[10px] text-blue-700 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20 px-2 py-1.5 rounded">
                            <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5 text-blue-500" />
                            <span className="leading-tight">{f}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {node.dbInfo.length > 0 && (
                      <div className="mt-2 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5">
                        {node.dbInfo.map((db, i) => (
                          <div key={i} className="flex gap-1.5 items-start text-[9px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1.5 rounded">
                            <Database className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
                            <span className="leading-tight break-words">{db}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {idx < cat.nodes.length - 1 && (
                    <><Arrow /><DownArrow /></>
                  )}
                </React.Fragment>
              ))}
              
              {isEditMode && (
                <div 
                  onClick={() => addNode(cat.id)}
                  className="ml-6 lg:ml-4 w-12 h-12 shrink-0 rounded-full border-2 border-dashed border-slate-300 hover:border-primary-500 flex items-center justify-center cursor-pointer transition-colors bg-white dark:bg-[#1a233a] hover:bg-slate-50 text-slate-400 hover:text-primary-500 shadow-sm"
                >
                  <Plus className="w-5 h-5" />
                </div>
              )}
            </div>

            {/* COMMENTS SECTION */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-700/50">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Catatan Developer / Catatan Fitur</h4>
              </div>
              <div className="flex flex-col gap-2 relative">
                <textarea 
                  value={cat.comment}
                  onChange={(e) => updateCategoryComment(cat.id, e.target.value)}
                  onBlur={() => saveCategoryComment(cat.id)}
                  placeholder="Klik di sini untuk menuliskan penjelasan teknis, keluhan, atau ide terkait alur di atas..."
                  className="w-full bg-slate-50 dark:bg-[#0a0f1c] border border-slate-200 dark:border-slate-700/50 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 min-h-[80px] outline-none focus:border-amber-500 focus:bg-white dark:focus:bg-[#1a233a] transition-all"
                />
                <div className="flex justify-between items-center text-[9px] text-slate-400 px-1">
                  <span>Perubahan tersimpan otomatis saat Anda selesai mengetik (klik di luar kotak).</span>
                </div>
              </div>
            </div>

          </div>
        ))}

        {isEditMode && (
          <button onClick={addCategory} className="w-full p-6 border-2 border-dashed border-slate-300 hover:border-primary-500 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-primary-600 transition-colors cursor-pointer bg-white/50 dark:bg-[#131d31]/50 backdrop-blur-sm">
            <Plus className="w-8 h-8" />
            <span className="font-bold">Tambah Workflow Baru</span>
          </button>
        )}

      </div>

      {/* EDIT NODE MODAL */}
      {editingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-[#0a0f1c]">
              <h3 className="font-bold text-slate-800 dark:text-white">Edit Langkah Workflow</h3>
              <button onClick={() => setEditingNode(null)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Judul Langkah</label>
                <input 
                  value={editNodeForm.title} onChange={e => setEditNodeForm({...editNodeForm, title: e.target.value})}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0a0f1c] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Deskripsi Singkat</label>
                <input 
                  value={editNodeForm.desc} onChange={e => setEditNodeForm({...editNodeForm, desc: e.target.value})}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0a0f1c] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary-500" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Fitur / Aksi UI
                  </label>
                  <textarea 
                    value={editNodeForm.features} onChange={e => setEditNodeForm({...editNodeForm, features: e.target.value})}
                    placeholder="Contoh:&#10;Kirim WA&#10;Cetak PDF"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0a0f1c] rounded-lg px-3 py-2 text-xs h-28 outline-none focus:border-blue-500 whitespace-pre-wrap leading-relaxed" 
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block">*Pisahkan tiap poin dengan Enter (Baris baru)</span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                    <Database className="w-3 h-3" /> Query DB / Logic
                  </label>
                  <textarea 
                    value={editNodeForm.dbInfo} onChange={e => setEditNodeForm({...editNodeForm, dbInfo: e.target.value})}
                    placeholder="Contoh:&#10;SELECT: master_produk&#10;INSERT: peminjaman"
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0a0f1c] rounded-lg px-3 py-2 text-xs font-mono h-28 outline-none focus:border-emerald-500 whitespace-pre-wrap leading-relaxed" 
                  />
                  <span className="text-[9px] text-slate-400 mt-1 block">*Pisahkan tiap poin dengan Enter (Baris baru)</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0a0f1c] flex justify-end gap-3">
              <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors">Batal</button>
              <button onClick={saveEditNode} className="px-6 py-2 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-xl flex items-center gap-2 shadow-md cursor-pointer transition-colors">
                <Save className="w-4 h-4" /> Simpan Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
