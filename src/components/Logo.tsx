import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const AppLogo: React.FC<LogoProps> = ({ className = '', size = 36 }) => {
  return (
    <div className={`relative flex items-center justify-center shrink-0 rounded-xl bg-transparent overflow-hidden ${className}`} style={{ width: size, height: size }}>
      <img src="/app-logo.png" alt="Chocochips Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </div>
  );
};
