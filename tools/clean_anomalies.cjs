/**
 * DEPRECATED & DISABLED
 * 
 * Script ini telah dinonaktifkan permanen karena melanggar aturan WMS (GEMINI.md Rule 5):
 * "HARD CONSTRAINT (NO AUTO-ADJUSTMENT): Agents and systems are STRICTLY FORBIDDEN from automatically
 * generating shadow #IN or #OUT mutations to artificially balance stock. All physical stock mutations
 * MUST originate from explicit physical operator scans."
 * 
 * Jika terjadi ketidakcocokan area (misal R024 ber-area Warehouse), solusi yang benar adalah:
 * UPDATE log_produk SET area = 'Kolian' WHERE lokasi ILIKE 'R%', BUKAN menyuntikkan ADJ_OUT/ADJ_IN!
 */

console.log('Script clean_anomalies.cjs telah dinonaktifkan secara permanen sesuai Rule 5 WMS Blueprint.');
process.exit(0);
