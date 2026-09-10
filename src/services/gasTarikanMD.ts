import { TarikanMDRecord } from '../types';

const getGasUrl = (): string => {
  return localStorage.getItem('wms_manual_shipment_gas_url') || '';
};

export async function fetchTarikanMDRecords(): Promise<TarikanMDRecord[]> {
  try {
    const url = `${getGasUrl()}?action=getTarikanMD`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch TarikanMD records');
    const data = await res.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Error fetching TarikanMD records:', error);
    return [];
  }
}

export async function submitTarikanMD(record: TarikanMDRecord): Promise<boolean> {
  try {
    const payload = { action: 'submitTarikanMD', data: record };
    await fetch(getGasUrl(), {
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

export async function editTarikanMD(record: TarikanMDRecord): Promise<boolean> {
  try {
    const payload = { action: 'editTarikanMD', data: record };
    await fetch(getGasUrl(), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return true;
  } catch (error) {
    console.error('Error editing TarikanMD:', error);
    return false;
  }
}

export async function deleteTarikanMD(no_sj: string): Promise<boolean> {
  try {
    const payload = { action: 'deleteTarikanMD', data: { no_sj } };
    await fetch(getGasUrl(), {
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
