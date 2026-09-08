import { supabaseFetch } from './supabase';
import { WmsSettings } from '../types';

export async function fetchWmsSettings(): Promise<WmsSettings | null> {
  try {
    const data = await supabaseFetch<WmsSettings[]>('wms_settings', 'GET', undefined, 'limit=1');
    if (data && data.length > 0) {
      return data[0];
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch WMS settings:', error);
    return null;
  }
}

export async function saveWmsSettings(settings: Partial<WmsSettings>): Promise<boolean> {
  try {
    const payload = {
      ...settings,
      updated_at: new Date().toISOString()
    };
    
    // Check if settings exist
    const existing = await fetchWmsSettings();
    if (existing && existing.id) {
      // Update
      await supabaseFetch('wms_settings', 'PATCH', payload, `id=eq.${existing.id}`);
    } else {
      // Insert
      // Use id=1 as convention for singleton config table
      await supabaseFetch('wms_settings', 'POST', { ...payload, id: 1 });
    }
    return true;
  } catch (error) {
    console.error('Failed to save WMS settings:', error);
    return false;
  }
}
