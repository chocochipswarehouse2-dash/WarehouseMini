import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert, HelpCircle, Search, X, CheckCircle2, AlertCircle, MessageSquare,
  Copy, Check, Sparkles, RefreshCw, Plus, Edit2, Trash2, Pin, Eye, User,
  Calendar, Filter, ChevronRight, Store, Layers, BookOpen, Clock, AlertTriangle, CheckSquare
} from 'lucide-react';
import { StoreFaqItem, StoreHelpTicket, StoreHelpTicketStatus, UserSession } from '../../types';
import {
  fetchStoreHelpTickets,
  updateStoreHelpTicketStatus,
  fetchStoreFaqs,
  saveStoreFaq,
  deleteStoreFaq,
  syncInitialFaqsToSupabase
} from '../../services/storeHelpService';

interface SuperadminKnowledgeHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onTicketsUpdated?: () => void;
}

export const SuperadminKnowledgeHubModal: React.FC<SuperadminKnowledgeHubModalProps> = ({
  isOpen,
  onClose,
  session,
  onShowToast,
  onTicketsUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'faqs'>('tickets');

  // Tickets State
  const [tickets, setTickets] = useState<StoreHelpTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<'all' | StoreHelpTicketStatus>('all');
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<string>('');

  // FAQs State
  const [faqs, setFaqs] = useState<StoreFaqItem[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(false);
  const [faqSearch, setFaqSearch] = useState('');
  const [isSyncingFaqs, setIsSyncingFaqs] = useState(false);

  // Edit / Add FAQ Form Modal
  const [isFaqFormOpen, setIsFaqFormOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Partial<StoreFaqItem> | null>(null);
  const [savingFaq, setSavingFaq] = useState(false);

  // Load Tickets & FAQs
  const loadTickets = async () => {
    setLoadingTickets(true);
    try {
      const data = await fetchStoreHelpTickets();
      setTickets(data);
      if (onTicketsUpdated) onTicketsUpdated();
    } finally {
      setLoadingTickets(false);
    }
  };

  const loadFaqs = async () => {
    setLoadingFaqs(true);
    try {
      const data = await fetchStoreFaqs();
      setFaqs(data);
    } finally {
      setLoadingFaqs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTickets();
      loadFaqs();
    }
  }, [isOpen]);

  // Count Unanswered Tickets
  const unansweredCount = useMemo(() => {
    return tickets.filter(t => t.status === 'unanswered').length;
  }, [tickets]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      // Filter by status
      if (ticketStatusFilter !== 'all' && ticket.status !== ticketStatusFilter) {
        return false;
      }
      // Filter by search query
      if (ticketSearch.trim()) {
        const q = ticketSearch.toLowerCase();
        const inStore = (ticket.store_name || '').toLowerCase().includes(q);
        const inPic = (ticket.pic_name || '').toLowerCase().includes(q);
        const inQuestion = (ticket.question || '').toLowerCase().includes(q);
        const inDetail = (ticket.detail || '').toLowerCase().includes(q);
        const inOrder = (ticket.order_id || '').toLowerCase().includes(q);
        if (!inStore && !inPic && !inQuestion && !inDetail && !inOrder) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, ticketStatusFilter, ticketSearch]);

  // Filtered FAQs
  const filteredFaqs = useMemo(() => {
    if (!faqSearch.trim()) return faqs;
    const q = faqSearch.toLowerCase();
    return faqs.filter(f => 
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q) ||
      (f.keywords || []).some(k => k.toLowerCase().includes(q))
    );
  }, [faqs, faqSearch]);

  // Handler: Update Ticket Status
  const handleUpdateStatus = async (ticket: StoreHelpTicket, newStatus: StoreHelpTicketStatus) => {
    const success = await updateStoreHelpTicketStatus(
      ticket.id,
      newStatus,
      ticket.admin_notes,
      session?.nama || session?.username || 'Superadmin'
    );
    if (success) {
      onShowToast(`Status tiket diperbarui menjadi: ${newStatus}`, 'success');
      loadTickets();
    } else {
      onShowToast('Gagal memperbarui status tiket', 'error');
    }
  };

  // Handler: Save Admin Notes
  const handleSaveNotes = async (ticket: StoreHelpTicket) => {
    const success = await updateStoreHelpTicketStatus(
      ticket.id,
      ticket.status,
      notesInput,
      session?.nama || session?.username || 'Superadmin'
    );
    if (success) {
      onShowToast('Catatan admin berhasil disimpan', 'success');
      setEditingNotesId(null);
      loadTickets();
    } else {
      onShowToast('Gagal menyimpan catatan admin', 'error');
    }
  };

  // Handler: Copy Developer Prompt for Antigravity AI
  const handleCopyPrompt = (ticket: StoreHelpTicket) => {
    const promptText = `Halo Antigravity, terdapat kendala alur pesanan dari Store yang memerlukan analisa & development fitur:

• Toko: ${ticket.store_name || 'Store'} (PIC: ${ticket.pic_name || 'PIC Toko'})
• Kategori: ${ticket.category || 'Manual Shipment / Alter'}
• ID Pesanan Terkait: ${ticket.order_id || '-'}
• Pertanyaan / Kendala: "${ticket.question}"
• Detail Masalah: "${ticket.detail || '-'}"

Tolong analisa alur sistem WMS saat ini, lalu rekomendasikan atau buatkan penyesuaian flow / fitur di sistem agar skenario ini dapat disupport dengan lancar dan aman.`;

    navigator.clipboard.writeText(promptText).then(() => {
      setCopiedPromptId(ticket.id);
      onShowToast('Prompt developer berhasil disalin ke clipboard!', 'success');
      setTimeout(() => setCopiedPromptId(null), 2500);
    });
  };

  // Handler: Sync Initial FAQs
  const handleSyncInitialFaqs = async () => {
    setIsSyncingFaqs(true);
    try {
      const res = await syncInitialFaqsToSupabase();
      if (res.success) {
        onShowToast(res.message, 'success');
        loadFaqs();
      } else {
        onShowToast(res.message, 'error');
      }
    } finally {
      setIsSyncingFaqs(false);
    }
  };

  // Handler: Delete FAQ
  const handleDeleteFaq = async (id: string) => {
    if (!window.confirm('Yakin ingin menghapus FAQ ini?')) return;
    const success = await deleteStoreFaq(id);
    if (success) {
      onShowToast('FAQ berhasil dihapus', 'success');
      loadFaqs();
    } else {
      onShowToast('Gagal menghapus FAQ', 'error');
    }
  };

  // Handler: Save New or Edited FAQ
  const handleSaveFaqForm = async () => {
    if (!editingFaq?.question?.trim() || !editingFaq?.answer?.trim()) {
      onShowToast('Pertanyaan dan Jawaban wajib diisi', 'warning');
      return;
    }
    setSavingFaq(true);
    try {
      const res = await saveStoreFaq(editingFaq as StoreFaqItem);
      if (res.success) {
        onShowToast(res.message, 'success');
        setIsFaqFormOpen(false);
        setEditingFaq(null);
        loadFaqs();
      } else {
        onShowToast(res.message, 'error');
      }
    } finally {
      setSavingFaq(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-linear-to-r from-amber-500/10 via-slate-50 to-indigo-500/10 dark:from-amber-950/20 dark:via-slate-900 dark:to-indigo-950/20 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 dark:bg-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">
                  Hub Superadmin: Q&A & Eskalasi Store
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                  Superadmin Only
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Tinjau pertanyaan/kendala yang dihadapi outlet, salin prompt otomatis ke developer, dan kelola basis pengetahuan FAQ.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all ${
              activeTab === 'tickets'
                ? 'border-amber-500 text-amber-600 dark:text-amber-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Kotak Masuk Pertanyaan Store</span>
            {unansweredCount > 0 && (
              <span className="px-1.5 py-0.2 text-[11px] font-bold rounded-full bg-rose-500 text-white animate-pulse">
                {unansweredCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('faqs')}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all ${
              activeTab === 'faqs'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Manajemen Basis Pengetahuan FAQ</span>
            <span className="px-1.5 py-0.2 text-[11px] font-medium rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {faqs.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-950/50 space-y-4">
          
          {/* ========================================================================= */}
          {/* TAB 1: KOTAK MASUK PERTANYAAN STORE (TICKETS) */}
          {/* ========================================================================= */}
          {activeTab === 'tickets' && (
            <div className="space-y-4">
              
              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Cari toko, PIC, kata kunci pertanyaan, no pesanan..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {ticketSearch && (
                    <button
                      onClick={() => setTicketSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setTicketStatusFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 transition-all ${
                      ticketStatusFilter === 'all'
                        ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Semua ({tickets.length})
                  </button>
                  <button
                    onClick={() => setTicketStatusFilter('unanswered')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 transition-all ${
                      ticketStatusFilter === 'unanswered'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50'
                    }`}
                  >
                    Belum Dijawab ({tickets.filter(t => t.status === 'unanswered').length})
                  </button>
                  <button
                    onClick={() => setTicketStatusFilter('in_development')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 transition-all ${
                      ticketStatusFilter === 'in_development'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 hover:bg-blue-50'
                    }`}
                  >
                    Sedang Didevelop ({tickets.filter(t => t.status === 'in_development').length})
                  </button>
                  <button
                    onClick={() => setTicketStatusFilter('resolved')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg shrink-0 transition-all ${
                      ticketStatusFilter === 'resolved'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50'
                    }`}
                  >
                    Selesai ({tickets.filter(t => t.status === 'resolved').length})
                  </button>

                  <button
                    onClick={loadTickets}
                    title="Segarkan daftar tiket"
                    className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingTickets ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Tickets List */}
              {loadingTickets ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                  <p className="text-sm">Memuat daftar pertanyaan Store...</p>
                </div>
              ) : filteredTickets.length === 0 ? (
                <div className="py-16 text-center bg-white dark:bg-slate-900/60 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                    Tidak ada pertanyaan yang cocok
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {ticketSearch || ticketStatusFilter !== 'all'
                      ? 'Coba ubah kata kunci pencarian atau ganti filter status di atas.'
                      : 'Semua pertanyaan dari outlet Store telah terjawab atau belum ada eskalasi baru masuk.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTickets.map(ticket => {
                    const isCopied = copiedPromptId === ticket.id;
                    const isEditingNotes = editingNotesId === ticket.id;

                    return (
                      <div
                        key={ticket.id}
                        className={`p-4 rounded-xl border bg-white dark:bg-slate-800/90 shadow-xs transition-all space-y-3 ${
                          ticket.status === 'unanswered'
                            ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/20 dark:bg-amber-950/10'
                            : ticket.status === 'in_development'
                            ? 'border-blue-300 dark:border-blue-800/80'
                            : 'border-slate-200 dark:border-slate-700/80'
                        }`}
                      >
                        {/* Ticket Header & Metadata */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-md bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              <Store className="w-3 h-3 text-amber-500" />
                              {ticket.store_name}
                            </span>
                            <span className="text-xs text-slate-400">
                              PIC: <span className="font-medium text-slate-600 dark:text-slate-300">{ticket.pic_name}</span>
                            </span>
                            {ticket.order_id && (
                              <span className="px-2 py-0.5 text-[11px] font-mono rounded-sm bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                #{ticket.order_id}
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div className="flex items-center gap-2">
                            {ticket.status === 'unanswered' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                                <AlertTriangle className="w-3 h-3" />
                                Belum Dijawab / Butuh Fitur
                              </span>
                            )}
                            {ticket.status === 'in_development' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                <Clock className="w-3 h-3" />
                                Sedang Didevelop
                              </span>
                            )}
                            {ticket.status === 'resolved' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                <CheckCircle2 className="w-3 h-3" />
                                Selesai
                              </span>
                            )}
                            {ticket.status === 'converted_to_faq' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                                <Sparkles className="w-3 h-3" />
                                Masuk FAQ
                              </span>
                            )}

                            <span className="text-[11px] text-slate-400">
                              {ticket.created_at ? new Date(ticket.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                            </span>
                          </div>
                        </div>

                        {/* Question & Detail */}
                        <div className="space-y-1.5">
                          <h4 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">
                            "{ticket.question}"
                          </h4>
                          {ticket.detail && (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700/50 leading-relaxed whitespace-pre-wrap">
                              {ticket.detail}
                            </p>
                          )}
                        </div>

                        {/* Action Toolbar */}
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700/60">
                          
                          {/* 1-Click Copy Developer Prompt */}
                          <button
                            onClick={() => handleCopyPrompt(ticket)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-linear-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white'
                            }`}
                            title="Salin template prompt berisi detail lengkap kendala ini untuk di-paste langsung ke Antigravity AI"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Tersalin ke Clipboard!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>📋 Salin Prompt Developer</span>
                              </>
                            )}
                          </button>

                          {/* Quick Status Changers */}
                          <div className="flex items-center gap-1.5">
                            {ticket.status !== 'in_development' && (
                              <button
                                onClick={() => handleUpdateStatus(ticket, 'in_development')}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 transition-colors"
                              >
                                Tandai Didevelop
                              </button>
                            )}
                            {ticket.status !== 'resolved' && (
                              <button
                                onClick={() => handleUpdateStatus(ticket, 'resolved')}
                                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors"
                              >
                                Tandai Selesai
                              </button>
                            )}

                            {/* Tombol Buat FAQ dari Tiket ini */}
                            <button
                              onClick={() => {
                                setEditingFaq({
                                  category: 'manual_shipment',
                                  question: ticket.question,
                                  answer: ticket.admin_notes || ticket.detail || '',
                                  keywords: [ticket.store_name, ticket.category],
                                  button_badges: [],
                                  action_steps: [],
                                  is_pinned: false
                                });
                                setIsFaqFormOpen(true);
                              }}
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 transition-colors flex items-center gap-1"
                              title="Jadikan pertanyaan ini sebagai FAQ umum agar store lain bisa langsung membaca solusinya"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Jadikan FAQ</span>
                            </button>
                          </div>
                        </div>

                        {/* Admin Notes Section */}
                        {ticket.admin_notes && !isEditingNotes && (
                          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-300/50 dark:border-amber-800/50 flex items-start justify-between gap-2 text-xs">
                            <div className="space-y-0.5">
                              <span className="font-semibold text-amber-800 dark:text-amber-300">
                                Catatan / Solusi Superadmin:
                              </span>
                              <p className="text-slate-700 dark:text-slate-300">{ticket.admin_notes}</p>
                            </div>
                            <button
                              onClick={() => {
                                setEditingNotesId(ticket.id);
                                setNotesInput(ticket.admin_notes || '');
                              }}
                              className="text-amber-700 hover:text-amber-900 dark:text-amber-400 p-1"
                              title="Edit catatan"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {isEditingNotes && (
                          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                            <label className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                              Catatan Solusi Superadmin untuk Store:
                            </label>
                            <textarea
                              value={notesInput}
                              onChange={(e) => setNotesInput(e.target.value)}
                              placeholder="Ketik catatan tindak lanjut atau solusi..."
                              rows={2}
                              className="w-full p-2 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="px-2.5 py-1 text-xs rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700"
                              >
                                Batal
                              </button>
                              <button
                                onClick={() => handleSaveNotes(ticket)}
                                className="px-2.5 py-1 text-xs rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium"
                              >
                                Simpan Catatan
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: MANAJEMEN FAQ STANDAR & TOP QUESTIONS */}
          {/* ========================================================================= */}
          {activeTab === 'faqs' && (
            <div className="space-y-4">
              
              {/* FAQ Actions Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={faqSearch}
                    onChange={(e) => setFaqSearch(e.target.value)}
                    placeholder="Cari FAQ berdasarkan pertanyaan, jawaban, atau kata kunci..."
                    className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {faqSearch && (
                    <button
                      onClick={() => setFaqSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Button Sync Initial FAQs */}
                  <button
                    onClick={handleSyncInitialFaqs}
                    disabled={isSyncingFaqs}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
                    title="Upload dan sinkronkan template 7 FAQ alur standar bawaan ke tabel database Supabase"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingFaqs ? 'animate-spin' : ''}`} />
                    <span>Sinkronkan FAQ Standar</span>
                  </button>

                  {/* Button Tambah FAQ Baru */}
                  <button
                    onClick={() => {
                      setEditingFaq({
                        category: 'manual_shipment',
                        question: '',
                        answer: '',
                        keywords: [],
                        button_badges: [],
                        action_steps: [],
                        is_pinned: false
                      });
                      setIsFaqFormOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah FAQ Baru</span>
                  </button>
                </div>
              </div>

              {/* FAQs Table / Cards */}
              {loadingFaqs ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
                  <p className="text-sm">Memuat daftar FAQ...</p>
                </div>
              ) : filteredFaqs.length === 0 ? (
                <div className="py-16 text-center bg-white dark:bg-slate-900/60 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-3">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                    Tidak ada FAQ yang ditemukan
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Klik tombol "Sinkronkan FAQ Standar" di atas untuk memuat panduan Split Fulfil, Form Alter, Sold Out, dan alur penting lainnya ke Supabase.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFaqs.map((faq, index) => (
                    <div
                      key={faq.id || index}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 shadow-xs space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {faq.is_pinned && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                <Pin className="w-2.5 h-2.5 fill-current" />
                                PINNED
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {faq.category}
                            </span>
                            {faq.answer_admin && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                🛡️ Alur Admin
                              </span>
                            )}
                            {faq.answer_store && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                🏪 Alur Store
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Eye className="w-3 h-3" />
                              {faq.view_count || 0} kali dibaca
                            </span>
                          </div>

                          <h4 className="font-semibold text-sm sm:text-base text-slate-900 dark:text-white">
                            {faq.question}
                          </h4>
                        </div>

                        {/* Edit / Delete actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => {
                              setEditingFaq({ ...faq });
                              setIsFaqFormOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                            title="Edit FAQ"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {faq.id && !faq.id.startsWith('faq-') && (
                            <button
                              onClick={() => handleDeleteFaq(faq.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              title="Hapus FAQ dari Database"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Answer Snippet */}
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {faq.answer}
                      </p>

                      {/* Mini Preview Action Steps */}
                      {faq.action_steps && faq.action_steps.length > 0 && (
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 space-y-1.5">
                          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            Langkah Panduan ({faq.action_steps.length} langkah):
                          </span>
                          <div className="space-y-1">
                            {faq.action_steps.map((step) => (
                              <div key={step.step} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                <span className="w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {step.step}
                                </span>
                                <span className="font-medium text-slate-800 dark:text-slate-200">{step.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Data tersinkron otomatis ke Supabase</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-medium rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            Tutup
          </button>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* MODAL EDIT / TAMBAH FAQ */}
      {/* ========================================================================= */}
      {isFaqFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
            
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                {editingFaq?.id && !editingFaq.id.startsWith('faq-') ? 'Edit FAQ' : 'Tambah FAQ Baru'}
              </h4>
              <button
                onClick={() => setIsFaqFormOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori
                </label>
                <select
                  value={editingFaq?.category || 'manual_shipment'}
                  onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value })}
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="manual_shipment">Manual Shipment & Multi-Store</option>
                  <option value="alteration">Alteration & Permak</option>
                  <option value="general">Umum / Kebijakan Pesanan</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pertanyaan (Gunakan kalimat natural yang sering ditanyakan Store)
                </label>
                <input
                  type="text"
                  value={editingFaq?.question || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                  placeholder="Contoh: Bagaimana cara split jika 1 pcs diambil toko dan 1 pcs dikirim gudang?"
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Jawaban Umum / Ringkasan Fallback <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={editingFaq?.answer || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer: e.target.value })}
                  placeholder="Ringkasan jawaban umum yang dapat dibaca semua pihak..."
                  rows={2}
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Jawaban Khusus Staf Store */}
              <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <span>🏪 Jawaban & Alur untuk Staf Store / Outlet</span>
                </div>
                <textarea
                  value={editingFaq?.answer_store || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer_store: e.target.value })}
                  placeholder="Tuliskan alur tindakan yang benar-benar ada di layar Store (misal: Store tidak ada tombol batal -> minta ajukan ke Admin)..."
                  rows={3}
                  className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
                <input
                  type="text"
                  value={editingFaq?.store_notes || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, store_notes: e.target.value })}
                  placeholder="💡 Tips/SOP khusus Store (opsional, contoh: Jangan buat pesanan baru sebelum mengajukan pembatalan)..."
                  className="w-full p-2 text-[11px] bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-lg"
                />
              </div>

              {/* Jawaban Khusus Admin Gudang */}
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                  <span>🛡️ Jawaban & Wewenang untuk Admin Gudang (Full Access)</span>
                </div>
                <textarea
                  value={editingFaq?.answer_admin || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, answer_admin: e.target.value })}
                  placeholder="Tuliskan alur eksekusi Admin: nama tab, tombol yang ditekan, status pesanan, dan dampaknya ke stok/DealPOS..."
                  rows={3}
                  className="w-full p-2.5 text-xs bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="text"
                  value={editingFaq?.admin_notes || ''}
                  onChange={(e) => setEditingFaq({ ...editingFaq, admin_notes: e.target.value })}
                  placeholder="ℹ️ Catatan audit / sistem khusus Admin (opsional)..."
                  className="w-full p-2 text-[11px] bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Kata Kunci Pencarian (Pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={(editingFaq?.keywords || []).join(', ')}
                  onChange={(e) => setEditingFaq({
                    ...editingFaq,
                    keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="split, pecah, 2 pcs, ambil toko, gudang..."
                  className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="pinFaq"
                  checked={Boolean(editingFaq?.is_pinned)}
                  onChange={(e) => setEditingFaq({ ...editingFaq, is_pinned: e.target.checked })}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="pinFaq" className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                  Sematkan (Pin) FAQ ini di urutan paling atas
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-900">
              <button
                onClick={() => setIsFaqFormOpen(false)}
                className="px-4 py-2 text-xs rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-300"
              >
                Batal
              </button>
              <button
                onClick={handleSaveFaqForm}
                disabled={savingFaq}
                className="px-4 py-2 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors flex items-center gap-1.5"
              >
                {savingFaq ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Simpan FAQ</span>
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
