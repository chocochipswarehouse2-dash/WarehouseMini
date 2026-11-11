import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ShoppingCart,
  Minus,
  Maximize2,
  MessageSquarePlus,
  History,
  Trash2,
  Clock,
  Plus,
  Paperclip,
  Camera,
  Image as ImageIcon,
  Loader2,
  Download
} from 'lucide-react';
import { UserSession } from '../../types';
import { isSuperadmin, isWarehouseAccountOnly } from '../../services/permissions';
import { parseAiAttachmentFile, AiAttachment } from '../../utils/aiAttachmentParser';
import {
  exportAiTableToExcel,
  exportAiTableToPdf,
  cleanMarkdownCellText
} from '../../utils/aiReportExporter';
import { TrelloImage } from '../Trello/TrelloImage';
import {
  AiChatMessage,
  TrelloCandidatePreview,
  sendChatMessageToGemini,
  fetchAiConfig,
  saveAiConfig,
  WmsAiConfig,
  getActiveGeminiApiKey,
  setActiveGeminiApiKey
} from '../../services/wmsAiService';

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatMessage[];
}

interface WmsAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onNotify?: (message: string, type: 'success' | 'error' | 'info') => void;
  onNavigateToInventoryCart?: () => void;
  onNavigateToProduksiInput?: () => void;
}

const SUGGESTED_PROMPTS = [
  {
    icon: FileSpreadsheet,
    label: 'Cek Kedatangan Kargo / CMT',
    prompt: 'Kemarin ada masuk kargo apa aja dan berapa aja?',
    desc: 'Baca rincian penerimaan barang CMT & Kargo per tanggal'
  },
  {
    icon: FileText,
    label: 'Bantu Input Form Produksi',
    prompt: 'Tolong bantu input penerimaan kargo hari ini ke form input',
    desc: 'AI tanya jawab & isikan ke draft form, Anda tinggal cek & submit'
  },
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
  }
];

