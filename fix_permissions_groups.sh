cat << 'PY_EOF' > fix.py
import re

with open('src/services/permissions.ts', 'r') as f:
    content = f.read()

# I will just replace the appended PERMISSION_GROUPS with a more detailed one.
replacement = """export const PERMISSION_GROUPS = [
  {
    id: 'g_all',
    title: 'All',
    badge: '🚀',
    description: 'Semua Izin Akses',
    permissions: [
      { key: 'can_penerimaan_barang', label: 'Penerimaan Barang', description: 'Bisa akses Penerimaan Barang', isSuperadminOnly: false },
      { key: 'can_packing', label: 'Packing', description: 'Bisa akses Packing', isSuperadminOnly: false },
      { key: 'can_pengiriman', label: 'Pengiriman', description: 'Bisa akses Pengiriman', isSuperadminOnly: false },
      { key: 'can_agenda', label: 'Agenda', description: 'Bisa akses Agenda', isSuperadminOnly: false },
      { key: 'can_penerimaan', label: 'Penerimaan Produksi', description: 'Bisa akses Penerimaan Produksi', isSuperadminOnly: false },
      { key: 'can_peminjaman', label: 'Peminjaman', description: 'Bisa akses Peminjaman', isSuperadminOnly: false },
      { key: 'can_scan', label: 'Scanner', description: 'Bisa akses Scanner', isSuperadminOnly: false },
      { key: 'can_view_inventory', label: 'Inventory', description: 'Bisa akses Inventory', isSuperadminOnly: false },
      { key: 'can_view_mutasi', label: 'Mutasi Log', description: 'Bisa akses Mutasi Log', isSuperadminOnly: false },
      { key: 'can_approve_so', label: 'Approve SO', description: 'Bisa akses Approve SO', isSuperadminOnly: false },
      { key: 'can_picking', label: 'Picking Tasks', description: 'Bisa akses Picking', isSuperadminOnly: false },
      { key: 'can_perbaikan', label: 'Perbaikan', description: 'Bisa akses Perbaikan', isSuperadminOnly: false },
      { key: 'can_view_karyawan', label: 'View Karyawan', description: 'Bisa akses Karyawan', isSuperadminOnly: false },
      { key: 'can_view_presensi', label: 'View Presensi', description: 'Bisa akses Presensi', isSuperadminOnly: false },
      { key: 'can_view_roster', label: 'View Roster', description: 'Bisa akses Roster', isSuperadminOnly: false },
      { key: 'can_view_lembur_cuti', label: 'View Lembur/Cuti', description: 'Bisa akses Lembur', isSuperadminOnly: false },
      { key: 'can_approve_hr', label: 'Approve HR', description: 'Bisa akses Approve HR', isSuperadminOnly: false },
      { key: 'can_view_dashboard', label: 'View Dashboard', description: 'Bisa akses Dashboard', isSuperadminOnly: false },
      { key: 'can_cetak_label', label: 'Cetak Label', description: 'Bisa Cetak Label', isSuperadminOnly: false },
      { key: 'can_manual_shipment_view', label: 'Manual Shipment View', description: 'Bisa lihat Manual Shipment', isSuperadminOnly: false },
      { key: 'can_manual_shipment_action', label: 'Manual Shipment Action', description: 'Bisa aksi Manual Shipment', isSuperadminOnly: false },
      { key: 'can_tarikan_md', label: 'Tarikan MD', description: 'Bisa akses Tarikan MD', isSuperadminOnly: false },
      { key: 'can_view_roadmap', label: 'View Roadmap', description: 'Bisa akses Roadmap', isSuperadminOnly: false },
      { key: 'can_manage_settings', label: 'Manage Settings', description: 'Bisa Manage Settings', isSuperadminOnly: true }
    ]
  }
];"""

content = re.sub(r'export const PERMISSION_GROUPS = \[.*?\];', replacement, content, flags=re.DOTALL)

with open('src/services/permissions.ts', 'w') as f:
    f.write(content)
PY_EOF
python3 fix.py
