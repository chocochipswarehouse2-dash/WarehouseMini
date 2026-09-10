import { ManualShipmentOrder } from '../types';

export const DEFAULT_MANUAL_SHIPMENT_GAS_URL = 'https://script.google.com/macros/s/1ja4dOeLJb98Q2Jk6uvOFqT2xTFHX9d63uyO3ohp8zgku3dj97E7FpC-b/exec';

const getGasUrl = () => {
  return localStorage.getItem('wms_manual_shipment_gas_url') || DEFAULT_MANUAL_SHIPMENT_GAS_URL;
};

// Due to CORS restrictions with Google Apps Script Web Apps in some environments,
// requests are usually made with `no-cors` mode. However, `no-cors` prevents reading the response.
// The best approach for simple forms is `no-cors` for writes (blind fire), and `cors` for reads if the script allows it.

export async function fetchOutlets(): Promise<{ nama: string; fulfillment: string }[]> {
  try {
    const url = `${getGasUrl()}?action=getOutlets`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch outlets');
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching outlets:', error);
    return [];
  }
}

export async function fetchManualShipments(): Promise<ManualShipmentOrder[]> {
  try {
    const url = `${getGasUrl()}?action=getOrders`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch orders');
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching manual shipments:', error);
    return [];
  }
}

export async function submitManualShipment(orderData: ManualShipmentOrder): Promise<boolean> {
  try {
    const payload = {
      action: 'submitShipment',
      data: orderData
    };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true; // Assume success for no-cors
  } catch (error) {
    console.error('Error submitting shipment:', error);
    return false;
  }
}

export async function updateShipmentResi(no_pesanan: string, no_resi: string): Promise<boolean> {
  try {
    const payload = {
      action: 'updateResi',
      data: { no_pesanan, no_resi }
    };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error updating resi:', error);
    return false;
  }
}

export async function updateShipmentStatus(no_pesanan: string, status: 'diterima' | 'diproses' | 'dikirim' | 'batal'): Promise<boolean> {
  try {
    const payload = {
      action: 'updateStatus',
      data: { no_pesanan, status }
    };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error updating status:', error);
    return false;
  }
}

export async function deleteManualShipment(no_pesanan: string): Promise<boolean> {
  try {
    const payload = {
      action: 'deleteShipment',
      data: { no_pesanan }
    };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error deleting shipment:', error);
    return false;
  }
}

export async function editManualShipment(orderData: ManualShipmentOrder): Promise<boolean> {
  try {
    const payload = {
      action: 'editShipment',
      data: orderData
    };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error editing shipment:', error);
    return false;
  }
}
