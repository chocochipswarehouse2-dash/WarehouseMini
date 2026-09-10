import { TarikanMDRecord } from '../types';

const getGasUrl = (): string => {
  return localStorage.getItem('wms_manual_shipment_gas_url') || '';
};

export async function fetchTarikanMDRecords(): Promise<TarikanMDRecord[]> {
  const gasUrl = getGasUrl();
  if (!gasUrl) return [];
  try {
    const url = `${gasUrl}?action=getTarikanMD`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch TarikanMD records');
    const text = await res.text();
    const data = JSON.parse(text);
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching TarikanMD records:', error);
    return [];
  }
}

export async function submitTarikanMD(record: TarikanMDRecord): Promise<boolean> {
  const gasUrl = getGasUrl();
  if (!gasUrl) return false;
  try {
    const payload = { action: 'submitTarikanMD', data: record };
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error('Error submitting TarikanMD:', error);
    return false;
  }
}

export async function deleteTarikanMD(id: string): Promise<boolean> {
  const gasUrl = getGasUrl();
  if (!gasUrl) return false;
  try {
    const payload = { action: 'deleteTarikanMD', data: { id } };
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error('Error deleting TarikanMD:', error);
    return false;
  }
}
