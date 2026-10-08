import os
import re

def process_manual_shipment():
    path = "src/components/PesananSaya/ManualShipmentTab.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Add <> and print:hidden to main wrapper
    content = content.replace(
        '  return (\n    <div className="max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 animate-in fade-in duration-300">',
        '  return (\n    <>\n    <div className="max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 animate-in fade-in duration-300 print:hidden">'
    )

    # 2. Close </div> for max-w-7xl before the modals
    modal_comment = "      {/* Modal Update Resi Massal */}"
    if modal_comment in content:
        content = content.replace(
            modal_comment,
            "    </div>\n\n" + modal_comment
        )
    
    # 3. Add closing </> at the very end (replace only the last occurrence)
    if "    </div>\n  );\n};\n" in content:
        content = "    </>\n  );\n};\n".join(content.rsplit("    </div>\n  );\n};\n", 1))
    elif "    </div>\n  );\n};" in content:
        content = "    </>\n  );\n};".join(content.rsplit("    </div>\n  );\n};", 1))

    # 4. Extract the entire printPayload block
    print_pattern = r"(?s)(      {/\* CSS @media print terisolasi.*?      \)}\n        </div>\n      \)}\n)"
    match = re.search(print_pattern, content)
    if match:
        print_block = match.group(1)
        content = content.replace(print_block, "")
        
        # 5. Rewrite the picking list layout inside the print_block
        picking_start = print_block.find("          ) : (\n            // Massal Multi-Order Picking List Mode")
        if picking_start != -1:
            picking_end = print_block.find("            })()\n          )}", picking_start)
            
            new_picking_layout = """          ) : (
            // Massal Multi-Order Picking List Mode (Shopee Tabular Style)
            (() => {
              const todayStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              const totalOrders = printPayload.orders.length;
              const totalAllQty = printPayload.orders.reduce((acc, o) => acc + (o.items || []).reduce((q, it) => q + (Number(it.qty) || 0), 0), 0);
              const operatorName = session?.name || getUserPersonName(session?.username) || 'Petugas Gudang';

              return (
                <div className="bg-white w-full text-black p-2 max-w-[850px] mx-auto text-[9.5px]">
                  {/* Print Header */}
                  <div className="border-b-2 border-black pb-2 mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-base font-black tracking-tight uppercase">
                          SURAT JALAN & PICKING LIST MANUAL SHIPMENT
                        </h1>
                        <div className="text-[10px] text-gray-700 mt-0.5">
                          WMS Warehouse Management System • Format A4 Portrait
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-mono">
                        <div><b>Tgl Cetak:</b> {todayStr}</div>
                        <div><b>Filter:</b> Manual Shipment</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Info */}
                  <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
                    <div><b>Total Pesanan:</b> {totalOrders} Pesanan</div>
                    <div><b>Total Barang:</b> {totalAllQty} Pcs</div>
                    <div><b>Petugas Picking:</b> {operatorName}</div>
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
                      {printPayload.orders.map((order, orderIdx) => {
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
                                  {order.jasa_kirim || '-'}
                                  {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                                    <div className="text-[8px] text-gray-600 mt-0.5">
                                      DealPOS: {order.no_transaksi_pengirim.join(', ')}
                                    </div>
                                  )}
                                </td>
                                <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                                  <div className="font-bold">{order.nama_tujuan}</div>
                                  {order.no_telp_tujuan && <div className="font-mono text-[8.5px] text-gray-700">{order.no_telp_tujuan}</div>}
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
                              {(item.needs_alteration || !!item.id_form_alter) && (
                                <div className="text-rose-600 font-bold text-[8px] mt-0.5">Wajib Alterasi!</div>
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
                              {itemIdx === 0 && order.notes_paket ? order.notes_paket : ''}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              );
"""
            print_block = print_block[:picking_start] + new_picking_layout + print_block[picking_end:]
            
        # Also remove the <style> tag since we're using tailwind print:hidden directly
        style_pattern = r"      {/\* CSS @media print terisolasi.*?      \)}\n"
        print_block = re.sub(style_pattern, "", print_block, flags=re.DOTALL)
        
        # Change `className="bg-white...` to `className="hidden print:block bg-white...` in print_block
        print_block = print_block.replace(
            '<div id="manual-shipment-print-area" className="bg-white text-black p-0 m-0">',
            '<div id="manual-shipment-print-area" className="hidden print:block bg-white text-black p-0 m-0">'
        )
        
        # Now insert the print_block BEFORE the closing </> which is right before `  );\n};\n`
        # Or just append it right after the closing </div> of max-w-7xl
        # The closing </div> of max-w-7xl is before modal_comment.
        content = content.replace(
            "    </div>\n\n" + modal_comment,
            "    </div>\n\n" + print_block + "\n\n" + modal_comment
        )
        
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print("Updated ManualShipmentTab.tsx")

process_manual_shipment()
