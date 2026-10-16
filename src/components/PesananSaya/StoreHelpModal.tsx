import React, { useState, useEffect, useMemo } from 'react';
import {
  HelpCircle, Search, X, ChevronDown, ChevronUp, Sparkles, Send, CheckCircle2,
  AlertCircle, MessageSquare, ArrowRight, GitFork, Scissors, AlertTriangle,
  Printer, Truck, FileText, Trash2, Building2, Store, Package, Layers, ThumbsUp, Check
} from 'lucide-react';
import { StoreFaqItem, UserSession } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import {
  fetchStoreFaqs,
  submitStoreHelpTicket,
  incrementFaqView,
  searchFaqWithIntent
} from '../../services/storeHelpService';

interface StoreHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  defaultOrderId?: string;
}

export const StoreHelpModal: React.FC<StoreHelpModalProps> = ({
  isOpen,
  onClose,
  session,
  onShowToast,
  defaultOrderId
}) => {
  const userIsAdmin = isSuperadmin(session);
  const [faqs, setFaqs] = useState<StoreFaqItem[]>([]);
  const [loadingFaqs, setLoadingFaqs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFaqId, setExpandedFaqId] = useState<string | null>(null);
  const [likedFaqs, setLikedFaqs] = useState<Record<string, boolean>>({});

  // Tab switch: 'faq' (Pusat Bantuan) vs 'ask' (Tanyakan Masalah Baru ke Superadmin)
  const [activeTab, setActiveTab] = useState<'faq' | 'ask'>('faq');

  // Form State untuk Kirim Pertanyaan Baru
  const [askQuestion, setAskQuestion] = useState('');
  const [askDetail, setAskDetail] = useState('');
  const [askCategory, setAskCategory] = useState('Manual Shipment & Alter');
  const [askOrderId, setAskOrderId] = useState(defaultOrderId || '');
  const [isSubmittingAsk, setIsSubmittingAsk] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Ambil data FAQ saat modal terbuka
  useEffect(() => {
    if (isOpen) {
      setLoadingFaqs(true);
      fetchStoreFaqs()
        .then((data) => {
          setFaqs(data);
          // Default buka FAQ pertama yang dipinned
          const pinned = data.find(f => f.is_pinned);
          if (pinned && pinned.id) setExpandedFaqId(pinned.id);
        })
        .finally(() => setLoadingFaqs(false));
    } else {
      setSearchQuery('');
      setSubmitSuccess(false);
    }
  }, [isOpen]);

  // Suggested quick search chips
  const QUICK_TOPICS = [
    { label: '🔀 Split Fulfil 2 pcs', query: 'split 2 pcs' },
    { label: '✂️ ID Form Alter', query: 'id form alter' },
    { label: '⚠️ Barang Sold Out', query: 'sold out' },
    { label: '🚚 Kirim ke Gudang', query: 'kirim ke gudang' },
    { label: '📦 No Resi Kurir', query: 'resi' },
    { label: '📄 No SJ DealPOS', query: 'dealpos' },
  ];

  // Filter & Intent Matching
  const searchResult = useMemo(() => {
    let filtered = faqs;
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(f => f.category === selectedCategory);
    }
    return searchFaqWithIntent(searchQuery, filtered);
  }, [faqs, searchQuery, selectedCategory]);

  const handleToggleAccordion = (id?: string) => {
    if (!id) return;
    if (expandedFaqId === id) {
      setExpandedFaqId(null);
    } else {
      setExpandedFaqId(id);
      incrementFaqView(id);
    }
  };

  const handleLikeFaq = (id?: string) => {
    if (!id) return;
    setLikedFaqs(prev => ({ ...prev, [id]: true }));
    onShowToast('Terima kasih atas tanggapan Anda!', 'success');
  };

  const handleSubmitQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim()) {
      onShowToast('Pertanyaan tidak boleh kosong', 'warning');
      return;
    }

    setIsSubmittingAsk(true);
    try {
      const storeName = session?.divisi || session?.role || 'Store';
      const picName = session?.name || session?.username || 'PIC Store';

      const res = await submitStoreHelpTicket({
        store_name: storeName,
        pic_name: picName,
        category: askCategory,
        question: askQuestion.trim(),
        detail: askDetail.trim() || undefined,
        order_id: askOrderId.trim() || undefined,
        status: 'unanswered',
      });

      if (res.success) {
        setSubmitSuccess(true);
        onShowToast(res.message, 'success');
        setAskQuestion('');
        setAskDetail('');
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal mengirim pertanyaan', 'error');
    } finally {
      setIsSubmittingAsk(false);
    }
  };

  // Helper render badge miniatur tombol UI asli
  const renderBadgeIcon = (iconName?: string) => {
    switch (iconName) {
      case 'GitFork': return <GitFork className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />;
      case 'Scissors': return <Scissors className="w-3 h-3 text-rose-600 dark:text-rose-400" />;
      case 'AlertTriangle': return <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
      case 'Printer': return <Printer className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
      case 'Truck': return <Truck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />;
      case 'FileText': return <FileText className="w-3 h-3 text-amber-600 dark:text-amber-400" />;
      case 'Trash2': return <Trash2 className="w-3 h-3 text-rose-600 dark:text-rose-400" />;
      case 'Building2': return <Building2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />;
      default: return <Store className="w-3 h-3 text-slate-600 dark:text-slate-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Pusat Bantuan Flow Pesanan & SOP
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  userIsAdmin
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                }`}>
                  {userIsAdmin ? '🛡️ Mode Admin Gudang' : '🏪 Mode Staf Store / Outlet'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ketik pertanyaan bebas atau cari solusi panduan tombol di sistem WMS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-4 bg-slate-50/40 dark:bg-slate-900/40 text-xs font-bold">
          <button
            onClick={() => { setActiveTab('faq'); setSubmitSuccess(false); }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'faq'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Tanya Jawab & Panduan Solusi</span>
            <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 rounded-full font-semibold ml-1">
              {faqs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ask')}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'ask'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Tanyakan ke Superadmin / Usul Alur Baru</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {activeTab === 'faq' ? (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik pertanyaan bebas (contoh: split 2 pcs, form alter manual, sold out, resi)..."
                  className="w-full pl-9 pr-8 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Quick Topic Chips */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1">
                  Pencarian Populer:
                </span>
                {QUICK_TOPICS.map((topic, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSearchQuery(topic.query)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                  >
                    {topic.label}
                  </button>
                ))}
              </div>

              {/* Kategori Filter Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 pt-1 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold">
                {[
                  { id: 'all', label: 'Semua Kategori' },
                  { id: 'multi_store', label: 'Multi-Store & Split' },
                  { id: 'alteration_repair', label: 'Alteration & Repair' },
                  { id: 'manual_shipment', label: 'Manual Shipment & Sold' },
                  { id: 'resi_tracking', label: 'Resi & Pengiriman' },
                  { id: 'stok_dealpos', label: 'Stok DealPOS' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-md shrink-0 transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Search Result Status */}
              {searchQuery && (
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                  <span>
                    Ditemukan <strong>{searchResult.matches.length}</strong> panduan untuk "<em>{searchQuery}</em>":
                  </span>
                  {!searchResult.hasHighConfidenceMatch && (
                    <button
                      onClick={() => { setActiveTab('ask'); setAskQuestion(searchQuery); }}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <span>Belum ada yang cocok? Tanyakan</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              {/* List FAQ Accordion */}
              <div className="space-y-3">
                {searchResult.matches.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 space-y-3">
                    <HelpCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Tidak Menemukan Jawaban untuk Pertanyaan Ini
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                        Kasus atau alur yang Anda maksud kemungkinan belum pernah terjadi atau belum didukung sistem. Anda bisa langsung meneruskannya ke Superadmin!
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setActiveTab('ask'); setAskQuestion(searchQuery); }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Teruskan Pertanyaan ke Superadmin</span>
                    </button>
                  </div>
                ) : (
                  searchResult.matches.map((faq) => {
                    const isExpanded = expandedFaqId === faq.id;
                    const isLiked = likedFaqs[faq.id || ''];

                    return (
                      <div
                        key={faq.id || faq.question}
                        className={`rounded-xl border transition-all ${
                          isExpanded
                            ? 'bg-white dark:bg-slate-900 border-indigo-400 dark:border-indigo-600 shadow-md ring-1 ring-indigo-400/20'
                            : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                        }`}
                      >
                        {/* Question Header */}
                        <button
                          type="button"
                          onClick={() => handleToggleAccordion(faq.id)}
                          className="w-full p-3.5 sm:p-4 text-left flex items-start justify-between gap-3 cursor-pointer"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="p-1 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 mt-0.5 shrink-0">
                              <HelpCircle className="w-4 h-4" />
                            </span>
                            <div>
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                                {faq.question}
                              </h3>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {faq.is_pinned && (
                                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.2 rounded">
                                    ⭐ Top Pertanyaan
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {faq.category.replace('_', ' ').toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="p-1 text-slate-400 shrink-0">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </button>

                        {/* Answer Details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-3.5 animate-in fade-in">
                            
                            {/* Ringkasan Penjelasan */}
                            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                              {faq.answer}
                            </p>

                            {/* Tombol Miniatur UI Asli yang harus dicari staf */}
                            {faq.button_badges && faq.button_badges.length > 0 && (
                              <div className="space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                  Miniatur Tombol yang Harus Ditekan:
                                </span>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {faq.button_badges.map((b, bIdx) => (
                                    <div
                                      key={bIdx}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border shadow-2xs bg-white dark:bg-slate-800 text-slate-800 dark:text-white border-slate-300 dark:border-slate-700"
                                    >
                                      {renderBadgeIcon(b.icon)}
                                      <span>{b.label}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action Steps */}
                            {faq.action_steps && faq.action_steps.length > 0 && (
                              <div className="space-y-2 pt-1">
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                  Langkah-langkah di Layar:
                                </span>
                                <div className="space-y-1.5">
                                  {faq.action_steps.map((st, sIdx) => (
                                    <div
                                      key={sIdx}
                                      className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300"
                                    >
                                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                                        {st.step}
                                      </span>
                                      <div>
                                        <strong className="text-slate-900 dark:text-white block font-semibold">
                                          {st.title}
                                        </strong>
                                        <span className="text-[11.5px] text-slate-600 dark:text-slate-400">
                                          {st.desc}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Tombol Cepat Khusus Store jika butuh bantuan Admin (misal Pembatalan / Sold Out) */}
                            {!userIsAdmin && (faq.id === 'faq-cancel-manual-shipment' || faq.id === 'faq-sold-out-handling') && (
                              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 flex-wrap">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                                    {faq.id === 'faq-cancel-manual-shipment'
                                      ? 'Perlu bantuan Admin Gudang untuk membatalkan pesanan ini?'
                                      : 'Perlu bantuan Admin Gudang untuk update stok sold out / ganti toko?'}
                                  </span>
                                  <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                    Kirimkan permohonan ke Superadmin Hub dengan formulir otomatis 1-klik.
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('ask');
                                    setAskCategory(faq.id === 'faq-cancel-manual-shipment' ? 'Pembatalan Pesanan' : 'Barang Sold Out');
                                    setAskQuestion(faq.id === 'faq-cancel-manual-shipment' ? 'Permohonan Pembatalan Pesanan Salah Input' : 'Laporan Barang Sold Out di Rak Toko');
                                    setAskDetail(faq.id === 'faq-cancel-manual-shipment'
                                      ? 'Halo Admin Gudang, mohon bantuan untuk membatalkan pesanan ini karena: '
                                      : 'Halo Admin Gudang, barang di toko kami tidak tersedia/reject untuk pesanan: ');
                                  }}
                                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  <span>Ajukan ke Admin Sekarang</span>
                                </button>
                              </div>
                            )}

                            {/* Feedback Section */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                              <span className="text-[11px]">Apakah panduan ini menyelesaikan kendala Anda?</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleLikeFaq(faq.id)}
                                  className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors ${
                                    isLiked
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  <ThumbsUp className="w-3.5 h-3.5" />
                                  <span>{isLiked ? 'Membantu' : 'Ya, Membantu'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setActiveTab('ask'); setAskQuestion(`Kendala terkait: ${faq.question}`); }}
                                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                                >
                                  Belum Membantu?
                                </button>
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom Callout ke Superadmin */}
              <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 rounded-xl border border-indigo-200 dark:border-indigo-900 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
                  <MessageSquare className="w-4 h-4 shrink-0 text-indigo-600" />
                  <span>
                    Punya kasus pesanan baru yang belum ada solusinya di sistem?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('ask')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shrink-0 transition-colors cursor-pointer text-xs"
                >
                  Ajukan Pertanyaan Baru
                </button>
              </div>
            </>
          ) : (
            /* Tab: Kirim Pertanyaan Baru ke Superadmin Hub */
            <div className="space-y-4">
              {submitSuccess ? (
                <div className="text-center py-10 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-6 space-y-3">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
                  <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                    Pertanyaan Berhasil Diteruskan ke Superadmin!
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mx-auto">
                    Persoalan Anda telah masuk ke <strong>Superadmin Knowledge & Feature Hub</strong> untuk dipelajari dan dibuatkan solusinya di sistem WMS.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setActiveTab('faq'); setSubmitSuccess(false); }}
                    className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    Kembali ke Pusat Bantuan
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitQuestion} className="space-y-3.5">
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                    💡 <strong>Catatan:</strong> Pertanyaan Anda akan langsung masuk ke layar kerja Superadmin untuk dianalisis dan dikembangkan fiturnya bersama Developer/AI.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Store Pengaju:
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={session?.divisi || session?.role || 'Store'}
                        className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nama PIC Pengaju:
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={session?.name || session?.username || 'PIC Store'}
                        className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Kategori Masalah:
                      </label>
                      <select
                        value={askCategory}
                        onChange={(e) => setAskCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white"
                      >
                        <option value="Manual Shipment & Alter">Manual Shipment & Alter</option>
                        <option value="Multi-Store Fulfillment">Multi-Store Fulfillment</option>
                        <option value="DealPOS & Stok">DealPOS & Sinkronisasi Stok</option>
                        <option value="Pengiriman & Resi">Pengiriman & Resi</option>
                        <option value="Usulan Fitur Baru">Usulan Fitur Baru Lainnya</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        No. Pesanan / Order ID Terkait (Opsional):
                      </label>
                      <input
                        type="text"
                        value={askOrderId}
                        onChange={(e) => setAskOrderId(e.target.value)}
                        placeholder="Contoh: MS-261016-A12B"
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pertanyaan / Kendala yang Dialami *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      placeholder="Jelaskan pertanyaan Anda dengan bahasa santai... (contoh: Bagaimana jika customer mau tukar warna setelah paket terlanjur dikirim?)"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Rincian Kronologi / Detail Tambahan (Opsional):
                    </label>
                    <textarea
                      rows={2}
                      value={askDetail}
                      onChange={(e) => setAskDetail(e.target.value)}
                      placeholder="Ceritakan detail barang, SKU, atau alur yang diinginkan..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('faq')}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingAsk}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSubmittingAsk ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Mengirim...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Kirim ke Superadmin Hub</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>WMS Knowledge & Store Support Center • v1.0</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
