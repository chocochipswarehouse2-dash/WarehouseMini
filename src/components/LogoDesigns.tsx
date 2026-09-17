import React from 'react';

export interface LogoDesignOption {
  id: string;
  name: string;
  tagline: string;
  category: string;
  palette: { name: string; hex: string }[];
  description: string;
  philosophy: string;
  renderSvg: (size?: number, className?: string) => React.ReactNode;
}

export const LOGO_DESIGNS: LogoDesignOption[] = [
  {
    id: 'chocochips-signature',
    name: 'Chocochips Signature',
    tagline: 'Klasik, Tegas, & Profesional',
    category: 'Minimalist Signature',
    palette: [
      { name: 'Warm Charcoal', hex: '#27272A' },
      { name: 'Chocochips Brown', hex: '#78350F' },
      { name: 'Gold Accent', hex: '#F59E0B' },
    ],
    description: 'Desain minimalis modern yang menonjolkan huruf inisial dengan bentuk geometris tegas dan rapi, merepresentasikan sistem manajemen inventaris yang akurat.',
    philosophy: 'Kejelasan, profesionalisme, dan struktur. Menghindari elemen visual yang terlalu rumit demi keterbacaan yang maksimal.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="ch-sig-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#18181B" />
            <stop offset="100%" stopColor="#09090B" />
          </linearGradient>
        </defs>
        <rect width="120" height="120" rx="28" fill="url(#ch-sig-bg)" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#3F3F46" strokeWidth="1.5" fill="none" opacity="0.6" />
        <path
          d="M55 45 C48 45 40 50 40 60 C40 70 48 75 55 75"
          stroke="#F59E0B"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M65 45 L70 75 L75 55 L80 75 L85 45"
          stroke="#D4D4D8"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    id: 'garment-box-flat',
    name: 'Garment Box Flat',
    tagline: 'Ikon Datar Bersih',
    category: 'Flat UI Design',
    palette: [
      { name: 'Pure White', hex: '#FFFFFF' },
      { name: 'Subtle Slate', hex: '#F1F5F9' },
      { name: 'Dark Ink', hex: '#0F172A' },
    ],
    description: 'Desain datar (flat design) 2 dimensi dengan warna solid yang cerah dan ikon yang sangat mudah dikenali sekilas.',
    philosophy: 'Fungsionalitas di atas segalanya. Cocok untuk lingkungan kerja cepat di mana kejernihan visual adalah prioritas utama.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <rect width="120" height="120" rx="28" fill="#F8FAFC" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#E2E8F0" strokeWidth="1.5" fill="none" />
        <path
          d="M30 45 L60 30 L90 45 L90 75 L60 90 L30 75 Z"
          fill="#0F172A"
        />
        <path
          d="M30 45 L60 60 M90 45 L60 60 M60 60 L60 90"
          stroke="#F8FAFC"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M50 50 C55 45 65 45 70 50 L60 55 Z"
          fill="#F59E0B"
        />
      </svg>
    ),
  },
  {
    id: 'chic-hanger-box',
    name: 'Chic Hanger & Smart Box',
    tagline: 'Perpaduan Butik Fashion & Gudang Modern',
    category: 'Fashion x Warehouse',
    palette: [
      { name: 'Warm Amber', hex: '#F59E0B' },
      { name: 'Cognac Gold', hex: '#B45309' },
      { name: 'Midnight Slate', hex: '#0F172A' },
      { name: 'Honey Glow', hex: '#FDE68A' },
    ],
    description: 'Siluet kotak paket pengiriman 3D geometris yang berpadu dengan gantungan baju (hanger) butik elegan dan aksen garis pemindai barcode modern.',
    philosophy: 'Mencerminkan identitas ganda: gudang penyimpanan busana (garment) berkelas butik dengan efisiensi sistem inventaris berkecepatan tinggi.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="chb-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="100%" stopColor="#0F172A" />
          </linearGradient>
          <linearGradient id="chb-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE68A" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="chb-box-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="chb-box-left" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <linearGradient id="chb-box-right" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <filter id="chb-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Squircle Base */}
        <rect width="120" height="120" rx="28" fill="url(#chb-bg)" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#334155" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* Chic Hanger Top (Fashion Hook) */}
        <path
          d="M60 22 C64 22 67 25 67 28 C67 32 63 35 60 38 L60 44"
          stroke="url(#chb-gold)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="60" cy="20" r="2.5" fill="#FDE68A" />

        {/* Hanger Shoulder Silhouette */}
        <path
          d="M32 54 L60 42 L88 54"
          stroke="url(#chb-gold)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Isometric 3D Box (Warehouse Package) */}
        {/* Top Face */}
        <path
          d="M60 50 L84 62 L60 74 L36 62 Z"
          fill="url(#chb-box-top)"
        />
        {/* Top Face Tape Seam */}
        <path
          d="M48 56 L72 68"
          stroke="#FEF3C7"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Left Face */}
        <path
          d="M36 62 L60 74 L60 98 L36 86 Z"
          fill="url(#chb-box-left)"
        />
        {/* Left Face Barcode Accent */}
        <line x1="42" y1="72" x2="42" y2="82" stroke="#FEF3C7" strokeWidth="1.8" strokeLinecap="round" opacity="0.9" />
        <line x1="46" y1="74" x2="46" y2="84" stroke="#FEF3C7" strokeWidth="2.8" strokeLinecap="round" opacity="0.9" />
        <line x1="51" y1="76" x2="51" y2="86" stroke="#FEF3C7" strokeWidth="1.4" strokeLinecap="round" opacity="0.9" />
        <line x1="55" y1="78" x2="55" y2="88" stroke="#FEF3C7" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />

        {/* Right Face */}
        <path
          d="M60 74 L84 62 L84 86 L60 98 Z"
          fill="url(#chb-box-right)"
        />

        {/* Laser Scanner Beam (Glow Effect) */}
        <line
          x1="28"
          y1="76"
          x2="92"
          y2="76"
          stroke="#38BDF8"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#chb-glow)"
          opacity="0.9"
        />
        <circle cx="60" cy="76" r="3" fill="#E0F2FE" filter="url(#chb-glow)" />
      </svg>
    ),
  },
  {
    id: 'monogram-cw',
    name: 'Modern Monogram C-W',
    tagline: 'Chocochips Warehouse Luxury Monogram',
    category: 'Luxury Minimalist',
    palette: [
      { name: 'Warm Chocolate', hex: '#451A03' },
      { name: 'Caramel Amber', hex: '#D97706' },
      { name: 'Golden Champagne', hex: '#FDE047' },
      { name: 'Ivory Cream', hex: '#FFFBEB' },
    ],
    description: 'Tipografi geometris interlocking huruf "C" (Chocochips) dan "W" (Warehouse) dalam garis tebal elegan yang menyerupai lipatan label garment butik mewah.',
    philosophy: 'Pendekatan luxury fashion house Eropa. Simpel, prestisius, mudah dikenali baik pada layar aplikasi HP maupun label cetak thermal.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="mcw-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#451A03" />
            <stop offset="100%" stopColor="#1C0A00" />
          </linearGradient>
          <linearGradient id="mcw-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
          <linearGradient id="mcw-amber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
        </defs>

        {/* Squircle Base */}
        <rect width="120" height="120" rx="28" fill="url(#mcw-bg)" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#78350F" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* Outer Circular 'C' (Chocochips) Ribbon */}
        <path
          d="M82 34 C76 26 67 22 56 22 C37 22 24 37 24 60 C24 83 37 98 56 98 C68 98 78 93 84 84"
          stroke="url(#mcw-gold)"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />

        {/* Inner Geometric 'W' (Warehouse) Integration */}
        <path
          d="M44 48 L52 74 L62 50 L72 74 L80 48"
          stroke="url(#mcw-amber)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Chic Gem / Diamond Accent */}
        <polygon
          points="88,38 93,43 88,48 83,43"
          fill="#FDE047"
        />
        <circle cx="88" cy="80" r="3.5" fill="#FBBF24" />
      </svg>
    ),
  },
  {
    id: 'scanner-hexagon',
    name: 'Smart Barcode Hexagon',
    tagline: 'Presisi Inventaris & Kecepatan Pemindai',
    category: 'High-Tech Logistics',
    palette: [
      { name: 'Dark Indigo', hex: '#0F172A' },
      { name: 'Vibrant Orange', hex: '#EA580C' },
      { name: 'Electric Cyan', hex: '#06B6D4' },
      { name: 'Clean White', hex: '#FFFFFF' },
    ],
    description: 'Bentuk heksagon isometrik 3D modern yang memvisualisasikan rak gudang pintar dengan barcode dinamis dan laser scanner presisi tinggi.',
    philosophy: 'Fokus pada kekuatan operasional gudang: akurasi stok 100%, kecepatan pemindaian barcode kamera & scanner bluetooth, serta keandalan data.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="sbh-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#182234" />
            <stop offset="100%" stopColor="#0B1120" />
          </linearGradient>
          <linearGradient id="sbh-orange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>
          <linearGradient id="sbh-cyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67E8F9" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
        </defs>

        {/* Squircle Base */}
        <rect width="120" height="120" rx="28" fill="url(#sbh-bg)" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#334155" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* 3D Isometric Hexagon Shell */}
        {/* Top Roof / Surface */}
        <polygon
          points="60,20 92,38 60,56 28,38"
          fill="#1E293B"
          stroke="#475569"
          strokeWidth="1.5"
        />
        {/* Left Hex Wall */}
        <polygon
          points="28,38 60,56 60,94 28,76"
          fill="#0F172A"
          stroke="#334155"
          strokeWidth="1.5"
        />
        {/* Right Hex Wall */}
        <polygon
          points="60,56 92,38 92,76 60,94"
          fill="#131E33"
          stroke="#334155"
          strokeWidth="1.5"
        />

        {/* Stylized Vertical Barcodes on Left Wall */}
        <line x1="36" y1="49" x2="36" y2="71" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="42" y1="52" x2="42" y2="75" stroke="#FED7AA" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="47" y1="55" x2="47" y2="78" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        <line x1="53" y1="58" x2="53" y2="82" stroke="#FED7AA" strokeWidth="2" strokeLinecap="round" />

        {/* Stylized Shelves on Right Wall */}
        <path
          d="M66 63 L86 52 M66 73 L86 62 M66 83 L86 72"
          stroke="#06B6D4"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Dynamic Glowing Laser Crosshair */}
        <line x1="22" y1="56" x2="98" y2="56" stroke="url(#sbh-cyan)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="60" cy="56" r="4.5" fill="#FFFFFF" stroke="#06B6D4" strokeWidth="2" />

        {/* Top 'W' Lettering Contour */}
        <path
          d="M44 32 L52 46 L60 36 L68 46 L76 32"
          stroke="url(#sbh-orange)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    ),
  },
  {
    id: 'ribbon-check',
    name: 'Boutique Ribbon & Verified Check',
    tagline: 'Estetika Butik, QC Lolos & Order Tuntas',
    category: 'Boutique Aesthetic',
    palette: [
      { name: 'Coral Terracotta', hex: '#E11D48' },
      { name: 'Warm Amber', hex: '#F59E0B' },
      { name: 'Deep Espresso', hex: '#1C1917' },
      { name: 'Emerald Verified', hex: '#10B981' },
    ],
    description: 'Pita kemasan belanja butik fashion yang mengalir dinamis membentuk huruf "W", dengan sayap kanan membentuk centang (checklist) Quality Control dan fulfillment terverifikasi.',
    philosophy: 'Menonjolkan kepuasan pelanggan, kemasan butik yang rapi dan elegan, serta standar kontrol kualitas (QC) yang ketat sebelum produk dikirim.',
    renderSvg: (size = 120, className = '') => (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <defs>
          <linearGradient id="brc-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#292524" />
            <stop offset="100%" stopColor="#181514" />
          </linearGradient>
          <linearGradient id="brc-ribbon" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FB7185" />
            <stop offset="50%" stopColor="#E11D48" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id="brc-check" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Squircle Base */}
        <rect width="120" height="120" rx="28" fill="url(#brc-bg)" />
        <rect width="118" height="118" x="1" y="1" rx="27" stroke="#44403C" strokeWidth="1.5" fill="none" opacity="0.6" />

        {/* Flowing Ribbon Form 'W' */}
        <path
          d="M26 44 C26 44 34 82 42 82 C49 82 55 58 60 58 C65 58 70 78 77 78 C84 78 92 48 96 36"
          stroke="url(#brc-ribbon)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Inner Elegant Ribbon Accent */}
        <path
          d="M32 46 C35 70 41 76 45 76 C49 76 54 59 60 59"
          stroke="#FECDD3"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />

        {/* Verified Shield / Checkmark on top right */}
        <circle cx="94" cy="38" r="14" fill="#064E3B" stroke="#10B981" strokeWidth="2.5" />
        <path
          d="M88 38 L92 42 L100 34"
          stroke="#A7F3D0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Subtle boutique sparkle */}
        <polygon points="34,28 37,33 34,38 31,33" fill="#FDE047" />
      </svg>
    ),
  },
];

const LOGO_STORAGE_KEY = 'wms_app_logo_choice';

export function getActiveLogoId(): string {
  if (typeof window === 'undefined') return 'chic-hanger-box';
  try {
    const saved = localStorage.getItem(LOGO_STORAGE_KEY);
    if (saved) return saved;
  } catch {}
  return 'chic-hanger-box';
}

export function setActiveLogoId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOGO_STORAGE_KEY, id);
    window.dispatchEvent(new CustomEvent('wms_logo_changed', { detail: { logoId: id } }));
  } catch (e) {
    console.warn('Gagal menyimpan logo id:', e);
  }
}
