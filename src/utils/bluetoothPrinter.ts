/**
 * Bluetooth & Thermal Printer Helper for Mobile (Android/iOS) & Desktop
 * Supports:
 * 1. Web Bluetooth API (Direct ESC/POS & TSPL GATT printing)
 * 2. RawBT Print App Integration (Android direct intent)
 * 3. ESC/POS Raster Bitmap Generator for crisp thermal output
 */

// Common Bluetooth Printer Service & Characteristic UUIDs
const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip / ISSC Transparent
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
];

export interface BluetoothDeviceInfo {
  name: string;
  id: string;
  connected: boolean;
}

let activeBluetoothDevice: any = null;
let activeCharacteristic: any = null;

export const isWebBluetoothSupported = (): boolean => {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
};

/**
 * Scan and connect to a Bluetooth thermal printer
 */
export async function connectBluetoothPrinter(): Promise<BluetoothDeviceInfo> {
  if (!isWebBluetoothSupported()) {
    throw new Error('Web Bluetooth tidak didukung pada browser ini. Gunakan Google Chrome pada Android / PC, atau gunakan opsi RawBT.');
  }

  try {
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });

    if (!device || !device.gatt) {
      throw new Error('Perangkat Bluetooth tidak valid.');
    }

    const server = await device.gatt.connect();

    // Search for writable characteristic across services
    let foundChar: any = null;
    const services = await server.getPrimaryServices();

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            foundChar = char;
            break;
          }
        }
        if (foundChar) break;
      } catch (e) {
        // Continue searching next service
      }
    }

    if (!foundChar) {
      throw new Error('Tidak dapat menemukan saluran cetak (GATT Characteristic) pada printer ini.');
    }

    activeBluetoothDevice = device;
    activeCharacteristic = foundChar;

    return {
      name: device.name || 'Bluetooth Thermal Printer',
      id: device.id,
      connected: true,
    };
  } catch (error: any) {
    console.error('Bluetooth connection failed:', error);
    throw new Error(error.message || 'Gagal menyambungkan printer Bluetooth.');
  }
}

/**
 * Send raw binary buffer in chunks to Bluetooth characteristic
 */
export async function sendBluetoothData(buffer: Uint8Array, progressCallback?: (percent: number) => void): Promise<void> {
  if (!activeCharacteristic) {
    throw new Error('Printer Bluetooth belum terhubung.');
  }

  const CHUNK_SIZE = 512; // BLE safe MTU chunk
  const total = buffer.length;

  for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
    const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
    if (activeCharacteristic.writeValueWithoutResponse) {
      await activeCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await activeCharacteristic.writeValue(chunk);
    }
    if (progressCallback) {
      progressCallback(Math.min(100, Math.round(((offset + chunk.length) / total) * 100)));
    }
    // Small delay to prevent BLE buffer overflow
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

/**
 * Disconnect active Bluetooth printer
 */
export function disconnectBluetoothPrinter(): void {
  try {
    if (activeBluetoothDevice && activeBluetoothDevice.gatt?.connected) {
      activeBluetoothDevice.gatt.disconnect();
    }
  } catch (e) {
    console.warn('Disconnect error:', e);
  } finally {
    activeBluetoothDevice = null;
    activeCharacteristic = null;
  }
}

/**
 * Convert HTML Canvas to ESC/POS Raster Image Command (GS v 0)
 */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8Array(0);

  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // Byte width must be aligned to 8 bits
  const widthBytes = Math.ceil(width / 8);
  const rasterBytes = widthBytes * height;

  // ESC/POS Init & Alignment Center: ESC @, ESC a 1
  const header = [
    0x1b, 0x40, // ESC @ (Initialize)
    0x1b, 0x61, 0x01, // ESC a 1 (Center)
    0x1d, 0x76, 0x30, 0x00, // GS v 0 0 (Raster image normal mode)
    widthBytes & 0xff,
    (widthBytes >> 8) & 0xff, // xL, xH (Number of bytes in horizontal direction)
    height & 0xff,
    (height >> 8) & 0xff, // yL, yH (Number of dots in vertical direction)
  ];

  const bitmap = new Uint8Array(rasterBytes);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Luminance calculation
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Treat transparent or light pixels as white (0), dark as black (1)
      const isBlack = a > 128 && (r * 0.299 + g * 0.587 + b * 0.114) < 160;

      if (isBlack) {
        const byteIndex = y * widthBytes + Math.floor(x / 8);
        const bitPosition = 7 - (x % 8);
        bitmap[byteIndex] |= 1 << bitPosition;
      }
    }
  }

  // Footer: Feed 3 lines & cut (GS V 66 0)
  const footer = [
    0x1b, 0x64, 0x03, // ESC d 3 (Feed 3 lines)
    0x1d, 0x56, 0x42, 0x00, // GS V 'B' 0 (Partial cut)
  ];

  const totalLength = header.length + bitmap.length + footer.length;
  const result = new Uint8Array(totalLength);
  result.set(header, 0);
  result.set(bitmap, header.length);
  result.set(footer, header.length + bitmap.length);

  return result;
}

/**
 * Open RawBT app on Android to print image or html
 */
export function printViaRawBT(base64Png: string): void {
  // RawBT intent schema
  const cleanBase64 = base64Png.replace(/^data:image\/png;base64,/, '');
  const url = `rawbt:data:image/png;base64,${cleanBase64}`;
  
  // Try opening rawbt URL directly
  window.location.href = url;
}
