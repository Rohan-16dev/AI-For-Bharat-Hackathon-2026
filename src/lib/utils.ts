import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function maskSensitive(val?: string) {
  if (!val || val === 'N/A' || val === 'ABSENT' || val === 'ABSENT ' || val === 'Pending' || val === 'UNKNOWN') return val;
  const str = val.trim();
  if (str.length <= 4) return str;
  if (str.length === 10) {
    // PAN format: AABCR1234D -> AABCR****D
    return `${str.substring(0, 5)}****${str.substring(9)}`;
  }
  if (str.length === 15) {
    // GSTIN format: 29AABCR1234D1Z5 -> 29AABCR****1Z5
    return `${str.substring(0, 7)}****${str.substring(12)}`;
  }
  // Fallback for other IDs: mask middle, keep 2 at ends
  return `${str.substring(0, 2)}****${str.substring(str.length - 2)}`;
}

export function maskPAN(pan?: string) {
  return maskSensitive(pan);
}
