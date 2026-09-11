import { TarikanMDRecord } from '../types';
import { getStoredManualShipmentGasUrl } from './settings';

const getGasUrl = (): string => {
  return getStoredManualShipmentGasUrl();
};

export async function fetchTarikanMDRecords(): Promise<TarikanMDRecord[]> {
  const gasUrl = getGasUrl();
  let cached: TarikanMDRecord[] = [];
  try {
    const raw = localStorage.getItem('wms_cached_tarikan_md');
    if (raw) cached = JSON.parse(raw);
  } catch {}

  if (!gasUrl) return cached;
  try {
    const url = `${gasUrl}?action=getTarikanMD`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    if (data && data.success && Array.isArray(data.data)) {
      try {
        localStorage.setItem('wms_cached_tarikan_md', JSON.stringify(data.data));
      } catch {}
      return data.data;
    }
  } catch (error) {
    console.warn('Could not fetch TarikanMD records from GAS, using local cache:', error);
  }
  return cached;
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
