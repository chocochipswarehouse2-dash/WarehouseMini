import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  Bot,
  User as UserIcon,
  RotateCcw,
  Copy,
  Check,
  Search,
  Settings2,
  FileSpreadsheet,
  AlertCircle,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Boxes,
  MapPin,
  FileText,
  ShoppingCart
} from 'lucide-react';
import { UserSession } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import {
  AiChatMessage,
  sendChatMessageToGemini,
  fetchAiConfig,
  saveAiConfig,
  WmsAiConfig,
  getActiveGeminiApiKey,
  setActiveGeminiApiKey
} from '../../services/wmsAiService';

interface WmsAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onNotify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onNavigateToInventoryCart?: () => void;
}

const SUGGESTED_PROMPTS = [
  {
    icon: ShoppingCart,
    label: 'Order ke Keranjang',
    prompt: 'Tolong masukkan ke keranjang order: Sailor Top Blue S 2 pcs dan Taylor Pants M 1 pcs',
    desc: 'AI cek stok & masukkan otomatis ke keranjang order'
  },
  {
    icon: Boxes,
    label: 'Cek Stok Produk',
    prompt: 'Stok sailor top sekarang berapa ya?',
    desc: 'Cek total fisik, DealPOS, dan posisi rak'
  },
  {
    icon: Search,
    label: 'Cari Nama Kode Produksi',
    prompt: 'Kode 6612 itu nama produknya apa ya?',
    desc: 'Lookup dari Trello UP dan riwayat penerimaan'
  },
  {
    icon: FileSpreadsheet,
    label: 'Rekap Penerimaan Bulan',
    prompt: 'Buat rekap penerimaan produk selama bulan Oktober',
    desc: 'Total pcs, surat jalan, dan per kategori CMT/Kargo'
  }
];

