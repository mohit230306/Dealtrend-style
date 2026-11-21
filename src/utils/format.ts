export function normalizeImageUrl(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';

  // Support Google Drive share links:
  // 1) https://drive.google.com/file/d/<ID>/view?usp=sharing
  // 2) https://drive.google.com/open?id=<ID>
  // 3) https://drive.google.com/uc?id=<ID>&export=view
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1200`;
  }

  const queryMatch = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/);
  if (queryMatch && queryMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${queryMatch[1]}&sz=w1200`;
  }

  return url;
}

export function formatPrice(amount: number, currencySymbol = '₹'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currencySymbol}${safe.toLocaleString('en-IN', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calculateDiscountPercent(originalPrice: number, sellingPrice: number): number {
  if (!originalPrice || originalPrice <= sellingPrice || sellingPrice < 0) return 0;
  return Math.round(((originalPrice - sellingPrice) / originalPrice) * 100);
}

export function formatDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function isValidMobile(mobile: string): boolean {
  const digits = mobile.replace(/\D/g, '');
  // Supports 10-digit Indian mobile numbers (or 10-12 digits with country code 91)
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) return true;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]\d{9}$/.test(digits.slice(2))) return true;
  // Also allow standard 10-digit numbers starting 1-9 for broader international testing
  return digits.length >= 10 && digits.length <= 13;
}

export function isValidPincode(pincode: string): boolean {
  return /^\d{6}$/.test(pincode.trim());
}

const KNOWN_FAKE_UTRS = new Set([
  '123456789012',
  '012345678901',
  '123456789123',
  '987654321098',
  '987654321012',
  '123456123456',
  '123456654321',
  '111222333444',
  '000111222333',
]);

export function normalizeUpiUtr(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, 12);
}

export function validateUpiUtr(raw: string): {
  valid: boolean;
  utr: string;
  error?: string;
} {
  const trimmed = (raw || '').trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!trimmed || digitsOnly.length !== 12 || !/^\d{12}$/.test(trimmed)) {
    return {
      valid: false,
      utr: digitsOnly.slice(0, 12),
      error: 'Please enter the exact 12-digit numeric UPI UTR / Reference number from your payment app.',
    };
  }
  const uniqueDigits = new Set(digitsOnly.split('')).size;
  if (
    uniqueDigits <= 2 ||
    /^(\d)\1{11}$/.test(digitsOnly) ||
    /^(\d{2})\1{5}$/.test(digitsOnly) ||
    /^(\d{3})\1{3}$/.test(digitsOnly) ||
    KNOWN_FAKE_UTRS.has(digitsOnly)
  ) {
    return {
      valid: false,
      utr: digitsOnly,
      error: 'This does not look like a valid UPI UTR number. Please enter the real 12-digit UTR from your UPI receipt.',
    };
  }
  return { valid: true, utr: digitsOnly };
}

