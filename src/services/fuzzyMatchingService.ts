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
 * Compares two records and returns a detailed match analysis based on Karnataka UBID Logic Engine rules.
 */
export const compareRecords = (
  recordA: SourceRecord, 
  recordB: SourceRecord, 
  knowledge?: SystemKnowledge
) => {
  // RULE: HUMAN_AUTHORITY - Check manual blacklist (UNLINK signals)
  const isBlacklisted = (idA: string, idB: string) => {
    return knowledge?.manualBlacklist.some(b => 
      (b.recordIdA === idA && b.recordIdB === idB) || 
      (b.recordIdA === idB && b.recordIdB === idA)
    );
  };

  if (isBlacklisted(recordA.id, recordB.id)) {
    return {
      score: 0.1,
      confidence: 0.1,
      verdict: 'ORPHAN' as const,
      edge_case_flag: 'MANUAL_REVERSION' as const,
      reasoning: 'HUMAN_AUTHORITY: Manual inspection confirmed this linkage was false. Scoring bypassed.',
      reasons: ['Manual Reversion by Admin'],
      riskFactors: ['Identity Overlap - Do Not Merge'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  // --- ANCHOR SYSTEM Extraction ---
  const panA = recordA.pan?.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const panB = recordB.pan?.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const panMatch = panA && panB && panA === panB;

  const gstinA = (recordA.gstin && recordA.gstin !== 'Pending') ? recordA.gstin.toUpperCase() : null;
  const gstinB = (recordB.gstin && recordB.gstin !== 'Pending') ? recordB.gstin.toUpperCase() : null;
  const gstinMatch = gstinA && gstinB && gstinA === gstinB;

  const tradeA = recordA.tradeLicense?.toUpperCase() || recordA.licenseId?.toUpperCase();
  const tradeB = recordB.tradeLicense?.toUpperCase() || recordB.licenseId?.toUpperCase();
  const tradeMatch = tradeA && tradeB && tradeA === tradeB;

  const pinMatch = recordA.pinCode === recordB.pinCode;
  
  const normNameA = normalizeString(recordA.businessName);
  const normNameB = normalizeString(recordB.businessName);
  const nameSim = stringSimilarity(normNameA, normNameB);

  // --- 0. FEEDBACK LOOP: Check Approved Aliases (Passive Learning) ---
  // If this exact name/address variation was previously approved by a human
  let feedbackBoost = 0;
  if (knowledge?.approvedAliases) {
    const isKnownAlias = knowledge.approvedAliases.some(a => 
      a.name === recordB.businessName && a.address === recordB.address
    );
    if (isKnownAlias) {
      feedbackBoost = 0.15; // Significant boost for historically confirmed variations
    }
  }

  // --- HARD RULE: Different PANs = Different Legal Entities ---
  if (panA && panB && panA !== panB) {
    return {
      score: 0.35,
      confidence: 0.35,
      verdict: 'IDENTITY_COLLISION' as const,
      edge_case_flag: 'NONE' as const,
      reasoning: 'HARD RULE: Different PANs found. These are distinct Legal Entities regardless of name/location similarity.',
      reasons: ['Conflicting Legal Anchors (PAN)'],
      riskFactors: ['PAN Mismatch'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  // --- 1. Confidence 95-100 (AUTO_MERGE) ---
  
  // Exact PAN AND Exact GSTIN AND Geospatial Match
  if (panMatch && gstinMatch && pinMatch) {
    return {
      score: 99.0,
      confidence: 0.99,
      verdict: 'AUTO_MERGE' as const,
      edge_case_flag: 'NONE' as const,
      reasoning: 'Anchor System Synthesis: Exact PAN (Legal), GSTIN (Tax), and Pincode (Geospatial) match. Certainty level maximum.',
      reasons: ['PAN Match', 'GSTIN Match', 'Pincode Match'],
      riskFactors: [],
      ubid_suggestion: 'TARGET_UBID'
    };
  }

  // Exact PAN AND Exact Trade License ID
  if (panMatch && tradeMatch) {
    return {
      score: 98.0,
      confidence: 0.98,
      verdict: 'AUTO_MERGE' as const,
      edge_case_flag: 'NONE' as const,
      reasoning: 'Legal Anchor (PAN) and Geospatial Anchor (Trade License) match. Confirms occupancy by owner.',
      reasons: ['PAN Match', 'Trade License Match'],
      riskFactors: [],
      ubid_suggestion: 'TARGET_UBID'
    };
  }

  // Exact PAN AND Exact Pincode AND Name Similarity > 85%
  if (panMatch && pinMatch && nameSim > 0.85) {
    return {
      score: 96.0,
      confidence: 0.96,
      verdict: 'AUTO_MERGE' as const,
      edge_case_flag: 'NONE' as const,
      reasoning: 'PAN and Location match with high name similarity. Reliable for auto-merging missing higher signals.',
      reasons: ['PAN Match', 'Pincode Match', `Name Similarity (${(nameSim * 100).toFixed(0)}%)`],
      riskFactors: [],
      ubid_suggestion: 'TARGET_UBID'
    };
  }

  // --- 2. Confidence 70-94 (HUMAN_REVIEW) ---

  // Edge Case 1: The Branch (PAN matches, Locations vary)
  if (panMatch && !pinMatch) {
    return {
      score: 85.0,
      confidence: 0.85,
      verdict: 'HUMAN_REVIEW' as const,
      edge_case_flag: 'BRANCH_NODE' as const,
      reasoning: 'Legal Anchor matches, but Geospatial discrepancy flags this as a potential Branch. Review required for node assignment.',
      reasons: ['PAN Match', 'Location Discrepancy'],
      riskFactors: ['Potential Branch Office'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  // Edge Case 2: Multi-Business Owner (PAN/Pincode match, Names vary)
  if (panMatch && pinMatch && nameSim < 0.6) {
    return {
      score: 82.0,
      confidence: 0.82,
      verdict: 'HUMAN_REVIEW' as const,
      edge_case_flag: 'MULTI_BUSINESS' as const,
      reasoning: 'PAN and Pincode match, but Business Names are completely unrelated. Suggests 2 shops in 1 building owned by 1 person.',
      reasons: ['PAN Match', 'Location Match', 'Extreme Name Variance'],
      riskFactors: ['Multi-Business at Single Counter'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  // Edge Case 3: Multiple GSTINs (PAN/Location match, GSTINs vary)
  if (panMatch && pinMatch && gstinA && gstinB && gstinA !== gstinB) {
    return {
      score: 88.0,
      confidence: 0.88,
      verdict: 'HUMAN_REVIEW' as const,
      edge_case_flag: 'MULTI_VERTICAL' as const,
      reasoning: 'PAN and Location match, but Tax Verticals (GSTIN) differ. Suggests multiple registered verticals at one desk.',
      reasons: ['PAN Match', 'Location Match', 'GSTIN Mismatch'],
      riskFactors: ['Multiple Tax Verticals'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  // Edge Case 4: Missing Legal IDs (No PAN/GSTIN, but strong signals elsewhere)
  if (!panA && !panB && !gstinA && !gstinB && nameSim > 0.95 && pinMatch && tradeMatch) {
    return {
      score: 75.0,
      confidence: 0.75,
      verdict: 'HUMAN_REVIEW' as const,
      edge_case_flag: 'MISSING_IDS' as const,
      reasoning: 'No Legal IDs provided, but exact Name, Pincode, and Trade License match. High probability of same entity.',
      reasons: ['Name Match', 'Pincode Match', 'Trade License Match'],
      riskFactors: ['No Legal Anchor (PAN)'],
      ubid_suggestion: 'TARGET_UBID'
    };
  }

  // --- 2.5 Learned Identity Match (Feedback Loop) ---
  // If no hard anchors matched but this variation was previously approved
  if (feedbackBoost > 0 && nameSim > 0.6) {
    const boostedConfidence = Math.min(0.98, 0.82 + feedbackBoost);
    return {
      score: boostedConfidence * 100,
      confidence: boostedConfidence,
      verdict: boostedConfidence >= 0.95 ? 'AUTO_MERGE' : 'HUMAN_REVIEW' as any,
      edge_case_flag: 'NONE' as any,
      reasoning: 'HUMAN_FEEDBACK_LOOP: This name/address variation has been historically approved in the registry. Logic Engine confidence boosted by passive learning.',
      reasons: ['Confirmed Alias (Historical)', `Name Similarity (${(nameSim * 100).toFixed(0)}%)`],
      riskFactors: [],
      ubid_suggestion: 'TARGET_UBID' as any
    };
  }

  // --- 3. Confidence < 70 (ORPHAN) ---
  
  return {
    score: 50.0,
    confidence: 0.50,
    verdict: 'ORPHAN' as const,
    edge_case_flag: 'NONE' as const,
    reasoning: 'Default orphan assignment: Insufficient correlation across Anchor System layers.',
    reasons: nameSim > 0.7 ? ['Partial Name Similarity'] : [],
    riskFactors: ['Inconclusive Signals'],
    ubid_suggestion: 'NEW_GEN_REQUIRED'
  };
};
