import { formatOperatorWithPersonName } from './userResolver';
import { getPlacementSummaryLabel } from '../services/putawayService';
import type { PutawayTask, PutawayTaskItem } from '../types';

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printHtmlViaIframe(htmlContent: string): void {
  if (typeof document === 'undefined') return;
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2500);
    }, 250);
  }
}

interface GroupedPutawayRoute {
  targetLokasi: string;
  items: PutawayTaskItem[];
  totalTarget: number;
  totalPlaced: number;
}

function groupItemsByDestination(task: PutawayTask): GroupedPutawayRoute[] {
  const map = new Map<string, GroupedPutawayRoute>();
  for (const item of task.items || []) {
    const dest =
      (item.recommended_lokasi || '').trim().toUpperCase() || 'PILIH MANUAL';
    let grp = map.get(dest);
    if (!grp) {
      grp = { targetLokasi: dest, items: [], totalTarget: 0, totalPlaced: 0 };
      map.set(dest, grp);
    }
    grp.items.push(item);
    grp.totalTarget += Number(item.qty_target) || 0;
    grp.totalPlaced += Number(item.qty_placed) || 0;
  }
  return Array.from(map.values());
}

export function printPutawayRouteA4(task: PutawayTask): void {
  const groups = groupItemsByDestination(task);
  const totalTarget = (task.items || []).reduce((s, it) => s + (Number(it.qty_target) || 0), 0);
  const totalPlaced = (task.items || []).reduce((s, it) => s + (Number(it.qty_placed) || 0), 0);
  const opsLabel =
    (task.active_operators || []).length > 0
      ? task.active_operators.map((o) => formatOperatorWithPersonName(o)).join(', ')
      : formatOperatorWithPersonName(task.created_by);
  const dateStr = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  let seq = 1;
  const rowsHtml = groups
    .map((grp, gIdx) => {
      const headerRow = `<tr style="background:#f1f5f9;">
        <td colspan="9" style="padding:6px 8px;font-weight:800;border:1px solid #cbd5e1;font-size:11px;">
          STOP #${gIdx + 1}: RAK TUJUAN [${escapeHtml(grp.targetLokasi)}] &mdash; ${grp.items.length} SKU (${grp.totalTarget} pcs)
        </td>
      </tr>`;
      const itemRows = grp.items
        .map((it) => {
          const actualLocStr = getPlacementSummaryLabel(it.placements) || '-';
          return `<tr>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;">${seq++}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;font-weight:900;">${escapeHtml(it.recommended_lokasi || 'MANUAL')}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;font-weight:700;">${escapeHtml(it.source_lokasi)}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;font-family:monospace;font-weight:700;">${escapeHtml(it.sku)}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;font-weight:600;">${escapeHtml(it.nama_produk)} <span style="font-family:monospace;font-weight:800;">(${escapeHtml(it.size || '-')})</span></td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;font-weight:800;">${it.qty_target}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:right;font-family:monospace;font-weight:800;">${it.qty_placed}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;font-family:monospace;font-size:10px;">${escapeHtml(actualLocStr)}</td>
            <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;font-family:monospace;">[ &nbsp; ]</td>
          </tr>`;
        })
        .join('');
      return headerRow + itemRows;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(task.invoice_putaway)} - Daftar Rute Tugas Putaway</title>
  <style>
    @page { size: A4 portrait; margin: 11mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
    .title { font-size: 16px; font-weight: 900; margin: 0 0 3px 0; }
    .sub { font-size: 11px; color: #475569; }
    .meta { text-align: right; line-height: 1.5; font-size: 10.5px; }
    .strip { display: flex; gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 10px; border-radius: 6px; margin-bottom: 10px; }
    .strip-item { flex: 1; }
    .strip-label { font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .strip-val { font-size: 12.5px; font-weight: 900; font-family: monospace; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th { background: #0f172a; color: #fff; padding: 7px 6px; font-size: 10px; text-transform: uppercase; border: 1px solid #0f172a; }
    .sigs { display: flex; justify-content: space-between; margin-top: 26px; page-break-inside: avoid; }
    .sig { width: 30%; text-align: center; }
    .sig-line { margin-top: 46px; border-top: 1px solid #334155; padding-top: 4px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">DAFTAR RUTE TUGAS PUTAWAY GUDANG</div>
      <div class="sub">Sumber: <strong>${escapeHtml((task.source_locations || []).join(', '))}</strong> (${escapeHtml(task.source_area)}) &bull; Plafon Aman: <strong>${task.safe_cap_percent}%</strong></div>
    </div>
    <div class="meta">
      <div><strong>Invoice Putaway:</strong> <span style="font-family:monospace;">${escapeHtml(task.invoice_putaway)}</span></div>
      <div><strong>Operator:</strong> ${escapeHtml(opsLabel)}</div>
      <div><strong>Dicetak:</strong> ${escapeHtml(dateStr)}</div>
    </div>
  </div>
  <div class="strip">
    <div class="strip-item"><div class="strip-label">Total SKU</div><div class="strip-val">${task.items.length} SKU</div></div>
    <div class="strip-item"><div class="strip-label">Target Putaway</div><div class="strip-val">${totalTarget} Pcs</div></div>
    <div class="strip-item"><div class="strip-label">Sudah Ditaruh</div><div class="strip-val">${totalPlaced} Pcs</div></div>
    <div class="strip-item"><div class="strip-label">Status Tugas</div><div class="strip-val">${escapeHtml(task.status)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28px;">No</th>
        <th style="width:66px;">Rak Tujuan</th>
        <th style="width:60px;">Dari</th>
        <th style="width:108px;">SKU</th>
        <th>Nama Produk &amp; Size</th>
        <th style="width:48px;">Target</th>
        <th style="width:52px;">Ditaruh</th>
        <th style="width:105px;">Rak Aktual</th>
        <th style="width:42px;">Cek</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="sigs">
    <div class="sig"><div>Dibuat / Diambil Oleh</div><div class="sig-line">${escapeHtml(formatOperatorWithPersonName(task.created_by))}</div></div>
    <div class="sig"><div>Dikerjakan Oleh (Tim)</div><div class="sig-line">${escapeHtml(opsLabel)}</div></div>
    <div class="sig"><div>Verifikasi Gudang</div><div class="sig-line">( .............................. )</div></div>
  </div>
</body>
</html>`;

  printHtmlViaIframe(html);
}

export function printPutawayRouteThermal(
  task: PutawayTask,
  paperWidth: '58mm' | '80mm' = '80mm'
): void {
  const groups = groupItemsByDestination(task);
  const totalTarget = (task.items || []).reduce((s, it) => s + (Number(it.qty_target) || 0), 0);
  const totalPlaced = (task.items || []).reduce((s, it) => s + (Number(it.qty_placed) || 0), 0);
  const opsLabel =
    (task.active_operators || []).length > 0
      ? task.active_operators.map((o) => formatOperatorWithPersonName(o)).join(', ')
      : formatOperatorWithPersonName(task.created_by);

  const bodyHtml = groups
    .map(
      (grp) => `
      <div style="border-top:1px dashed #000;padding-top:4px;margin-top:5px;">
        <div style="font-weight:900;font-size:12px;font-family:monospace;">&rarr; RAK ${escapeHtml(grp.targetLokasi)} (${grp.totalTarget} pcs)</div>
        ${grp.items
          .map(
            (it) => `
          <div style="margin:3px 0;padding-left:4px;border-left:2px solid #000;">
            <div style="font-weight:700;font-size:10.5px;">${escapeHtml(it.nama_produk)} (${escapeHtml(it.size)})</div>
            <div style="font-family:monospace;font-size:10px;display:flex;justify-content:space-between;">
              <span>${escapeHtml(it.sku)} [${escapeHtml(it.source_lokasi)}]</span>
              <span><strong>${it.qty_placed}/${it.qty_target}</strong> pcs</span>
            </div>
          </div>`
          )
          .join('')}
      </div>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(task.invoice_putaway)}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 3mm; }
    body { font-family: monospace, Arial, sans-serif; width: calc(${paperWidth} - 6mm); margin: 0; color: #000; font-size: 10.5px; }
  </style>
</head>
<body>
  <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:4px;">
    <div style="font-weight:900;font-size:12px;">TUGAS PUTAWAY GUDANG</div>
    <div style="font-weight:700;font-size:10.5px;">${escapeHtml(task.invoice_putaway)}</div>
    <div style="font-size:9.5px;">Asal: ${escapeHtml((task.source_locations || []).join(', '))} | Plafon ${task.safe_cap_percent}%</div>
  </div>
  <div style="font-size:10px;margin:4px 0;">
    <div>Operator: ${escapeHtml(opsLabel)}</div>
    <div>Progress: <strong>${totalPlaced}/${totalTarget} pcs</strong> (${task.items.length} baris)</div>
  </div>
  ${bodyHtml}
  <div style="border-top:1px dashed #000;margin-top:8px;padding-top:4px;text-align:center;font-size:9.5px;">
    Scan #LOK Tujuan &rarr; Scan SKU &rarr; Submit
  </div>
</body>
</html>`;

  printHtmlViaIframe(html);
}

export function formatPutawayWhatsAppMessage(task: PutawayTask): string {
  const groups = groupItemsByDestination(task);
  const totalTarget = (task.items || []).reduce((s, it) => s + (Number(it.qty_target) || 0), 0);
  const totalPlaced = (task.items || []).reduce((s, it) => s + (Number(it.qty_placed) || 0), 0);
  const opsLabel =
    (task.active_operators || []).length > 0
      ? task.active_operators.map((o) => formatOperatorWithPersonName(o)).join(', ')
      : formatOperatorWithPersonName(task.created_by);

  const lines: string[] = [
    `*📦 TUGAS PUTAWAY GUDANG*`,
    `• *Invoice:* \`${task.invoice_putaway}\``,
    `• *Sumber:* ${(task.source_locations || []).join(', ')} (${task.source_area})`,
    `• *Operator:* ${opsLabel}`,
    `• *Plafon Aman:* ${task.safe_cap_percent}%`,
    `• *Progres:* ${totalPlaced}/${totalTarget} pcs (${task.items.length} baris)`,
    ``,
    `*RUTE PENEMPATAN:*`,
  ];

  groups.forEach((grp, idx) => {
    lines.push(`\n*${idx + 1}. 📍 Tujuan: ${grp.targetLokasi}* (${grp.totalTarget} pcs)`);
    grp.items.forEach((it) => {
      const actual = getPlacementSummaryLabel(it.placements);
      const actualNote = actual ? ` → Aktual: ${actual}` : '';
      lines.push(
        `  ├ \`${it.sku}\` · ${it.nama_produk} (${it.size}) — *${it.qty_placed}/${it.qty_target} pcs* [Dari ${it.source_lokasi}]${actualNote}`
      );
    });
  });

  if (task.catatan) {
    lines.push(`\n*Catatan:* ${task.catatan}`);
  }

  return lines.join('\n');
}