export const WmsAiModal: React.FC<WmsAiModalProps> = ({
  isOpen,
  onClose,
  session,
  onNotify,
  onNavigateToInventoryCart
}) => {
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('wms_ai_chat_history');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [cartCount, setCartCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('wms_inventory_picking_cart');
      return raw ? JSON.parse(raw).length : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const updateCount = () => {
      try {
        const raw = localStorage.getItem('wms_inventory_picking_cart');
        setCartCount(raw ? JSON.parse(raw).length : 0);
      } catch {
        setCartCount(0);
      }
    };
    updateCount();
    window.addEventListener('wms_inventory_cart_updated', updateCount);
    window.addEventListener('storage', updateCount);
    return () => {
      window.removeEventListener('wms_inventory_cart_updated', updateCount);
      window.removeEventListener('storage', updateCount);
    };
  }, [isOpen]);

  const handleOpenCart = () => {
    if (typeof window !== 'undefined') {
      (window as any).__wms_open_inventory_cart = true;
    }
    onNavigateToInventoryCart?.();
    onClose();
  };

  // Superadmin Access & Settings Popover
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [aiConfig, setAiConfig] = useState<WmsAiConfig>({
    allowedUsers: ['admin', 'warehouse', 'chocoadm'],
    enabled: true,
    model: 'gemini-3.5-flash'
  });
  const [newUserWhitelisted, setNewUserWhitelisted] = useState<string>('');
  const [customKeyInput, setCustomKeyInput] = useState<string>('');
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userIsSuperadmin = isSuperadmin(session);

  // Simpan riwayat chat ke localStorage
  useEffect(() => {
    try {
      localStorage.setItem('wms_ai_chat_history', JSON.stringify(messages.slice(-20)));
    } catch {}
  }, [messages]);

  // Scroll otomatis ke pesan terbaru
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Muat konfigurasi AI saat modal atau settings dibuka
  useEffect(() => {
    if (isOpen) {
      fetchAiConfig().then((cfg) => {
        setAiConfig(cfg);
        setCustomKeyInput(cfg.apiKey || getActiveGeminiApiKey() || '');
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt || isLoading) return;

    setInputPrompt('');
    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: Date.now()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);
    setActiveToolName(null);

    try {
      const result = await sendChatMessageToGemini(
        newHistory,
        prompt,
        (toolName) => {
          let toolLabel = 'Mengecek data WMS...';
          if (toolName === 'lookup_product_stock') toolLabel = 'Mengecek katalog & stok rak gudang...';
          else if (toolName === 'lookup_production_code') toolLabel = 'Mencari kode produksi di Trello UP...';
          else if (toolName === 'generate_production_recap') toolLabel = 'Menghitung rekapitulasi penerimaan barang...';
          else if (toolName === 'search_manual_shipment') toolLabel = 'Mencari data resi pengiriman...';
          setActiveToolName(toolLabel);
        }
      );

      const botMsg: AiChatMessage = {
        id: `model_${Date.now()}`,
        role: 'model',
        text: result.text,
        timestamp: Date.now(),
        toolCallsExecuted: result.executedTools
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err: any) {
      console.error('[WMS AI Error]:', err);
      const errorMsg: AiChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: `⚠️ **Terjadi kendala saat memproses permintaan:**\n${err?.message || 'Gagal menghubungi server Gemini.'}\n\nSilakan coba lagi atau cek konfigurasi API Key.`,
        timestamp: Date.now()
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setActiveToolName(null);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Bersihkan seluruh percakapan AI saat ini?')) {
      setMessages([]);
      localStorage.removeItem('wms_ai_chat_history');
      onNotify?.('Percakapan telah dibersihkan', 'info');
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    onNotify?.('Teks berhasil disalin ke clipboard', 'success');
  };

  const handleAddWhitelistedUser = async () => {
    const u = newUserWhitelisted.trim().toLowerCase();
    if (!u) return;
    if (aiConfig.allowedUsers.includes(u)) {
      onNotify?.('User sudah ada dalam whitelist', 'info');
      return;
    }

    const updatedUsers = [...aiConfig.allowedUsers, u];
    setAiConfig((prev) => ({ ...prev, allowedUsers: updatedUsers }));
    setNewUserWhitelisted('');

    setIsSavingConfig(true);
    await saveAiConfig({ allowedUsers: updatedUsers });
    setIsSavingConfig(false);
    onNotify?.(`User "${u}" berhasil diberi izin akses AI`, 'success');
  };

  const handleRemoveWhitelistedUser = async (u: string) => {
    const updatedUsers = aiConfig.allowedUsers.filter((item) => item !== u);
    setAiConfig((prev) => ({ ...prev, allowedUsers: updatedUsers }));

    setIsSavingConfig(true);
    await saveAiConfig({ allowedUsers: updatedUsers });
    setIsSavingConfig(false);
    onNotify?.(`Akses AI untuk "${u}" telah dicabut`, 'info');
  };

  const handleSaveApiKey = async () => {
    setIsSavingConfig(true);
    const key = customKeyInput.trim();
    setActiveGeminiApiKey(key);
    await saveAiConfig({ apiKey: key });
    setIsSavingConfig(false);
    onNotify?.('API Key Gemini berhasil diperbarui', 'success');
  };

  // Render teks markdown sederhana (bold, list, code, headings, table)
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = (key: number) => {
      if (tableBuffer.length === 0) return null;
      const tLines = [...tableBuffer];
      tableBuffer = [];

      // Parse markdown table
      const headerLine = tLines[0] || '';
      const dataLines = tLines.slice(2); // Skip separator line |---|---|

      const parseCols = (l: string) =>
        l.split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);

      const headers = parseCols(headerLine);
      const rows = dataLines.map((r) => parseCols(r));

      return (
        <div key={`table_${key}`} className="my-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  {row.map((col, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">
                      {col}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };

    lines.forEach((line, index) => {
      // Table line detection
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        tableBuffer.push(line);
        return;
      } else if (tableBuffer.length > 0) {
        elements.push(flushTable(index));
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(
          <h4 key={index} className="text-xs sm:text-sm font-black text-slate-900 dark:text-white mt-3 mb-1 uppercase tracking-tight flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
            {line.replace('### ', '')}
          </h4>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h3 key={index} className="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-3.5 mb-1.5">
            {line.replace('## ', '')}
          </h3>
        );
      } else if (line.startsWith('---')) {
        elements.push(<hr key={index} className="my-2.5 border-slate-200 dark:border-slate-800" />);
      } else if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const itemText = line.trim().replace(/^[\*\-]\s+/, '');
        elements.push(
          <div key={index} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 my-1 leading-relaxed">
            <span className="text-primary-500 font-bold shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(itemText) }} />
          </div>
        );
      } else if (/^\d+\.\s+/.test(line.trim())) {
        elements.push(
          <div key={index} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 my-1 leading-relaxed font-semibold">
            <span dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line.trim()) }} />
          </div>
        );
      } else if (line.trim()) {
        elements.push(
          <p
            key={index}
            className="text-xs text-slate-700 dark:text-slate-300 my-1.5 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }}
          />
        );
      }
    });

    if (tableBuffer.length > 0) {
      elements.push(flushTable(lines.length));
    }

    return elements;
  };

  const formatInlineMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-extrabold text-slate-900 dark:text-white">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-primary-600 dark:text-primary-400 font-mono text-[11px] font-bold border border-slate-200/80 dark:border-slate-700/80">$1</code>');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-4xl h-[92vh] max-h-[850px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        
        {/* ========================================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-primary-500/25 shrink-0">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  Asisten AI Pintar WMS
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-primary-500/15 to-purple-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                  Gemini 3.5 Flash
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Tanya stok real, posisi rak, lookup kode produksi, dan laporan rekapitulasi otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Open Cart Button */}
            {onNavigateToInventoryCart && (
              <button
                type="button"
                onClick={handleOpenCart}
                title="Buka Keranjang Order di Inventory"
                className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 hover:bg-amber-100"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Keranjang ({cartCount})</span>
              </button>
            )}

            {/* Superadmin Settings Button */}
            {userIsSuperadmin && (
              <button
                type="button"
                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                title="Kelola Whitelist User & API Key (Khusus Superadmin)"
                className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSettingsOpen
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Settings2 className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px]">Akses & Kuota</span>
              </button>
            )}

            {/* Clear Chat Button */}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                title="Bersihkan riwayat percakapan"
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SUPERADMIN SETTINGS DRAWER / OVERLAY */}
        {/* ========================================================================= */}
        {isSettingsOpen && userIsSuperadmin && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-800/90 p-4 shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Pengaturan Akses AI & Penghemat Kuota (Superadmin)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold cursor-pointer"
              >
                Tutup Panel
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Whitelist Users */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
                  User yang Diizinkan Mengakses AI ({aiConfig.allowedUsers.length})
                </label>
                <p className="text-[10px] text-slate-400 mb-2">
                  Hanya user di bawah ini (dan superadmin) yang akan melihat menu Asisten AI di sidebar.
                </p>

                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={newUserWhitelisted}
                    onChange={(e) => setNewUserWhitelisted(e.target.value)}
                    placeholder="Ketik username / NIK..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddWhitelistedUser}
                    disabled={isSavingConfig || !newUserWhitelisted.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + Tambah
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                  {aiConfig.allowedUsers.map((u) => (
                    <span
                      key={u}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                    >
                      <span>{u}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWhitelistedUser(u)}
                        title="Hapus akses"
                        className="text-slate-400 hover:text-rose-500 cursor-pointer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Gemini API Key */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-extrabold text-slate-700 dark:text-slate-300 uppercase">
                      Google Gemini API Key
                    </label>
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      ☁️ Sinkron Semua Perangkat
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                    Cukup disimpan <strong>1 kali oleh Superadmin</strong>. API Key tersimpan aman di database cloud Supabase dan otomatis aktif di semua perangkat (HP, Laptop, PC) untuk seluruh user yang diizinkan tanpa perlu input berulang.
                  </p>
                  <input
                    type="password"
                    value={customKeyInput}
                    onChange={(e) => setCustomKeyInput(e.target.value)}
                    placeholder="Masukkan Gemini API Key..."
                    className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    disabled={isSavingConfig}
                    className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Simpan Terpusat
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CHAT MESSAGES BODY */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/40">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-500/20 via-indigo-500/20 to-purple-500/20 border border-primary-500/30 flex items-center justify-center mb-4 shadow-inner">
                <Bot className="w-8 h-8 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1.5">
                Ada yang bisa dibantu untuk gudang hari ini?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Tanyakan informasi stok barang, letak rak, pencarian nama dari kode produksi, atau buat laporan rekapitulasi kedatangan.
              </p>

              {/* Suggestions Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {SUGGESTED_PROMPTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(item.prompt)}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-md transition-all group cursor-pointer text-left flex items-start gap-3"
                    >
                      <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400 group-hover:bg-primary-600 group-hover:text-white transition-colors shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                          {item.label}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                          "{item.prompt}"
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold shadow-xs ${
                      isUser
                        ? 'bg-primary-600 text-white'
                        : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white'
                    }`}
                  >
                    {isUser ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`max-w-[85%] sm:max-w-[78%] rounded-2xl p-3.5 sm:p-4 text-xs shadow-xs relative group ${
                      isUser
                        ? 'bg-primary-600 text-white rounded-tr-xs font-medium'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-xs'
                    }`}
                  >
                    {/* Tool Badges Executed */}
                    {!isUser && msg.toolCallsExecuted && msg.toolCallsExecuted.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5 pb-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-400">
                        <Database className="w-3 h-3 text-emerald-500" />
                        <span>Data Terverifikasi dari Database WMS:</span>
                        {msg.toolCallsExecuted.map((t, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-mono text-[9px]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed">
                      {isUser ? <p className="whitespace-pre-wrap">{msg.text}</p> : renderFormattedContent(msg.text)}
                    </div>

                    {/* Direct CTA: Buka Keranjang Order jika tool add_to_inventory_cart dieksekusi */}
                    {!isUser && msg.toolCallsExecuted?.includes('add_to_inventory_cart') && onNavigateToInventoryCart && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800/80">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Produk telah masuk ke Keranjang Order</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenCart}
                          className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Buka Keranjang ({cartCount})</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Copy Button */}
                    {!isUser && (
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.id, msg.text)}
                        title="Salin jawaban ini"
                        className="absolute right-2 top-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 animate-pulse">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl rounded-tl-xs p-3.5 shadow-xs flex items-center gap-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {activeToolName || 'Gemini sedang menganalisis data WMS...'}
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ========================================================================= */}
        {/* INPUT BAR */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                placeholder="Tanya stok produk, kode produksi, atau minta rekap laporan... (Enter untuk kirim)"
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white placeholder-slate-400 resize-none max-h-32 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !inputPrompt.trim()}
              className="p-2.5 sm:px-4 sm:py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Kirim</span>
            </button>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 px-1">
            <span>Shift + Enter untuk baris baru</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Grounded Realtime Database
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
