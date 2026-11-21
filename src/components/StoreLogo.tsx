import { useState } from 'react';
import { normalizeImageUrl } from '../utils/format';

interface StoreLogoProps {
  storeName: string;
  logoUrl?: string;
  size?: 'sm' | 'md';
}

export function StoreLogo({ storeName, logoUrl, size = 'md' }: StoreLogoProps) {
  const [imgError, setImgError] = useState(false);
  const resolvedLogo = normalizeImageUrl(logoUrl || '');
  const boxClass = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const isDealTrend = storeName.trim().toLowerCase() === 'dealtrend';

  return (
    <span className="inline-flex items-center gap-2.5 shrink-0 whitespace-nowrap">
      {resolvedLogo && !imgError ? (
        <img
          src={resolvedLogo}
          alt={`${storeName} logo`}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${boxClass} rounded-lg object-contain bg-white border border-[#E2E8F0] p-0.5 shrink-0`}
        />
      ) : (
        <span
          className={`${boxClass} rounded-lg bg-[#0B3B6D] text-white inline-flex items-center justify-center shrink-0`}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-4 h-4"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 7h12l-1 13H7L6 7z" />
            <path d="M9 7V5a3 3 0 016 0v2" stroke="#F2711C" />
          </svg>
        </span>
      )}
      {isDealTrend ? (
        <span className="text-xl font-bold tracking-tight whitespace-nowrap">
          <span className="text-[#0B3B6D]">Deal</span>
          <span className="text-[#E8630A]">Trend</span>
        </span>
      ) : (
        <span className="text-lg font-bold tracking-tight text-[#0B3B6D] whitespace-nowrap">
          {storeName}
        </span>
      )}
    </span>
  );
}
