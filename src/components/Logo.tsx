import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
  onClick?: () => void;
}

export const AppLogo: React.FC<LogoProps> = ({ className = '', size = 36, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`relative flex items-center justify-center shrink-0 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-700/50 shadow-xs overflow-hidden select-none ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      } ${className}`}
      style={{ width: size, height: size }}
      title="Warehouse Mini"
    >
      <svg
        viewBox="0 0 192 192"
        width="100%"
        height="100%"
        className="w-full h-full"
      >
        <rect width="192" height="192" fill="#111111" rx="40" />
        <text
          x="50%"
          y="54%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="62"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          fill="#ffffff"
          letterSpacing="3"
        >
          WMS
        </text>
      </svg>
    </div>
  );
};
