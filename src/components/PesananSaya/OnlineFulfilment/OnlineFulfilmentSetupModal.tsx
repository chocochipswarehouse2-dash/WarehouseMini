import React, { useState } from 'react';
import {
  X,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  Settings,
  Database,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import {
  OnlineFulfilmentSetup,
  CourierGroup,
  COURIER_GROUP_LABELS,
  SpecialItemRule,
} from '../../../services/onlineFulfilmentService';

interface OnlineFulfilmentSetupModalProps {
  setup: OnlineFulfilmentSetup;
  storageMode: 'table' | 'system_docs';
  isAdmin: boolean;
  onClose: () => void;
  onSave: (next: OnlineFulfilmentSetup) => Promise<void>;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

type SetupTab = 'umum' | 'hadiah_po' | 'store_alert';

export const OnlineFulfilmentSetupModal: React.FC<OnlineFulfilmentSetupModalProps> = ({
  setup,
  storageMode,
  isAdmin,
  onClose,
  onSave,
  onShowToast,
}) => {
  const [draft, setDraft] = useState<OnlineFulfilmentSetup>(() => JSON.parse(JSON.stringify(setup)));
  const [activeTab, setActiveTab] = useState<SetupTab>('umum');
  const [saving, setSaving] = useState(false);

  const [newPoSku, setNewPoSku] = useState('');
  const [newSpecialCode, setNewSpecialCode] = useState('');
  const [newSpecialLabel, setNewSpecialLabel] = useState('');
  const [newSpecialType, setNewSpecialType] = useState<'gift' | 'packaging'>('gift');
  const [newSpecialCheck, setNewSpecialCheck] = useState<'manual_check' | 'scan'>('manual_check');
  const [newStoreCode, setNewStoreCode] = useState('');
  const [newWaPhone, setNewWaPhone] = useState('');
  const [copiedSqlHint, setCopiedSqlHint] = useState(false);

  const moveCourierGroup = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= draft.courierGroupOrder.length) return;
    const arr = [...draft.courierGroupOrder];
    const [picked] = arr.splice(idx, 1);
    arr.splice(nextIdx, 0, picked);
    setDraft({ ...draft, courierGroupOrder: arr as CourierGroup[] });
  };

  const moveStore = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= draft.storePriority.length) return;
    const arr = [...draft.storePriority];
    const [picked] = arr.splice(idx, 1);
    arr.splice(nextIdx, 0, picked);
    setDraft({ ...draft, storePriority: arr });
  };

  const handleAddPoSku = () => {
    const clean = newPoSku.trim().toUpperCase();
    if (!clean) return;
    if (draft.preorderSkus.includes(clean)) {
      onShowToast(`SKU ${clean} sudah ada di daftar Pre-order`, 'warning');
      return;
    }
    setDraft({ ...draft, preorderSkus: [...draft.preorderSkus, clean] });
    setNewPoSku('');
  };

  const handleAddSpecialItem = () => {
    const code = newSpecialCode.trim();
    if (!code) return;
    const exists = draft.specialItems.some((s) => s.code.toLowerCase() === code.toLowerCase());
    if (exists) {
      onShowToast(`Kode item "${code}" sudah terdaftar`, 'warning');
      return;
    }
    const rule: SpecialItemRule = {
      code,
      label: newSpecialLabel.trim() || code,
      itemType: newSpecialType,
      checkMode: newSpecialCheck,
    };
    setDraft({ ...draft, specialItems: [...draft.specialItems, rule] });
    setNewSpecialCode('');
    setNewSpecialLabel('');
  };

  const handleAddStore = () => {
    const clean = newStoreCode.trim().toUpperCase();
    if (!clean) return;
    if (draft.storePriority.includes(clean)) return;
    setDraft({ ...draft, storePriority: [...draft.storePriority, clean] });
    setNewStoreCode('');
  };

  const handleAddWaPhone = () => {
    const clean = newWaPhone.replace(/[^\d+]/g, '').trim();
    if (!clean) return;
    if (draft.waAlertPhones.includes(clean)) return;
    setDraft({ ...draft, waAlertPhones: [...draft.waAlertPhones, clean] });
    setNewWaPhone('');
  };

  const handleCopySqlPath = () => {
    navigator.clipboard.writeText('tools/sql/fulfilment_online_jalur_c.sql');
    setCopiedSqlHint(true);
    onShowToast('Path skrip SQL disalin: tools/sql/fulfilment_online_jalur_c.sql', 'info');
    setTimeout(() => setCopiedSqlHint(false), 2000);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh]">
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                Pengaturan Fulfilment Online
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Urutan blok ekspedisi, jam closing, pre-order, hadiah/kemasan, dan prioritas store.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'umum' as const, label: 'Ekspedisi & Closing' },
            { id: 'hadiah_po' as const, label: 'Pre-order & Hadiah' },
            { id: 'store_alert' as const, label: 'Store, Jeda & Storage' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-xs font-bold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-5 text-xs">
          {activeTab === 'umum' && (
            <>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white mb-1">
                  Urutan Blok Ekspedisi (1 Blok = 1 Tugas Picking)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                  Nomor urut harian dibagi berurutan mengikuti prioritas blok dari atas ke bawah.
                </p>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {draft.courierGroupOrder.map((group, idx) => (
                    <div
                      key={group}
                      className="px-3 py-2.5 flex items-center justify-between bg-white dark:bg-slate-900"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold flex items-center justify-center text-slate-700 dark:text-slate-200 tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {COURIER_GROUP_LABELS[group]}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCourierGroup(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800"
                          aria-label="Naikkan"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCourierGroup(idx, 1)}
                          disabled={idx === draft.courierGroupOrder.length - 1}
                          className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800"
                          aria-label="Turunkan"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block font-bold text-slate-800 dark:text-slate-100 mb-1">
                    Jam Closing Harian
                  </label>
                  <input
                    type="time"
                    value={draft.closingHour}
                    onChange={(e) => setDraft({ ...draft, closingHour: e.target.value || '19:00' })}
                    className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/70 text-[11px] text-slate-600 dark:text-slate-300">
                  Pesanan yang diproses lewat jam closing default masuk nomor urut besok, namun siapa pun tetap bisa memilih memproses untuk hari ini tanpa persetujuan khusus.
                </div>
              </div>
            </>
          )}

          {activeTab === 'hadiah_po' && (
            <>
              <div className="space-y-2.5">
                <h3 className="font-bold text-slate-900 dark:text-white">Aturan Pre-order</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Tenggat Otomatis Masuk Pre-order (Hari)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={draft.preorderThresholdDays}
                      onChange={(e) =>
                        setDraft({ ...draft, preorderThresholdDays: Math.max(1, Number(e.target.value) || 5) })
                      }
                      className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.autoProcessPreorder}
                      onChange={(e) => setDraft({ ...draft, autoProcessPreorder: e.target.checked })}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      Tandai siap diproses otomatis saat stok rak mencukupi
                    </span>
                  </label>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPoSku}
                    onChange={(e) => setNewPoSku(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPoSku())}
                    placeholder="Tambah SKU Pre-order (contoh: JK26ABC01)"
                    className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddPoSku}
                    className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah
                  </button>
                </div>
                {draft.preorderSkus.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.preorderSkus.map((sku) => (
                      <span
                        key={sku}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-mono text-[11px]"
                      >
                        {sku}
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              preorderSkus: draft.preorderSkus.filter((s) => s !== sku),
                            })
                          }
                          className="hover:text-rose-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">
                    Item Hadiah & Kemasan Non-SKU
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Item kemasan tidak ikut picking list; hadiah tanpa SKU dicentang manual saat ceklis & packing.
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    value={newSpecialCode}
                    onChange={(e) => setNewSpecialCode(e.target.value)}
                    placeholder="Kode SKU di Shopee"
                    className="col-span-2 sm:col-span-2 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newSpecialLabel}
                    onChange={(e) => setNewSpecialLabel(e.target.value)}
                    placeholder="Nama Tampil"
                    className="col-span-2 sm:col-span-1 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <select
                    value={newSpecialType}
                    onChange={(e) => setNewSpecialType(e.target.value as 'gift' | 'packaging')}
                    className="py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="gift">Hadiah</option>
                    <option value="packaging">Kemasan</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSpecialItem}
                    className="py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah
                  </button>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {draft.specialItems.map((item) => (
                    <div
                      key={item.code}
                      className="px-3 py-2 flex items-center justify-between gap-2 bg-white dark:bg-slate-900"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">{item.code}</span>
                        <span className="text-slate-500 dark:text-slate-400"> · {item.label}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          {item.itemType === 'gift' ? 'Hadiah' : 'Kemasan'}
                        </span>
                        <select
                          value={item.checkMode}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              specialItems: draft.specialItems.map((s) =>
                                s.code === item.code
                                  ? { ...s, checkMode: e.target.value as 'scan' | 'manual_check' }
                                  : s
                              ),
                            })
                          }
                          className="py-1 px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
                        >
                          <option value="manual_check">Centang Manual</option>
                          <option value="scan">Wajib Scan</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              specialItems: draft.specialItems.filter((s) => s.code !== item.code),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-rose-600"
                          aria-label="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'store_alert' && (
            <>
              <div className="space-y-2.5">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Prioritas Info Stok Store (Saat Stok Gudang Kurang)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Maksimal Store Ditampilkan
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={draft.maxStoresShown}
                      onChange={(e) =>
                        setDraft({ ...draft, maxStoresShown: Math.max(1, Number(e.target.value) || 3) })
                      }
                      className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Stok Minimum Store (pcs)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={draft.minStoreStock}
                      onChange={(e) =>
                        setDraft({ ...draft, minStoreStock: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStoreCode}
                    onChange={(e) => setNewStoreCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddStore())}
                    placeholder="Kode Store (mis. BTS, PIK, KLP)"
                    className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddStore}
                    className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    + Store
                  </button>
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {draft.storePriority.map((st, idx) => (
                    <div key={st} className="px-3 py-2 flex items-center justify-between bg-white dark:bg-slate-900">
                      <span className="font-mono font-bold">
                        {idx + 1}. {st}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveStore(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStore(idx, 1)}
                          disabled={idx === draft.storePriority.length - 1}
                          className="p-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              storePriority: draft.storePriority.filter((x) => x !== st),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  Batas Jeda Impor Terakhir (Menit) & Penerima WA Alert TAHAN
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'instantWarnMin' as const, label: 'Instan Kuning' },
                    { key: 'instantBlockMin' as const, label: 'Instan Merah' },
                    { key: 'regulerWarnMin' as const, label: 'Reguler Kuning' },
                    { key: 'regulerBlockMin' as const, label: 'Reguler Merah' },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">{f.label}</label>
                      <input
                        type="number"
                        min={5}
                        value={draft.importStaleness[f.key]}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            importStaleness: {
                              ...draft.importStaleness,
                              [f.key]: Math.max(5, Number(e.target.value) || 30),
                            },
                          })
                        }
                        className="w-full py-1.5 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newWaPhone}
                    onChange={(e) => setNewWaPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddWaPhone())}
                    placeholder="Nomor WA Alert (mis. 62812...)"
                    className="flex-1 py-1.5 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleAddWaPhone}
                    className="py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    + Nomor
                  </button>
                </div>
                {draft.waAlertPhones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.waAlertPhones.map((ph) => (
                      <span
                        key={ph}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-mono text-[11px]"
                      >
                        {ph}
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              waAlertPhones: draft.waAlertPhones.filter((p) => p !== ph),
                            })
                          }
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Database className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        Status Penyimpanan Cloud:{' '}
                        {storageMode === 'table' ? 'Tabel Khusus (online_orders)' : 'Mode Kompatibel Cloud'}
                      </div>
                      {storageMode !== 'table' && isAdmin && (
                        <div className="mt-0.5">
                          Data sudah tersinkron antar-perangkat. Untuk performa query terpisah di SQL Editor Supabase, jalankan skrip{' '}
                          <span className="font-mono font-semibold">tools/sql/fulfilment_online_jalur_c.sql</span>.
                        </div>
                      )}
                    </div>
                  </div>
                  {storageMode !== 'table' && isAdmin && (
                    <button
                      type="button"
                      onClick={handleCopySqlPath}
                      className="py-1 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold flex items-center gap-1 shrink-0"
                    >
                      {copiedSqlHint ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      Salin Path
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-3.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="py-2 px-4 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Simpan Pengaturan
          </button>
        </div>
      </div>
    </div>
  );
};
