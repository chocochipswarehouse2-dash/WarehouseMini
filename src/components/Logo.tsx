import React, { useState, useEffect } from 'react';
import { getActiveLogoId, LOGO_DESIGNS } from './LogoDesigns';

interface LogoProps {
  className?: string;
  size?: number;
  onClick?: () => void;
}

export const AppLogo: React.FC<LogoProps> = ({ className = '', size = 36, onClick }) => {
  const [logoId, setLogoId] = useState<string>(getActiveLogoId);

  useEffect(() => {
    const handleLogoChanged = (e: any) => {
      if (e.detail?.logoId) {
        setLogoId(e.detail.logoId);
      }
    };
    window.addEventListener('wms_logo_changed', handleLogoChanged);
    return () => window.removeEventListener('wms_logo_changed', handleLogoChanged);
  }, []);

  const selectedDesign = LOGO_DESIGNS.find((d) => d.id === logoId);

  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center shrink-0 rounded-xl bg-transparent overflow-hidden ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      title="Warehouse Mini - Klik untuk ganti / pratinjau desain logo"
    >
      {logoId === 'classic' || !selectedDesign ? (
        <img
          src="/app-logo.svg"
          alt="Chocochips Logo"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        selectedDesign.renderSvg(size)
      )}
    </div>
  );
};

