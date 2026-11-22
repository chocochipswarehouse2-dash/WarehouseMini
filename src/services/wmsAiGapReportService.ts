/**
 * =============================================================================
 * WMS AI CAPABILITY GAP REPORT SERVICE — Self-Reporting Dev Backlog
 * =============================================================================
 * Menyimpan laporan tugas/permintaan pengguna yang belum dapat dieksekusi oleh
 * Asisten AI WMS ke Supabase (`wms_system_docs`, doc_key = 'wms_ai_capability_gaps_index')
 * agar dapat ditarik otomatis oleh agen coding saat pull update (`tools/pull_ai_dev_reports.cjs`)
 * ke `docs/memory/AI_CAPABILITY_GAPS.md`.
 *
 * Hemat egress:
 * - 1 dokumen JSON tunggal di `wms_system_docs` (maksimal 100 item terbaru)
 * - SWR cache 60 detik di memori + mirror localStorage
 * - Deduplikasi otomatis berdasarkan judul + area modul (menambah counter `occurrences`)
 */

import { supabaseFetch } from './supabase';

export const SYSTEM_DOC_AI_GAPS_ID = 'wms_ai_capability_gaps_index';
const LOCAL_STORAGE_KEY = 'wms_ai_capability_gaps_cache_v1';
const MAX_STORED_GAPS = 100;
const CACHE_TTL_MS = 60_000;

export type AiGapPriority = 'high' | 'medium' | 'low';
export type AiGapStatus = 'open' | 'in_progress' | 'done';

export interface AiCapabilityGapReport {
  id: string;
  title: string;
  userPrompt: string;
  moduleArea: string;
  reasonCannotExecute: string;
  proposedToolOrFeature: string;
  expectedBehavior: string;
  priority: AiGapPriority;
  reportedBy: string;
  reportedRole: string;
  createdAt: string;
  updatedAt: string;
  status: AiGapStatus;
  resolutionNote?: string;
  occurrences: number;
}

export interface CreateAiCapabilityGapInput {
  title: string;
  userPrompt: string;
  moduleArea: string;
  reasonCannotExecute: string;
  proposedToolOrFeature: string;
  expectedBehavior: string;
  priority?: AiGapPriority;
  reportedBy?: string;
  reportedRole?: string;
}

let memoryCache: { data: AiCapabilityGapReport[]; fetchedAt: number } | null = null;

function readLocalMirror(): AiCapabilityGapReport[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalMirror(gaps: AiCapabilityGapReport[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(gaps));
  } catch {
    // ignore quota error
  }
}

function normalizeGapSignature(title: string, moduleArea: string): string {
  const norm = (s: string) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 64);
  return `${norm(moduleArea)}::${norm(title)}`;
}

function generateGapId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `GAP-${ymd}-${rand}`;
}

async function persistGapsToSupabase(gaps: AiCapabilityGapReport[]): Promise<boolean> {
  const trimmed = gaps.slice(0, MAX_STORED_GAPS);
  memoryCache = { data: trimmed, fetchedAt: Date.now() };
  writeLocalMirror(trimmed);

  try {
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: SYSTEM_DOC_AI_GAPS_ID,
          doc_key: SYSTEM_DOC_AI_GAPS_ID,
          title: 'AI Self-Reporting Capability Gap Backlog (Dev Queue)',
          content: JSON.stringify(trimmed),
          updated_at: new Date().toISOString()
        }
      ],
      'on_conflict=doc_key',
      true
    );
    return true;
  } catch (err) {
    console.warn('[WMS AI Gap] Gagal menyimpan backlog gap ke Supabase (tersimpan lokal):', err);
    return false;
  }
}

/**
 * Mengambil daftar laporan AI Capability Gap dari Supabase (dengan SWR cache 60 detik)
 */
