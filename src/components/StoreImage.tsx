import { useState } from 'react';
import { Package } from 'lucide-react';
import { normalizeImageUrl } from '../utils/format';

interface StoreImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  priority?: boolean;
}

export function StoreImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  priority = false,
}: StoreImageProps) {
  const [failed, setFailed] = useState(false);
  const resolved = normalizeImageUrl(src || '');

  if (!resolved || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F1F5F9] text-[#64748B] select-none p-4 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Package className="w-7 h-7 stroke-[1.5] mb-2 text-[#94A3B8]" />
        <span className="text-xs font-medium text-[#475569] line-clamp-2 max-w-[16ch]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={priority ? 'eager' : 'lazy'}
      decoding={priority ? 'sync' : 'async'}
      fetchPriority={priority ? 'high' : 'auto'}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
