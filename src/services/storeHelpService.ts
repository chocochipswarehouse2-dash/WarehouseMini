import { StoreFaqItem, StoreHelpTicket, StoreHelpTicketStatus } from '../types';
import { supabaseFetch } from './supabase';
import { INITIAL_STORE_FAQS } from '../data/initialStoreFaq';

const STORAGE_FAQS_KEY = 'wms_cached_store_faqs';
const STORAGE_TICKETS_KEY = 'wms_cached_store_tickets';

// =============================================================================
// FAQ & KNOWLEDGE BASE OPERATIONS
// =============================================================================

export async function fetchStoreFaqs(): Promise<StoreFaqItem[]> {
  try {
    const res = await supabaseFetch<StoreFaqItem[]>(
      'store_help_faq',
      'GET',
      null,
      'select=*&order=is_pinned.desc,view_count.desc,created_at.desc'
    );
    if (res && Array.isArray(res) && res.length > 0) {
      localStorage.setItem(STORAGE_FAQS_KEY, JSON.stringify(res));
      return res;
    }
  } catch (err) {
    console.warn('[storeHelpService] Gagal fetch store_help_faq dari Supabase, fallback ke cache/default:', err);
  }

  // Fallback ke localStorage jika ada
  try {
    const cached = localStorage.getItem(STORAGE_FAQS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}

  // Fallback ke built-in default FAQs
  return INITIAL_STORE_FAQS;
}

export async function saveStoreFaq(faq: StoreFaqItem): Promise<{ success: boolean; data?: StoreFaqItem; message: string }> {
  try {
    const isUpdate = Boolean(faq.id && !faq.id.startsWith('faq-'));
    const payload = {
      category: faq.category || 'manual_shipment',
      question: faq.question.trim(),
      answer: faq.answer.trim(),
      keywords: faq.keywords || [],
      button_badges: faq.button_badges || [],
      action_steps: faq.action_steps || [],
      image_url: faq.image_url || null,
      is_pinned: Boolean(faq.is_pinned),
      updated_at: new Date().toISOString()
    };

    if (isUpdate) {
      await supabaseFetch('store_help_faq', 'PATCH', payload, `id=eq.${faq.id}`);
      return { success: true, message: 'FAQ berhasil diperbarui' };
    } else {
      const inserted = await supabaseFetch<StoreFaqItem[]>('store_help_faq', 'POST', [{ ...payload, created_at: new Date().toISOString() }]);
      return { success: true, data: inserted?.[0], message: 'FAQ baru berhasil ditambahkan' };
    }
  } catch (err: any) {
    console.error('[storeHelpService] Error saving FAQ:', err);
    return { success: false, message: err?.message || 'Gagal menyimpan FAQ ke database' };
  }
}

export async function deleteStoreFaq(id: string): Promise<boolean> {
  try {
    await supabaseFetch('store_help_faq', 'DELETE', null, `id=eq.${id}`);
    return true;
  } catch (err) {
    console.error('[storeHelpService] Error deleting FAQ:', err);
    return false;
  }
}

export async function incrementFaqView(id: string): Promise<void> {
  if (!id || id.startsWith('faq-')) return;
  try {
    // Fire and forget view counter increment
    const currentList = await fetchStoreFaqs();
    const item = currentList.find(f => f.id === id);
    if (item) {
      const newCount = (item.view_count || 0) + 1;
      await supabaseFetch('store_help_faq', 'PATCH', { view_count: newCount }, `id=eq.${id}`);
    }
  } catch {}
}

export async function syncInitialFaqsToSupabase(): Promise<{ success: boolean; count: number; message: string }> {
  try {
    const existing = await supabaseFetch<StoreFaqItem[]>('store_help_faq', 'GET', null, 'select=question');
    const existingQuestions = new Set((existing || []).map(f => f.question.trim().toLowerCase()));

    const toInsert = INITIAL_STORE_FAQS
      .filter(f => !existingQuestions.has(f.question.trim().toLowerCase()))
      .map(f => ({
        category: f.category,
        question: f.question,
        answer: f.answer,
        keywords: f.keywords || [],
        button_badges: f.button_badges || [],
        action_steps: f.action_steps || [],
        image_url: f.image_url || null,
        view_count: f.view_count || 0,
        is_pinned: Boolean(f.is_pinned),
        created_at: new Date().toISOString()
      }));

    if (toInsert.length === 0) {
      return { success: true, count: 0, message: 'Seluruh FAQ standar sudah tersinkronisasi di Supabase' };
    }

    await supabaseFetch('store_help_faq', 'POST', toInsert);
    return { success: true, count: toInsert.length, message: `Berhasil menambahkan ${toInsert.length} FAQ standar ke Supabase` };
  } catch (err: any) {
    console.error('[storeHelpService] Error syncing initial FAQs:', err);
    return { success: false, count: 0, message: err?.message || 'Gagal sinkronisasi FAQ ke Supabase' };
  }
}

// =============================================================================
// STORE HELP TICKETS (PERTANYAAN BELUM TERJAWAB & BACKLOG FITUR)
// =============================================================================

export async function fetchStoreHelpTickets(): Promise<StoreHelpTicket[]> {
  try {
    const res = await supabaseFetch<StoreHelpTicket[]>(
      'store_help_tickets',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );
    if (res && Array.isArray(res)) {
      localStorage.setItem(STORAGE_TICKETS_KEY, JSON.stringify(res));
      return res;
    }
  } catch (err) {
    console.warn('[storeHelpService] Gagal fetch store_help_tickets:', err);
  }

  try {
    const cached = localStorage.getItem(STORAGE_TICKETS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  return [];
}

export async function submitStoreHelpTicket(ticket: Omit<StoreHelpTicket, 'id' | 'created_at'>): Promise<{ success: boolean; message: string; ticketId?: string }> {
  try {
    const payload = {
      store_name: ticket.store_name || 'Store',
      pic_name: ticket.pic_name || 'PIC Store',
      category: ticket.category || 'Manual Shipment & Alter',
      question: ticket.question.trim(),
      detail: ticket.detail ? ticket.detail.trim() : null,
      order_id: ticket.order_id ? ticket.order_id.trim() : null,
      status: ticket.status || 'unanswered',
      created_at: new Date().toISOString()
    };

    const res = await supabaseFetch<StoreHelpTicket[]>('store_help_tickets', 'POST', [payload]);
    return {
      success: true,
      message: 'Pertanyaan berhasil diajukan ke Superadmin Hub untuk ditinjau dan dikembangkan!',
      ticketId: res?.[0]?.id
    };
  } catch (err: any) {
    console.error('[storeHelpService] Error submitting ticket:', err);
    return {
      success: false,
      message: err?.message || 'Gagal mengirim pertanyaan. Silakan coba kembali.'
    };
  }
}

export async function updateStoreHelpTicketStatus(
  id: string,
  status: StoreHelpTicketStatus,
  admin_notes?: string,
  resolved_by?: string
): Promise<boolean> {
  try {
    const payload: any = {
      status,
      admin_notes: admin_notes !== undefined ? admin_notes : undefined,
      resolved_by: resolved_by || undefined,
      resolved_at: status === 'resolved' || status === 'converted_to_faq' ? new Date().toISOString() : undefined
    };
    await supabaseFetch('store_help_tickets', 'PATCH', payload, `id=eq.${id}`);
    return true;
  } catch (err) {
    console.error('[storeHelpService] Error updating ticket status:', err);
    return false;
  }
}

// =============================================================================
// INTELLIGENT INTENT & FUZZY FAQ SEARCH
// =============================================================================

// Kamus sinonim bahasa operasional toko ke konsep WMS
const SYNONYM_MAP: Record<string, string[]> = {
  split: ['pisah', 'pecah', 'bagi', '2 pcs', 'dua pcs', 'campur', 'dua biji', 'beda toko', 'sebagian'],
  alter: ['alterasi', 'potong', 'panjang', 'kecilkan', 'permak', 'reparasi', 'penjahit', 'jahit', 'spk'],
  sold_out: ['kosong', 'habis', 'sold', 'reject', 'cacat', 'rusak', 'ilang', 'hilang', 'noda'],
  kirim_gudang: ['antar', 'struk', 'surat jalan struk', 'antar fisik', 'antar ke gudang', 'kurir internal'],
  resi: ['no resi', 'nomor resi', 'resi kurir', 'lacak', 'tracking', 'jne', 'jnt', 'sicepat', 'ekspedisi'],
  dealpos: ['no sj', 'tr', 'transfer', 'sj dealpos', 'surat jalan dealpos'],
  batal: ['cancel', 'salah input', 'keliru', 'hapus', 'batalin']
};

export function searchFaqWithIntent(query: string, allFaqs: StoreFaqItem[]): {
  matches: StoreFaqItem[];
  hasHighConfidenceMatch: boolean;
  topScore: number;
} {
  const cleanQuery = query.toLowerCase().trim();
  if (!cleanQuery) {
    return {
      matches: allFaqs,
      hasHighConfidenceMatch: true,
      topScore: 1
    };
  }

  const queryTokens = cleanQuery.split(/[\s,./?!-_]+/).filter(Boolean);

  const scored = allFaqs.map(faq => {
    let score = 0;
    const qLower = faq.question.toLowerCase();
    const aLower = faq.answer.toLowerCase();
    const keywords = (faq.keywords || []).map(k => k.toLowerCase());

    // 1. Direct substring match pada question (Score tinggi)
    if (qLower.includes(cleanQuery)) {
      score += 100;
    }

    // 2. Token match pada question
    queryTokens.forEach(token => {
      if (token.length <= 1) return;
      if (qLower.includes(token)) score += 20;
      if (aLower.includes(token)) score += 5;
      if (keywords.some(k => k.includes(token))) score += 15;

      // 3. Synonym matching
      Object.entries(SYNONYM_MAP).forEach(([key, syns]) => {
        if (syns.some(s => s.includes(token) || token.includes(s))) {
          if (qLower.includes(key) || keywords.some(k => k.includes(key))) {
            score += 25;
          }
        }
      });
    });

    return { faq, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const filtered = scored.filter(s => s.score > 0).map(s => s.faq);
  const topScore = scored[0]?.score || 0;

  return {
    matches: filtered.length > 0 ? filtered : allFaqs.slice(0, 4),
    hasHighConfidenceMatch: topScore >= 35,
    topScore
  };
}
