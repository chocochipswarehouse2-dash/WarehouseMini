import os
import re

def process_iglive():
    path = "src/components/PesananSaya/IGLiveTab.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Fix the hidden wrapper
    content = content.replace(
        "<div className={`${printMode ? 'hidden print:hidden' : 'space-y-4'}`}>",
        '<div className="space-y-4 print:hidden">'
    )

    # 2. Extract the picking massal block
    picking_pattern = r"(?s)(      {/\* B\. Print Picking List Massal.*?      \)}\n)"
    match = re.search(picking_pattern, content)
    if match:
        old_picking_block = match.group(1)
        
        new_picking_layout = """      {/* B. Print Picking List Massal (Shopee Tabular Style) */}
      {printMode === 'pickingMassal' && (
        <div id="print-area" className="hidden print:block bg-white w-full text-black p-4 max-w-[850px] mx-auto text-[9.5px]">
          {/* Print Header */}
          <div className="border-b-2 border-black pb-2 mb-3">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-base font-black tracking-tight uppercase">
                  SURAT JALAN & PICKING LIST IG LIVE
                </h1>
                <div className="text-[10px] text-gray-700 mt-0.5">
                  WMS Warehouse Management System • Format A4 Portrait
                </div>
              </div>
              <div className="text-right text-[10px] font-mono">
                <div><b>Tgl Cetak:</b> {new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <div><b>Picker/Admin:</b> {session?.name || 'Petugas Gudang'}</div>
              </div>
            </div>
          </div>

          {/* Summary Info */}
          <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
            <div><b>Total Pesanan:</b> {pickingItemsGrouped.targetOrders.length} Pesanan</div>
            <div><b>Total Barang:</b> {pickingItemsGrouped.targetOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0), 0)} Pcs</div>
            <div><b>Petugas Picking:</b> ____________________</div>
            <div><b>Petugas QC / Packing:</b> ____________________</div>
          </div>

          {/* Orders Table */}
          <table className="w-full border-collapse text-[9.5px]">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black p-1 text-center font-black w-[4%]">No</th>
                <th className="border border-black p-1 text-center font-black w-[15%]">No. Pesanan & Resi</th>
                <th className="border border-black p-1 text-center font-black w-[12%]">Opsi Pengiriman</th>
                <th className="border border-black p-1 text-center font-black w-[15%]">Nama Penerima & HP</th>
                <th className="border border-black p-1 text-center font-black w-[10%]">Lokasi Rak</th>
                <th className="border border-black p-1 text-left font-black w-[25%]">SKU & Nama Barang</th>
                <th className="border border-black p-1 text-center font-black w-[5%]">Qty</th>
                <th className="border border-black p-1 text-center font-black w-[4%]">Pick</th>
                <th className="border border-black p-1 text-left font-black w-[10%]">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {pickingItemsGrouped.targetOrders.map((order, orderIdx) => {
                const rowCount = order.items?.length || 1;
                
                return (order.items || []).map((item, itemIdx) => (
                  <tr key={`${order.no_pesanan}-${itemIdx}`}>
                    {/* Order-level merged columns */}
                    {itemIdx === 0 && (
                      <>
                        <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold">
                          {orderIdx + 1}
                        </td>
                        <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-mono">
                          <div className="font-black text-[10px]">{order.no_pesanan}</div>
                          {order.no_resi && <div className="text-[8.5px] text-gray-700 mt-0.5">{order.no_resi}</div>}
                        </td>
                        <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold text-[9px]">
                          {order.ekspedisi || '-'}
                          {order.layanan && (
                            <div className="text-[8px] text-gray-600 mt-0.5">
                              {order.layanan}
                            </div>
                          )}
                        </td>
                        <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                          <div className="font-bold">{order.nama_pembeli}</div>
                          {order.no_telp && <div className="font-mono text-[8.5px] text-gray-700">{order.no_telp}</div>}
                        </td>
                      </>
                    )}

                    {/* Item-level Lokasi Rak */}
                    <td className="border border-black p-1 text-center align-middle font-black text-[10px] bg-gray-50">
                      {item.lokasi || '-'}
                    </td>

                    {/* Item SKU & Nama */}
                    <td className="border border-black p-1 align-middle">
                      <div className="font-black text-[9.5px]">{item.sku}</div>
                      <div className="text-gray-800 text-[8.5px]">{item.nama_produk}</div>
                      {item.size && (
                        <div className="text-gray-600 italic text-[8px]">Var: {item.size}</div>
                      )}
                    </td>

                    {/* Qty */}
                    <td className="border border-black p-1 text-center align-middle font-black text-[11px]">
                      {item.qty}
                    </td>

                    {/* Checkbox */}
                    <td className="border border-black p-1 align-middle text-center">
                      <div className="w-3.5 h-3.5 border border-black mx-auto"></div>
                    </td>

                    {/* Catatan / Keterangan */}
                    <td className="border border-black p-1 text-[8px] align-middle">
                      {itemIdx === 0 && order.catatan ? order.catatan : ''}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
"""
        content = content.replace(old_picking_block, new_picking_layout)

        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Updated IGLiveTab.tsx")
    else:
        print("Could not find picking massal block in IGLiveTab.tsx")

process_iglive()