export const WmsAiModal: React.FC<WmsAiModalProps> = ({
  isOpen,
  onClose,
  session,
  onNotify,
  onNavigateToInventoryCart,
  onNavigateToProduksiInput
}) => {
  const sessionUser = session?.username || 'default_user';
  const sessionsStorageKey = `wms_ai_sessions_${sessionUser}`;
  const activeSessionStorageKey = `wms_ai_active_session_id_${sessionUser}`;

  // Mini-dock / Minimize & History Drawer States
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');

  // 1. Daftar Sessions
  const [sessions, setSessions] = useState<AiChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(sessionsStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // 2. Active Session ID
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    try {
      const savedActive = localStorage.getItem(activeSessionStorageKey);
      if (savedActive) return savedActive;
    } catch {}
    return `session_${Date.now()}`;
  });

  // 3. Pesan Aktif di Sesi Saat Ini
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const savedSessions = localStorage.getItem(sessionsStorageKey);
      const savedActive = localStorage.getItem(activeSessionStorageKey);
      if (savedSessions && savedActive) {
        const parsed: AiChatSession[] = JSON.parse(savedSessions);
        const cur = parsed.find((s) => s.id === savedActive);
        if (cur && Array.isArray(cur.messages)) return cur.messages;
      }
      const savedLegacy = localStorage.getItem('wms_ai_chat_history');
      if (savedLegacy) return JSON.parse(savedLegacy);
    } catch {}
    return [];
  });

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [zoomedTrelloCandidate, setZoomedTrelloCandidate] = useState<TrelloCandidatePreview | null>(null);

  // Lampiran Multimodal (Foto Dokumen, Excel, CSV)
  const [pendingAttachments, setPendingAttachments] = useState<AiAttachment[]>([]);
  const [isParsingAttachment, setIsParsingAttachment] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsParsingAttachment(true);
    try {
      const parsedList: AiAttachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const parsed = await parseAiAttachmentFile(file);
          parsedList.push(parsed);
        } catch (fileErr: any) {
          console.error('[WMS AI] Gagal parse file:', fileErr);
          onNotify?.(`Gagal memproses ${file.name}: ${fileErr?.message || 'File tidak valid'}`, 'error');
        }
      }

      if (parsedList.length > 0) {
        setPendingAttachments((prev) => [...prev, ...parsedList]);
        onNotify?.(`Berhasil melampirkan ${parsedList.length} file.`, 'success');
      }
    } finally {
      setIsParsingAttachment(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  };

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

  const [prodDraftCount, setProdDraftCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('wms_penerimaan_produksi_form_draft');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.productBlocks)
        ? parsed.productBlocks.filter((b: any) => b && b.kode_produksi && String(b.kode_produksi).trim()).length
        : 0;
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    const updateProdDraft = () => {
      try {
        const raw = localStorage.getItem('wms_penerimaan_produksi_form_draft');
        if (!raw) {
          setProdDraftCount(0);
          return;
        }
        const parsed = JSON.parse(raw);
        setProdDraftCount(
          Array.isArray(parsed.productBlocks)
            ? parsed.productBlocks.filter((b: any) => b && b.kode_produksi && String(b.kode_produksi).trim()).length
            : 0
        );
      } catch {
        setProdDraftCount(0);
      }
    };
    updateProdDraft();
    window.addEventListener('wms_production_draft_updated', updateProdDraft);
    window.addEventListener('storage', updateProdDraft);
    return () => {
      window.removeEventListener('wms_production_draft_updated', updateProdDraft);
      window.removeEventListener('storage', updateProdDraft);
    };
  }, [isOpen]);

  const handleOpenCart = () => {
    if (typeof window !== 'undefined') {
      (window as any).__wms_open_inventory_cart = true;
    }
    onNavigateToInventoryCart?.();
    onClose();
  };

  const handleOpenProduksiForm = (minimizeInsteadOfClose = true) => {
    if (typeof window !== 'undefined') {
      (window as any).__wms_pending_produksi_target = { tab: 'input', reloadDraft: true };
      window.dispatchEvent(
        new CustomEvent('wms_open_produksi_tab', {
          detail: { tab: 'input', reloadDraft: true }
        })
      );
    }
    onNavigateToProduksiInput?.();
    if (minimizeInsteadOfClose) {
      setIsMinimized(true);
    } else {
      onClose();
    }
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
  const isOwnerWarehouse = isWarehouseAccountOnly(session);

  // Auto-sync session ke sessions list dan localStorage
  useEffect(() => {
    if (!currentSessionId) return;
    try {
      localStorage.setItem(activeSessionStorageKey, currentSessionId);
      localStorage.setItem('wms_ai_chat_history', JSON.stringify(messages.slice(-20)));

      setSessions((prevSessions) => {
        const existingIdx = prevSessions.findIndex((s) => s.id === currentSessionId);
        let sessionTitle = 'Percakapan Baru';
        const firstUserMsg = messages.find((m) => m.role === 'user');
        if (firstUserMsg && firstUserMsg.text) {
          const cleanText = firstUserMsg.text.replace(/\n+/g, ' ').trim();
          sessionTitle = cleanText.length > 36 ? cleanText.slice(0, 36) + '...' : cleanText;
        }

        let updatedSessions: AiChatSession[];
        if (existingIdx >= 0) {
          const current = prevSessions[existingIdx];
          const updated: AiChatSession = {
            ...current,
            title: current.title && current.title !== 'Percakapan Baru' ? current.title : sessionTitle,
            updatedAt: Date.now(),
            messages: messages
          };
          updatedSessions = [
            updated,
            ...prevSessions.filter((_, idx) => idx !== existingIdx)
          ];
        } else if (messages.length > 0) {
          const newSession: AiChatSession = {
            id: currentSessionId,
            title: sessionTitle,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: messages
          };
          updatedSessions = [newSession, ...prevSessions];
        } else {
          updatedSessions = prevSessions;
        }

        try {
          localStorage.setItem(sessionsStorageKey, JSON.stringify(updatedSessions.slice(0, 40)));
        } catch {}
        return updatedSessions;
      });
    } catch (e) {
      console.warn('[WMS AI] Gagal menyimpan session:', e);
    }
  }, [messages, currentSessionId, sessionsStorageKey, activeSessionStorageKey]);

  // Reset minimize state saat modal ditutup total
  useEffect(() => {
    if (!isOpen) {
      setIsMinimized(false);
      setIsHistoryOpen(false);
      setIsSettingsOpen(false);
    }
  }, [isOpen]);

  // Scroll otomatis ke pesan terbaru jika tidak diminimize
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, isLoading]);

  // Muat konfigurasi AI saat modal atau settings dibuka
  useEffect(() => {
    if (isOpen) {
      fetchAiConfig().then((cfg) => {
        setAiConfig(cfg);
        setCustomKeyInput(cfg.apiKey || getActiveGeminiApiKey() || '');
      });
    }
  }, [isOpen]);

  // Handler: Mulai Percakapan Baru (+ New Chat)
  const handleNewChat = () => {
    const newId = `session_${Date.now()}`;
    setCurrentSessionId(newId);
    setMessages([]);
    setInputPrompt('');
    setIsHistoryOpen(false);
    onNotify?.('Sesi percakapan baru dimulai', 'info');
  };

  // Handler: Pilih Sesi dari Riwayat
  const handleSelectSession = (sessionId: string) => {
    const target = sessions.find((s) => s.id === sessionId);
    if (target) {
      setCurrentSessionId(target.id);
      setMessages(target.messages || []);
      setIsHistoryOpen(false);
    }
  };

  // Handler: Hapus 1 Sesi dari Riwayat
  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter((s) => s.id !== sessionId);
    setSessions(updated);
    try {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(updated));
    } catch {}
    if (currentSessionId === sessionId) {
      if (updated.length > 0) {
        setCurrentSessionId(updated[0].id);
        setMessages(updated[0].messages || []);
      } else {
        handleNewChat();
      }
    }
    onNotify?.('Sesi riwayat berhasil dihapus', 'info');
  };

  // Handler: Hapus Seluruh Riwayat Chat
  const handleClearAllHistory = () => {
    if (window.confirm('Hapus seluruh riwayat percakapan AI Anda? Tindakan ini tidak dapat dibatalkan.')) {
      setSessions([]);
      setMessages([]);
      try {
        localStorage.removeItem(sessionsStorageKey);
        localStorage.removeItem('wms_ai_chat_history');
      } catch {}
      handleNewChat();
      onNotify?.('Seluruh riwayat percakapan telah dibersihkan', 'info');
    }
  };

  // Filter riwayat berdasarkan kata kunci
  const filteredSessions = useMemo(() => {
    if (!historySearchQuery.trim()) return sessions;
    const q = historySearchQuery.toLowerCase();
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q));
  }, [sessions, historySearchQuery]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || inputPrompt).trim();
    if ((!prompt && pendingAttachments.length === 0) || isLoading) return;

    const currentAtts = [...pendingAttachments];
    setInputPrompt('');
    setPendingAttachments([]);

    const userMsg: AiChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      text: prompt || (currentAtts.length > 0 ? (currentAtts[0].type === 'image' ? 'Analisis foto dokumen terlampir' : `Periksa file lampiran ${currentAtts[0].name}`) : 'Halo'),
      attachments: currentAtts.length > 0 ? currentAtts : undefined,
      timestamp: Date.now()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);
    setActiveToolName(null);

    try {
      const result = await sendChatMessageToGemini(
        newHistory,
        userMsg.text,
        (toolName) => {
          let toolLabel = 'Mengecek data WMS...';
          if (toolName === 'lookup_product_stock') toolLabel = 'Mengecek katalog & stok rak gudang...';
          else if (toolName === 'lookup_production_code') toolLabel = 'Mencari kode produksi di Trello UP...';
          else if (toolName === 'query_production_receipts') toolLabel = 'Membaca data penerimaan CMT & Kargo...';
          else if (toolName === 'generate_production_recap') toolLabel = 'Menghitung rekapitulasi penerimaan barang...';
          else if (toolName === 'prepare_production_receipt_form') toolLabel = 'Menyiapkan Draft Form Input Penerimaan...';
          else if (toolName === 'view_production_receipt_form_draft') toolLabel = 'Membaca Draft Form Input Penerimaan...';
          else if (toolName === 'search_manual_shipment') toolLabel = 'Mencari data resi pengiriman...';
          else if (toolName === 'add_to_inventory_cart') toolLabel = 'Memasukkan barang ke Keranjang Order...';
          else if (toolName === 'view_inventory_cart') toolLabel = 'Melihat isi Keranjang Order...';
          else if (toolName === 'generate_exportable_report') toolLabel = 'Menyusun dokumen laporan PDF & Excel...';
          setActiveToolName(toolLabel);
        },
        currentAtts
      );

      const botMsg: AiChatMessage = {
        id: `model_${Date.now()}`,
        role: 'model',
        text: result.text,
        timestamp: Date.now(),
        toolCallsExecuted: result.executedTools,
        trelloCandidates: result.trelloCandidates,
        reportTable: result.reportTable
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
    if (!isOwnerWarehouse) {
      onNotify?.('Akses ditolak: Hanya akun @warehouse yang dapat mengelola whitelist', 'error');
      return;
    }
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
    if (!isOwnerWarehouse) {
      onNotify?.('Akses ditolak: Hanya akun @warehouse yang dapat mengelola whitelist', 'error');
      return;
    }
    const updatedUsers = aiConfig.allowedUsers.filter((item) => item !== u);
    setAiConfig((prev) => ({ ...prev, allowedUsers: updatedUsers }));

    setIsSavingConfig(true);
    await saveAiConfig({ allowedUsers: updatedUsers });
    setIsSavingConfig(false);
    onNotify?.(`Akses AI untuk "${u}" telah dicabut`, 'info');
  };

  const handleSaveApiKey = async () => {
    if (!isOwnerWarehouse) {
      onNotify?.('Akses ditolak: Hanya akun @warehouse yang dapat mengelola token API Key', 'error');
      return;
    }
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
      const exportPayload = {
        title: 'Laporan Tabel Data WMS AI',
        headers: headers.map((h) => cleanMarkdownCellText(h)),
        rows: rows.map((r) => r.map((c) => cleanMarkdownCellText(c)))
      };

      return (
        <div key={`table_${key}`} className="my-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs bg-white dark:bg-slate-900">
          {/* Action Bar: Instant Download Excel & PDF */}
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tabel Data ({rows.length} Baris)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  exportAiTableToExcel(exportPayload);
                  onNotify?.('File Excel (.xlsx) berhasil diunduh!', 'success');
                }}
                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-extrabold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                title="Download tabel ini dalam format Microsoft Excel (.xlsx)"
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  exportAiTableToPdf(exportPayload);
                  onNotify?.('Dokumen PDF (.pdf) berhasil diunduh!', 'success');
                }}
                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[10px] font-extrabold flex items-center gap-1 transition-colors cursor-pointer"
                title="Download tabel ini dalam format Dokumen PDF (.pdf)"
              >
                <FileText className="w-3 h-3 text-rose-500" />
                <span>PDF (.pdf)</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 whitespace-nowrap">
                      {cleanMarkdownCellText(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    {row.map((col, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">
                        {cleanMarkdownCellText(col)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

  // JIKA SEDANG DIMINIMIZE: Tampilkan Widget Mengambang (Floating Companion Pill) di Pojok Bawah
  // Pengguna bisa bebas bekerja di modul WMS lain sambil menunggu jawaban AI!
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 p-2 sm:p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 hover:shadow-primary-500/10 transition-all select-none">
        <div
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0 ${
              isLoading
                ? 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-primary-600 animate-pulse'
                : 'bg-gradient-to-tr from-primary-600 to-indigo-600'
            }`}
          >
            <Bot className="w-5 h-5" />
          </div>
          <div className="flex flex-col pr-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                Asisten AI WMS
              </span>
              {isLoading ? (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 animate-pulse shrink-0">
                  ⏳ Menjawab...
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shrink-0">
                  Ready
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[170px] sm:max-w-[240px] truncate">
              {isLoading
                ? (activeToolName || 'Sedang menganalisis data gudang...')
                : (messages.length > 0
                    ? (messages[messages.length - 1].role === 'model'
                        ? '✅ Jawaban AI selesai (Klik untuk buka)'
                        : 'Klik untuk melanjutkan chat')
                    : 'Tanya stok, kode, dll.')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            title="Buka Layar Chat Penuh"
            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMinimized(false);
              onClose();
            }}
            title="Tutup Chat"
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="flex flex-col w-full max-w-5xl h-[92vh] max-h-[850px] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative">
        
        {/* ========================================================================= */}
        {/* MODAL HEADER */}
        {/* ========================================================================= */}
        <div className="px-3 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-primary-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-md shadow-primary-500/25 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-tight truncate">
                  Asisten AI Pintar WMS
                </h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gradient-to-r from-primary-500/15 to-purple-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/20">
                  Gemini 3.5 Flash
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate hidden xs:block">
                Tanya stok real, posisi rak, lookup kode produksi, dan laporan rekapitulasi otomatis
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Quick Open Form Input Produksi Button */}
            {onNavigateToProduksiInput && prodDraftCount > 0 && (
              <button
                type="button"
                onClick={() => handleOpenProduksiForm(true)}
                title="Buka Draft Form Input Penerimaan Produksi"
                className="px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-300/80 dark:border-indigo-700/80 hover:bg-indigo-100"
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Form Produksi</span> ({prodDraftCount})
              </button>
            )}

            {/* Quick Open Cart Button */}
            {onNavigateToInventoryCart && (
              <button
                type="button"
                onClick={handleOpenCart}
                title="Buka Keranjang Order di Inventory"
                className="px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700/80 hover:bg-amber-100"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Keranjang</span> ({cartCount})
              </button>
            )}

            {/* + New Chat Button */}
            <button
              type="button"
              onClick={handleNewChat}
              title="Mulai percakapan baru (+ New Chat)"
              className="px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-800 hover:bg-primary-100"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Chat Baru</span>
            </button>

            {/* Chat History Sessions Button */}
            <button
              type="button"
              onClick={() => {
                setIsHistoryOpen(!isHistoryOpen);
                setIsSettingsOpen(false);
              }}
              title="Lihat riwayat percakapan lampau"
              className={`px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isHistoryOpen
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-[11px]">Riwayat</span>
              {sessions.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${isHistoryOpen ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'}`}>
                  {sessions.length}
                </span>
              )}
            </button>

            {/* Owner Settings & Token Button (Khusus Akun @warehouse / Pemilik Sistem) */}
            {isOwnerWarehouse && (
              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(!isSettingsOpen);
                  setIsHistoryOpen(false);
                }}
                title="Kelola Whitelist User & API Key Token (Khusus Akun @warehouse / Owner)"
                className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSettingsOpen
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Settings2 className="w-4 h-4" />
                <span className="hidden lg:inline text-[11px]">Token & Akses</span>
              </button>
            )}

            {/* Minimize Button */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              title="Kecilkan chat (bisa sambil kerja nunggu jawaban AI)"
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              title="Tutup chat"
              className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* OWNER SETTINGS DRAWER / OVERLAY (KHUSUS AKUN WAREHOUSE) */}
        {/* ========================================================================= */}
        {isSettingsOpen && isOwnerWarehouse && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-800/90 p-4 shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Pengaturan Akses AI & API Key Token (Khusus Akun @warehouse)
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
        {/* MAIN BODY: HISTORY DRAWER + CHAT CONTAINER */}
        {/* ========================================================================= */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* HISTORY DRAWER (COLLAPSIBLE SIDEBAR) */}
          {isHistoryOpen && (
            <div className="w-64 sm:w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col z-20 animate-in slide-in-from-left duration-200">
              <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">
                    Riwayat ({sessions.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleNewChat}
                  title="Percakapan Baru"
                  className="px-2 py-1 text-[11px] font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Baru</span>
                </button>
              </div>

              {/* Search History */}
              {sessions.length > 2 && (
                <div className="p-2 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="Cari topik chat..."
                      className="w-full pl-8 pr-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Sessions List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filteredSessions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Belum ada riwayat percakapan tersimpan
                  </div>
                ) : (
                  filteredSessions.map((s) => {
                    const isActive = s.id === currentSessionId;
                    const dateStr = new Date(s.updatedAt || s.createdAt).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelectSession(s.id)}
                        className={`group p-2 sm:p-2.5 rounded-xl text-left cursor-pointer transition-all flex items-start justify-between gap-1.5 ${
                          isActive
                            ? 'bg-primary-50 dark:bg-primary-950/50 border border-primary-200 dark:border-primary-800/80 shadow-xs'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {s.title || 'Percakapan Tanpa Judul'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span className="truncate">{dateStr}</span>
                            <span>•</span>
                            <span className="shrink-0">{s.messages?.length || 0} pesan</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          title="Hapus sesi ini"
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Clear All History Button */}
              {sessions.length > 0 && (
                <div className="p-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleClearAllHistory}
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Semua Riwayat</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CHAT MESSAGES + INPUT AREA */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50/40 dark:bg-slate-950/40">
            {/* CHAT MESSAGES BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
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

                    {/* Render Attachments in User Message */}
                    {isUser && msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2 p-1.5 rounded-lg bg-black/20 border border-white/20 text-[11px]"
                          >
                            {att.type === 'image' && att.previewUrl ? (
                              <img
                                src={att.previewUrl}
                                alt={att.name}
                                className="w-16 h-16 object-cover rounded-md border border-white/30"
                              />
                            ) : (
                              <div className="flex items-center gap-1.5 px-1 font-bold">
                                <FileSpreadsheet className="w-4 h-4 text-emerald-300 shrink-0" />
                                <span className="truncate max-w-[140px]">{att.name}</span>
                                {att.rowCount !== undefined && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/20 font-mono">
                                    {att.rowCount} baris
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    <div className="prose dark:prose-invert max-w-none text-xs leading-relaxed">
                      {isUser ? <p className="whitespace-pre-wrap">{msg.text}</p> : renderFormattedContent(msg.text)}
                    </div>

                    {/* Lampiran Visual Kartu Foto Produk Trello UP (Exact maupun Konfirmasi Kode Mirip seperti 6612 -> 6612-1) */}
                    {!isUser && msg.trelloCandidates && msg.trelloCandidates.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-black text-slate-700 dark:text-slate-200">
                          <span className="flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            {msg.trelloCandidates.some((c) => c.needsConfirmation)
                              ? 'Konfirmasi Kode Produksi Mirip & Foto Trello UP:'
                              : 'Lampiran Foto Produk Trello UP:'}
                          </span>
                          <span className="text-[10px] font-normal text-slate-400">Klik foto untuk perbesar</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {msg.trelloCandidates.map((cand, cIdx) => (
                            <div
                              key={`${cand.matchedCode}_${cIdx}`}
                              className={`flex flex-col rounded-xl border p-2.5 transition-all ${
                                cand.needsConfirmation
                                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/80'
                                  : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="flex items-start gap-2.5">
                                {/* Thumbnail Foto Trello UP */}
                                <div
                                  onClick={() => (cand.photoUrl || cand.fallbackPhotoUrl) && setZoomedTrelloCandidate(cand)}
                                  className={`w-20 h-20 rounded-lg overflow-hidden border shrink-0 flex items-center justify-center relative group/img ${
                                    cand.photoUrl || cand.fallbackPhotoUrl
                                      ? 'cursor-pointer border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                                      : 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800'
                                  }`}
                                  title={cand.photoUrl || cand.fallbackPhotoUrl ? 'Klik untuk memperbesar foto' : 'Belum ada foto di Trello'}
                                >
                                  {cand.photoUrl || cand.fallbackPhotoUrl ? (
                                    <>
                                      <TrelloImage
                                        src={cand.photoUrl || cand.fallbackPhotoUrl}
                                        fallbackSrc={cand.fallbackPhotoUrl}
                                        alt={cand.productName}
                                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
                                        <Maximize2 className="w-4 h-4 text-white opacity-0 group-hover/img:opacity-100 transition-opacity drop-shadow" />
                                      </div>
                                    </>
                                  ) : (
                                    <div className="text-[9px] text-slate-400 text-center px-1 leading-tight">
                                      Tanpa Foto
                                    </div>
                                  )}
                                </div>

                                {/* Detail Kode, Nama Produk & UP */}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                        cand.needsConfirmation
                                          ? 'bg-amber-500 text-white'
                                          : 'bg-emerald-600 text-white'
                                      }`}
                                    >
                                      {cand.needsConfirmation
                                        ? `⚠️ Mirip (Diminta: ${cand.requestedCode})`
                                        : '✅ Cocok Persis'}
                                    </span>
                                    {cand.upCode && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono text-[9px] font-bold">
                                        {cand.upCode}
                                      </span>
                                    )}
                                  </div>

                                  <div className="font-mono text-xs font-black text-slate-900 dark:text-white">
                                    Kode Trello: <span className="text-indigo-600 dark:text-indigo-400">{cand.matchedCode}</span>
                                  </div>

                                  <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">
                                    {cand.productName}
                                  </div>
                                </div>
                              </div>

                              {/* Tombol 1-Klik Konfirmasi jika kode mirip (6612 -> 6612-1) */}
                              {cand.needsConfirmation && (
                                <div className="mt-2.5 pt-2 border-t border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                                    Apakah benar produk ini?
                                  </span>
                                  <button
                                    type="button"
                                    disabled={isLoading}
                                    onClick={() =>
                                      handleSendMessage(
                                        `Ya benar, pakai kode ${cand.matchedCode} (${cand.productName}${cand.upCode ? ` - ${cand.upCode}` : ''}) untuk diinput ke form penerimaan`
                                      )
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[10px] font-black flex items-center gap-1 shadow-2xs transition-colors cursor-pointer shrink-0"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Ya, Pakai Kode {cand.matchedCode}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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

                    {/* Direct CTA: Buka Form Input Penerimaan Produksi jika tool prepare_production_receipt_form dieksekusi */}
                    {!isUser &&
                      (msg.toolCallsExecuted?.includes('prepare_production_receipt_form') ||
                        msg.toolCallsExecuted?.includes('view_production_receipt_form_draft')) &&
                      onNavigateToProduksiInput && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-indigo-50/70 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span>Draft Form Input Penerimaan siap dicek & dilengkapi (Tetap Anda yang Submit)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenProduksiForm(true)}
                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                          >
                            <span>Buka Form Input Produksi</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                    {/* Kartu Laporan Siap Unduh (PDF & Excel) jika tool generate_exportable_report dieksekusi */}
                    {!isUser && msg.reportTable && msg.reportTable.rows && msg.reportTable.rows.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                              <Download className="w-3 h-3" />
                              <span>Dokumen Laporan Siap Diunduh</span>
                            </div>
                            <h4 className="text-xs font-black text-slate-900 dark:text-white truncate mt-0.5">
                              {msg.reportTable.title}
                            </h4>
                            {msg.reportTable.summary && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                                {msg.reportTable.summary}
                              </p>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold shrink-0">
                            {msg.reportTable.rows.length} Baris
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              exportAiTableToExcel(msg.reportTable!);
                              onNotify?.(`Laporan Excel "${msg.reportTable!.title}" berhasil diunduh!`, 'success');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Unduh Excel (.xlsx)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              exportAiTableToPdf(msg.reportTable!);
                              onNotify?.(`Laporan PDF "${msg.reportTable!.title}" berhasil diunduh!`, 'success');
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5 text-rose-500" />
                            <span>Unduh PDF (.pdf)</span>
                          </button>
                        </div>
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
          {/* Pending Attachments Preview Chips */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-2.5 p-2 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 animate-in fade-in duration-150">
              {pendingAttachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs shadow-2xs"
                >
                  {att.type === 'image' && att.previewUrl ? (
                    <img
                      src={att.previewUrl}
                      alt={att.name}
                      className="w-10 h-10 object-cover rounded-md border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                  )}
                  <div className="min-w-0 max-w-[160px]">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                    <p className="text-[9px] text-slate-400">
                      {att.type === 'image' ? 'Foto Dokumen (Vision)' : `${att.rowCount || 0} baris data`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-1 text-slate-400 hover:text-rose-500 rounded-md transition-colors cursor-pointer"
                    title="Hapus lampiran"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {isParsingAttachment && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-500 px-2 py-1 font-bold animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengekstrak file...</span>
                </div>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2"
          >
            {/* Hidden File & Camera Inputs */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv,image/jpeg,image/png,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Action Buttons: Paperclip & Camera */}
            <div className="flex items-center gap-1 shrink-0 pb-0.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isParsingAttachment}
                title="Lampirkan File Excel (.xlsx, .xls), CSV (.csv), atau Foto Dokumen"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isLoading || isParsingAttachment}
                title="Ambil Foto Dokumen / Baju dengan Kamera (Gemini Vision OCR)"
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

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
                placeholder={
                  pendingAttachments.length > 0
                    ? 'Ketik instruksi untuk lampiran ini... (atau Enter langsung untuk analisis)'
                    : 'Tanya stok, minta rekap, atau lampirkan Excel/Foto... (Enter kirim)'
                }
                disabled={isLoading}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary-500 text-slate-900 dark:text-white placeholder-slate-400 resize-none max-h-32 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || (!inputPrompt.trim() && pendingAttachments.length === 0)}
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

      {/* Modal Lightbox Zoom Foto Produk Trello UP */}
      {zoomedTrelloCandidate && (
        <div
          onClick={() => setZoomedTrelloCandidate(null)}
          className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                    {zoomedTrelloCandidate.matchedCode}
                  </span>
                  {zoomedTrelloCandidate.upCode && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 font-mono text-[10px] font-bold">
                      {zoomedTrelloCandidate.upCode}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">
                  {zoomedTrelloCandidate.productName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setZoomedTrelloCandidate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-950 flex items-center justify-center max-h-[65vh] overflow-hidden">
              <TrelloImage
                src={zoomedTrelloCandidate.photoUrl || zoomedTrelloCandidate.fallbackPhotoUrl}
                fallbackSrc={zoomedTrelloCandidate.fallbackPhotoUrl}
                alt={zoomedTrelloCandidate.productName}
                className="max-h-[58vh] w-auto object-contain rounded-xl"
              />
            </div>
            {zoomedTrelloCandidate.needsConfirmation && (
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Kode diminta: <span className="font-mono">{zoomedTrelloCandidate.requestedCode}</span> → Trello: <span className="font-mono">{zoomedTrelloCandidate.matchedCode}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cand = zoomedTrelloCandidate;
                    setZoomedTrelloCandidate(null);
                    handleSendMessage(
                      `Ya benar, pakai kode ${cand.matchedCode} (${cand.productName}${cand.upCode ? ` - ${cand.upCode}` : ''}) untuk diinput ke form penerimaan`
                    );
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Ya, Pakai Kode {zoomedTrelloCandidate.matchedCode}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>

  </div>
</div>
  );
};