export async function fetchAiCapabilityGaps(forceRefresh = false): Promise<AiCapabilityGapReport[]> {
  if (!forceRefresh && memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  try {
    const rows = await supabaseFetch<any[]>(
      'wms_system_docs',
      'GET',
      null,
      `doc_key=eq.${SYSTEM_DOC_AI_GAPS_ID}&select=content,updated_at&limit=1`
    );

    if (rows && rows[0] && rows[0].content) {
      const parsed = JSON.parse(rows[0].content);
      if (Array.isArray(parsed)) {
        memoryCache = { data: parsed, fetchedAt: Date.now() };
        writeLocalMirror(parsed);
        return parsed;
      }
    }
    memoryCache = { data: [], fetchedAt: Date.now() };
    return [];
  } catch (err) {
    console.warn('[WMS AI Gap] Gagal memuat backlog gap dari Supabase, memakai cache lokal:', err);
    const local = readLocalMirror();
    memoryCache = { data: local, fetchedAt: Date.now() };
    return local;
  }
}

/**
 * Mencatat laporan gap kapabilitas AI baru (atau menggabungkan jika duplikat status open)
 */
export async function logAiCapabilityGap(
  input: CreateAiCapabilityGapInput
): Promise<{ report: AiCapabilityGapReport; isDuplicate: boolean; syncedToCloud: boolean }> {
  const existing = await fetchAiCapabilityGaps(true);
  const nowIso = new Date().toISOString();
  const priority: AiGapPriority =
    input.priority === 'high' || input.priority === 'low' ? input.priority : 'medium';

  const incomingSig = normalizeGapSignature(input.title, input.moduleArea);
  const duplicateIdx = existing.findIndex(
    (g) => g.status !== 'done' && normalizeGapSignature(g.title, g.moduleArea) === incomingSig
  );

  if (duplicateIdx >= 0) {
    const prev = existing[duplicateIdx];
    const updatedItem: AiCapabilityGapReport = {
      ...prev,
      occurrences: (prev.occurrences || 1) + 1,
      updatedAt: nowIso,
      priority: prev.priority === 'high' || priority === 'high' ? 'high' : prev.priority,
      userPrompt: input.userPrompt ? input.userPrompt.slice(0, 400) : prev.userPrompt
    };
    const nextList = [updatedItem, ...existing.filter((_, i) => i !== duplicateIdx)];
    const syncedToCloud = await persistGapsToSupabase(nextList);
    return { report: updatedItem, isDuplicate: true, syncedToCloud };
  }

  const newReport: AiCapabilityGapReport = {
    id: generateGapId(),
    title: String(input.title || 'Permintaan Fitur AI Baru').trim().slice(0, 140),
    userPrompt: String(input.userPrompt || '').trim().slice(0, 400),
    moduleArea: String(input.moduleArea || 'Umum / Lintas Modul').trim().slice(0, 80),
    reasonCannotExecute: String(input.reasonCannotExecute || '').trim().slice(0, 400),
    proposedToolOrFeature: String(input.proposedToolOrFeature || '').trim().slice(0, 400),
    expectedBehavior: String(input.expectedBehavior || '').trim().slice(0, 400),
    priority,
    reportedBy: String(input.reportedBy || 'pengguna').trim().slice(0, 60),
    reportedRole: String(input.reportedRole || 'warehouse_ops').trim().slice(0, 40),
    createdAt: nowIso,
    updatedAt: nowIso,
    status: 'open',
    occurrences: 1
  };

  const nextList = [newReport, ...existing].slice(0, MAX_STORED_GAPS);
  const syncedToCloud = await persistGapsToSupabase(nextList);
  return { report: newReport, isDuplicate: false, syncedToCloud };
}

/**
 * Memperbarui status item backlog gap (open / in_progress / done)
 */
export async function updateAiCapabilityGapStatus(
  id: string,
  status: AiGapStatus,
  resolutionNote?: string
): Promise<AiCapabilityGapReport[]> {
  const existing = await fetchAiCapabilityGaps(true);
  const nowIso = new Date().toISOString();
  const nextList = existing.map((item) =>
    item.id === id
      ? {
          ...item,
          status,
          resolutionNote: resolutionNote !== undefined ? resolutionNote : item.resolutionNote,
          updatedAt: nowIso
        }
      : item
  );
  await persistGapsToSupabase(nextList);
  return nextList;
}

/**
 * Menghapus item backlog gap tertentu
 */
export async function deleteAiCapabilityGap(id: string): Promise<AiCapabilityGapReport[]> {
  const existing = await fetchAiCapabilityGaps(true);
  const nextList = existing.filter((item) => item.id !== id);
  await persistGapsToSupabase(nextList);
  return nextList;
}

/**
 * Memformat satu atau beberapa laporan AI Capability Gap menjadi dokumen Markdown siap baca agen dev
 */
export function formatAiCapabilityGapsMarkdown(gaps: AiCapabilityGapReport[], singleTitle?: string): string {
  const openItems = gaps.filter((g) => g.status !== 'done');
  const doneItems = gaps.filter((g) => g.status === 'done');
  const generatedAt = new Date().toISOString();

  const lines: string[] = [
    `# ${singleTitle || 'WMS AI Capability Gaps — Dev Agent Backlog'}`,
    '',
    `> Dihasilkan otomatis oleh Sistem Self-Reporting Asisten AI WMS pada \`${generatedAt}\`.`,
    `> Total: **${gaps.length}** laporan (**${openItems.length}** Open/In Progress, **${doneItems.length}** Selesai).`,
    ''
  ];

  const renderSection = (heading: string, list: AiCapabilityGapReport[]) => {
    lines.push(`## ${heading}`);
    lines.push('');
    if (list.length === 0) {
      lines.push('_Tidak ada item pada kategori ini._');
      lines.push('');
      return;
    }

    list.forEach((g) => {
      const prioLabel = g.priority === 'high' ? 'HIGH' : g.priority === 'low' ? 'LOW' : 'MEDIUM';
      lines.push(`### [${g.id}] ${g.title}`);
      lines.push(`- **Status**: \`${g.status}\` | **Prioritas**: \`${prioLabel}\` | **Modul**: ${g.moduleArea} | **Frekuensi**: ${g.occurrences || 1}x`);
      lines.push(`- **Pelapor**: \`${g.reportedBy}\` (${g.reportedRole}) | **Dibuat**: ${g.createdAt}`);
      lines.push(`- **Permintaan Pengguna**: "${g.userPrompt}"`);
      lines.push(`- **Alasan Belum Bisa Dieksekusi AI**: ${g.reasonCannotExecute}`);
      lines.push(`- **Usulan Tool / Fitur untuk Agen Dev**: ${g.proposedToolOrFeature}`);
      lines.push(`- **Perilaku yang Diharapkan**: ${g.expectedBehavior}`);
      if (g.resolutionNote) {
        lines.push(`- **Catatan Resolusi**: ${g.resolutionNote}`);
      }
      lines.push('');
    });
  };

  renderSection('Open / In Progress', openItems);
  if (doneItems.length > 0) {
    renderSection('Resolved / Selesai', doneItems);
  }

  return lines.join('\n');
}
