import { SourceRecord, SystemKnowledge } from '../types';

/**
 * Common abbreviations for normalization
 */
const ABBREVIATIONS: Record<string, string> = {
  'pvt': 'private',
  'ltd': 'limited',
  'rd': 'road',
  'st': 'street',
  'bldg': 'building',
  'ind': 'industrial',
  'ent': 'enterprises',
  'inc': 'incorporated',
  'co': 'company',
  'corp': 'corporation',
  'mkt': 'market',
  'dept': 'department',
  'assn': 'association',
  'svc': 'services',
  'tech': 'technologies',
  'solutions': 'soln',
  'industrial': 'ind', // Bidirectional mapping helper
};

/**
 * Simple cache for normalization
 */
const normalizationCache = new Map<string, string>();

/**
 * Normalizes a string by lowercasing, expanding abbreviations, 
 * and removing special characters.
 */
export const normalizeString = (str: string): string => {
  if (!str) return '';
  if (normalizationCache.has(str)) return normalizationCache.get(str)!;

  let normalized = str.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.split(' ');
  const expandedWords = words.map(word => ABBREVIATIONS[word] || word);
  const result = expandedWords.join(' ');
  
  if (normalizationCache.size < 5000) {
    normalizationCache.set(str, result);
  }
  
  return result;
};

/**
 * Levenshtein Distance for string similarity using iterative 2-row approach (Memory Optimized)
 */
export const levenshteinDistance = (a: string, b: string): number => {
  if (a.length < b.length) [a, b] = [b, a];
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  let currRow = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1,
        prevRow[j] + 1,
        prevRow[j - 1] + cost
      );
    }
    prevRow = [...currRow];
  }
  return prevRow[b.length];
};

export const stringSimilarity = (a: string, b: string): number => {
  if (a === b) return 1.0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return (longer.length - distance) / longer.length;
};

/**
 * Soundex Phonetic Algorithm (Simplified for English/Common Industrial Names)
 */
export const soundex = (str: string): string => {
  if (!str) return '';
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '';

  const codes: Record<string, string> = {
    'B': '1', 'F': '1', 'P': '1', 'V': '1',
    'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
    'D': '3', 'T': '3',
    'L': '4',
    'M': '5', 'N': '5',
    'R': '6'
  };

  const firstLetter = s[0];
  let res = firstLetter;
  let lastCode = codes[firstLetter] || '0';

  for (let i = 1; i < s.length && res.length < 4; i++) {
    const code = codes[s[i]] || '0';
    if (code !== '0' && code !== lastCode) {
      res += code;
    }
    lastCode = code;
  }

  return res.padEnd(4, '0');
};

/**
 * Compares two records and returns a detailed match analysis
 */
export const compareRecords = (
  recordA: SourceRecord, 
  recordB: SourceRecord, 
  knowledge?: SystemKnowledge
) => {
  const reasons: string[] = [];
  const riskFactors: string[] = [];
  
  // Weights (allow fallback to system defaults)
  const weights = knowledge?.learnedWeights || {
    nameWeight: 0.5,
    addressWeight: 0.3,
    pinWeight: 0.2
  };

  // 1. Exact Identifier Match (The "Anchor" signals)
  if (recordA.gstin && recordA.gstin === recordB.gstin && recordA.gstin !== 'Pending') {
    return {
      confidence: 0.99,
      reasons: ['GSTIN Exact Match'],
      riskFactors: []
    };
  }

  if (recordA.pan && recordA.pan === recordB.pan) {
    return {
      confidence: 0.98,
      reasons: ['PAN Exact Match'],
      riskFactors: []
    };
  }

  // 2. Name Similarity
  const normNameA = normalizeString(recordA.businessName);
  const normNameB = normalizeString(recordB.businessName);
  const nameScore = stringSimilarity(normNameA, normNameB);
  
  if (nameScore > 0.85) {
    reasons.push(`High Name Similarity (${(nameScore * 100).toFixed(0)}%)`);
  } else if (nameScore > 0.6) {
    reasons.push(`Moderate Name Similarity (${(nameScore * 100).toFixed(0)}%)`);
  }

  // Phonetic Name check
  const soundexA = soundex(recordA.businessName);
  const soundexB = soundex(recordB.businessName);
  const phoneticMatch = soundexA === soundexB;
  if (phoneticMatch && nameScore < 0.9) {
    reasons.push('Phonetic Name Match (Soundex)');
  }

  // 3. Address Similarity
  const normAddrA = normalizeString(recordA.address);
  const normAddrB = normalizeString(recordB.address);
  const addrScore = stringSimilarity(normAddrA, normAddrB);
  
  if (addrScore > 0.8) {
    reasons.push(`Strong Address Correlation (${(addrScore * 100).toFixed(0)}%)`);
  }

  // 4. Spatial / PIN Signal
  const pinMatch = recordA.pinCode === recordB.pinCode;
  if (pinMatch) {
    reasons.push('Location/PIN Code Alignment');
  } else {
    riskFactors.push('PIN Code Mismatch');
  }

  // Weighted Calculation
  let confidence = (nameScore * weights.nameWeight) + 
                   (addrScore * weights.addressWeight) + 
                   (pinMatch ? weights.pinWeight : 0);
  
  // Bonus for Phonetic if name score is lower
  if (phoneticMatch && nameScore < 0.7) confidence += 0.1;
  
  // Penalty for missing identifiers
  if (!recordA.gstin || !recordB.gstin) {
    riskFactors.push('Indirect Anchor (Missing GSTIN)');
  }

  // Final Clipping
  confidence = Math.min(0.98, Math.max(0.1, confidence));

  return {
    confidence,
    reasons: reasons.slice(0, 4),
    riskFactors: riskFactors.slice(0, 3)
  };
};
