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

// SQL Query Migration untuk aktivasi kolom per-peran Store vs Admin
export const STORE_HELP_MIGRATION_SQL = `-- ============================================================
-- SQL MIGRASI SKEMA: TABEL STORE HELP FAQ (DUAL-PERSPECTIVE)
-- ============================================================
-- Tambah kolom khusus peran Store vs Admin
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT 'all';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS answer_admin TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS answer_store TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS action_steps_admin JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS action_steps_store JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS button_badges_admin JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS button_badges_store JSONB DEFAULT '[]';
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE public.store_help_faq ADD COLUMN IF NOT EXISTS store_notes TEXT;

-- Muat ulang schema cache PostgREST agar kolom baru langsung aktif
NOTIFY pgrst, 'reload schema';`;

function isSchemaMissingColumnError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('pgrst204') ||
    msg.includes('schema cache') ||
    msg.includes('action_steps_admin') ||
    msg.includes('column')
  );
}

export async function saveStoreFaq(
  faq: StoreFaqItem
): Promise<{ success: boolean; data?: StoreFaqItem; message: string; requiresMigration?: boolean }> {
  const isUpdate = Boolean(faq.id && !faq.id.startsWith('faq-'));
  const fullPayload = {
    category: faq.category || 'manual_shipment',
    question: faq.question.trim(),
    answer: faq.answer.trim(),
    target_audience: faq.target_audience || 'all',
    answer_admin: faq.answer_admin?.trim() || null,
    answer_store: faq.answer_store?.trim() || null,
    action_steps_admin: faq.action_steps_admin || [],
    action_steps_store: faq.action_steps_store || [],
    button_badges_admin: faq.button_badges_admin || [],
    button_badges_store: faq.button_badges_store || [],
    admin_notes: faq.admin_notes?.trim() || null,
    store_notes: faq.store_notes?.trim() || null,
    keywords: faq.keywords || [],
    button_badges: faq.button_badges || [],
    action_steps: faq.action_steps || [],
    image_url: faq.image_url || null,
    is_pinned: Boolean(faq.is_pinned),
    updated_at: new Date().toISOString()
  };

  const basePayload = {
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

  try {
    if (isUpdate) {
      await supabaseFetch('store_help_faq', 'PATCH', fullPayload, `id=eq.${faq.id}`);
      return { success: true, message: 'FAQ berhasil diperbarui' };
    } else {
      const inserted = await supabaseFetch<StoreFaqItem[]>('store_help_faq', 'POST', [
        { ...fullPayload, created_at: new Date().toISOString() }
      ]);
      return { success: true, data: inserted?.[0], message: 'FAQ baru berhasil ditambahkan' };
    }
  } catch (err: any) {
    if (isSchemaMissingColumnError(err)) {
      console.warn('[storeHelpService] Kolom peran belum ada di Supabase, menyimpan dengan payload dasar...');
      try {
        if (isUpdate) {
          await supabaseFetch('store_help_faq', 'PATCH', basePayload, `id=eq.${faq.id}`);
          return {
            success: true,
            requiresMigration: true,
            message: 'FAQ berhasil diperbarui (Mode Kompatibilitas). Jalankan migrasi SQL di Supabase agar field spesifik Store vs Admin aktif.'
          };
        } else {
          const inserted = await supabaseFetch<StoreFaqItem[]>('store_help_faq', 'POST', [
            { ...basePayload, created_at: new Date().toISOString() }
          ]);
          return {
            success: true,
            data: inserted?.[0],
            requiresMigration: true,
            message: 'FAQ baru berhasil ditambahkan (Mode Kompatibilitas). Jalankan migrasi SQL di Supabase agar field spesifik Store vs Admin aktif.'
          };
        }
      } catch (fallbackErr: any) {
        console.error('[storeHelpService] Error saving fallback FAQ:', fallbackErr);
        return { success: false, message: fallbackErr?.message || 'Gagal menyimpan FAQ ke database' };
      }
    }
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

export async function syncInitialFaqsToSupabase(): Promise<{
  success: boolean;
  count: number;
  message: string;
  requiresMigration?: boolean;
}> {
  try {
    const existing = await supabaseFetch<StoreFaqItem[]>('store_help_faq', 'GET', null, 'select=id,question');
    const existingMap = new Map<string, string>();
    (existing || []).forEach(f => {
      if (f.id && f.question) {
        existingMap.set(f.question.trim().toLowerCase(), f.id);
      }
    });

    let updatedCount = 0;
    let insertedCount = 0;
    let fallbackMode = false;

    for (let i = 0; i < INITIAL_STORE_FAQS.length; i++) {
      const f = INITIAL_STORE_FAQS[i];
      const qKey = f.question.trim().toLowerCase();
      const existingId = existingMap.get(qKey);

      const fullPayload = {
        category: f.category,
        question: f.question,
        answer: f.answer,
        target_audience: f.target_audience || 'all',
        answer_admin: f.answer_admin || null,
        answer_store: f.answer_store || null,
        action_steps_admin: f.action_steps_admin || [],
        action_steps_store: f.action_steps_store || [],
        button_badges_admin: f.button_badges_admin || [],
        button_badges_store: f.button_badges_store || [],
        admin_notes: f.admin_notes || null,
        store_notes: f.store_notes || null,
        keywords: f.keywords || [],
        button_badges: f.button_badges || [],
        action_steps: f.action_steps || [],
        image_url: f.image_url || null,
        view_count: f.view_count || 0,
        is_pinned: Boolean(f.is_pinned),
        updated_at: new Date().toISOString()
      };

      const basePayload = {
        category: f.category,
        question: f.question,
        answer: f.answer,
        keywords: f.keywords || [],
        button_badges: f.button_badges || [],
        action_steps: f.action_steps || [],
        image_url: f.image_url || null,
        view_count: f.view_count || 0,
        is_pinned: Boolean(f.is_pinned),
        updated_at: new Date().toISOString()
      };

      if (!fallbackMode) {
        try {
          if (existingId) {
            await supabaseFetch('store_help_faq', 'PATCH', fullPayload, `id=eq.${existingId}`);
            updatedCount++;
          } else {
            await supabaseFetch('store_help_faq', 'POST', [{ ...fullPayload, created_at: new Date().toISOString() }]);
            insertedCount++;
          }
        } catch (err: any) {
          if (isSchemaMissingColumnError(err)) {
            console.warn('[storeHelpService] Kolom per-peran belum ada di database Supabase. Beralih ke Mode Kompatibilitas...');
            fallbackMode = true;
            // Retry this current item with basePayload
            if (existingId) {
              await supabaseFetch('store_help_faq', 'PATCH', basePayload, `id=eq.${existingId}`);
              updatedCount++;
            } else {
              await supabaseFetch('store_help_faq', 'POST', [{ ...basePayload, created_at: new Date().toISOString() }]);
              insertedCount++;
            }
          } else {
            throw err;
          }
        }
      } else {
        // Fallback mode already active
        if (existingId) {
          await supabaseFetch('store_help_faq', 'PATCH', basePayload, `id=eq.${existingId}`);
          updatedCount++;
        } else {
          await supabaseFetch('store_help_faq', 'POST', [{ ...basePayload, created_at: new Date().toISOString() }]);
          insertedCount++;
        }
      }
    }

    if (fallbackMode) {
      return {
        success: true,
        count: insertedCount + updatedCount,
        requiresMigration: true,
        message: `Berhasil sinkronisasi ${insertedCount + updatedCount} FAQ (Mode Kompatibilitas). Catatan: Tabel Supabase belum memiliki 9 kolom baru. Klik 'Salin SQL Skema' lalu jalankan di Supabase SQL Editor untuk aktivasi penuh.`
      };
    }

    return {
      success: true,
      count: insertedCount + updatedCount,
      requiresMigration: false,
      message: `Berhasil sinkronisasi FAQ: ${insertedCount} baru ditambahkan, ${updatedCount} panduan diperbarui dengan perspektif Store & Admin.`
    };
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

const SYNONYM_MAP: Record<string, string[]> = {
  split: ['pisah', 'pecah', 'bagi', '2 pcs', 'dua pcs', 'campur', 'dua biji', 'beda toko', 'sebagian'],
  alter: ['alterasi', 'potong', 'panjang', 'kecilkan', 'permak', 'reparasi', 'penjahit', 'jahit', 'spk'],
  sold_out: ['kosong', 'habis', 'sold', 'reject', 'cacat', 'rusak', 'ilang', 'hilang', 'noda'],
  kirim_gudang: ['antar', 'struk', 'surat jalan struk', 'antar fisik', 'antar ke gudang', 'kurir internal'],
  resi: ['no resi', 'nomor resi', 'resi kurir', 'lacak', 'tracking', 'jne', 'jnt', 'sicepat', 'ekspedisi', 'bulk resi'],
  dealpos: ['no sj', 'tr', 'transfer', 'sj dealpos', 'surat jalan dealpos', 'pos', 'kasir'],
  batal: ['cancel', 'salah input', 'keliru', 'hapus', 'batalin', 'batalkan', 'void', 'batal pesanan', 'kembalikan']
};

export function searchFaqWithIntent(
  query: string,
  allFaqs: StoreFaqItem[],
  activePerspective: 'store' | 'admin' = 'store'
): {
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
    const aAdminLower = (faq.answer_admin || '').toLowerCase();
    const aStoreLower = (faq.answer_store || '').toLowerCase();
    const notesLower = ((faq.admin_notes || '') + ' ' + (faq.store_notes || '')).toLowerCase();
    const keywords = (faq.keywords || []).map(k => k.toLowerCase());

    // 1. Direct substring match pada question (Score tinggi)
    if (qLower.includes(cleanQuery)) {
      score += 100;
    }

    // 2. Token match pada question, jawaban umum, jawaban per-peran
    queryTokens.forEach(token => {
      if (token.length <= 1) return;
      if (qLower.includes(token)) score += 25;
      if (keywords.some(k => k.includes(token))) score += 20;

      // Bobot jawaban berdasarkan active perspective
      if (activePerspective === 'admin') {
        if (aAdminLower.includes(token)) score += 15;
        if (aLower.includes(token)) score += 5;
      } else {
        if (aStoreLower.includes(token)) score += 15;
        if (aLower.includes(token)) score += 5;
      }
      if (notesLower.includes(token)) score += 5;

      // 3. Synonym matching
      Object.entries(SYNONYM_MAP).forEach(([key, syns]) => {
        if (syns.some(s => s.includes(token) || token.includes(s))) {
          if (qLower.includes(key) || keywords.some(k => k.includes(key))) {
            score += 30;
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
