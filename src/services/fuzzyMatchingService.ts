import { SourceRecord, SystemKnowledge, LogicAuditTrail } from '../types';
import { findCentroid } from '../data/pincode_centroids';
import { maskPAN } from '../lib/utils';

/**
 * Common abbreviations and legal suffixes for normalization per Section 3
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
  'industrial': 'ind',
  'and sons': '',
  'and brothers': '',
  'manufacturing': 'mfg',
  'works': '',
  'trading': '',
  'traders': '',
};

const HONORIFICS = ['sri', 'shri', 'smt', 'ms', 'mr', 'mrs', 'dr'];
const LEGAL_SUFFIXES = [
  'pvt', 'private', 'ltd', 'limited', 'corp', 'corporation', 
  'enterprises', 'enterprise', 'industries', 'industry', 
  'trading', 'traders', 'and sons', 'and brothers', 
  'company', 'co', 'works', 'mfg', 'manufacturing'
];

/**
 * Simple cache for normalization
 */
const normalizationCache = new Map<string, string>();

/**
 * Normalizes a string by lowercasing, expanding abbreviations, 
 * and removing special characters.
 * Implements Section 3 Pass 2 normalization rules.
 */
export const normalizeString = (str: string): string => {
  if (!str) return '';
  if (normalizationCache.has(str)) return normalizationCache.get(str)!;

  let normalized = str.toLowerCase()
    .replace(/[.,&()/\-']/g, ' ') // Strip punctuation: remove . , & ( ) / - ' (Section 3)
    .replace(/\s+/g, ' ')
    .trim();

  // Strip Honorifics (Section 3)
  const words = normalized.split(' ');
  const filteredWords = words.filter(word => !HONORIFICS.includes(word));
  
  // Strip Legal Suffixes (Section 3)
  const coreWords = filteredWords.filter(word => !LEGAL_SUFFIXES.includes(word));
  
  const expandedWords = coreWords.map(word => ABBREVIATIONS[word] || word);
  const result = expandedWords.join(' ').toUpperCase().trim();
  
  if (normalizationCache.size < 5000) {
    normalizationCache.set(str, result);
  }
  
  return result;
};

/**
 * Enhanced Normalization Pipeline for v4.0
 * Handles specific noise found in Karnataka industrial addresses and business names.
 */
export const normalizationPipeline = (str: string, type: 'NAME' | 'ADDRESS' | 'GENERIC' = 'GENERIC'): string => {
  let normalized = normalizeString(str);
  
  if (type === 'ADDRESS') {
    // Address specific normalization (remove floor numbers, common noise)
    normalized = normalized
      .replace(/\b(no|plot|survey|sy|sl|no|room|flr|floor|nr|near|opp|opposite)\b/g, '')
      .replace(/\d+(st|nd|rd|th)\s+(main|cross|block|stage)/g, '') // Keep "2nd Main" as core signal or strip it for very fuzzy lookups? Strip for pipeline.
      .replace(/\b(blore|bengaluru|bangalore|karnataka|ka)\b/g, '')
      .replace(/\d+/g, '') // Remove house numbers/plot numbers for fuzzy cluster seed
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  return normalized;
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
 * Metaphone Algorithm (Simplified version for compliance with Section 3)
 */
export const metaphone = (str: string): string => {
  if (!str) return '';
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return '';
  
  // Basic metaphone transformations as a proxy
  return s.replace(/[AEIOU]/g, '')
    .substring(0, 4);
};

export const jaroWinklerSimilarity = (s1: string, s2: string): number => {
  if (s1 === s2) return 1.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const matches1 = new Array(len1).fill(false);
  const matches2 = new Array(len2).fill(false);

  let m = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(len2, i + matchWindow + 1);
    for (let j = start; j < end; j++) {
      if (!matches2[j] && s1[i] === s2[j]) {
        matches1[i] = true;
        matches2[j] = true;
        m++;
        break;
      }
    }
  }

  if (m === 0) return 0.0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (matches1[i]) {
      while (!matches2[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
  }
  t /= 2;

  const jaro = (m / len1 + m / len2 + (m - t) / m) / 3;
  const p = 0.1;
  let l = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) l++;
    else break;
  }

  return jaro + l * p * (1 - jaro);
};

export const tokenSortRatio = (s1: string, s2: string): number => {
  const tokens1 = s1.split(' ').sort().join(' ');
  const tokens2 = s2.split(' ').sort().join(' ');
  return stringSimilarity(tokens1, tokens2);
};

/**
 * --- PASS 3: GEOSPATIAL CONFLICT RESOLUTION ---
 * Compute Haversine distance between two coordinates.
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * MapMath.DEG_TO_RAD;
  const dLon = (lon2 - lon1) * MapMath.DEG_TO_RAD;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * MapMath.DEG_TO_RAD) * Math.cos(lat2 * MapMath.DEG_TO_RAD) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const MapMath = {
  DEG_TO_RAD: Math.PI / 180
};

/**
 * Compares two records and returns a detailed match analysis based on KUBID Master Prompt rules.
 * Implements 3-Pass logic: Sovereign Anchor -> Phonetic/Normal -> Geospatial Penalty.
 */
export const compareRecords = (
  recordA: SourceRecord, 
  recordB: SourceRecord, 
  knowledge?: SystemKnowledge
) => {
  const createLinkageAudit = (verdict: string, confidence: number, explanation: string, nodes: Array<{node: string, status: 'PASS' | 'FAIL' | 'INCONCLUSIVE', score: number, reason: string}>): LogicAuditTrail => ({
    verdict,
    confidence,
    explanation,
    timestamp: new Date().toISOString(),
    engine_version: 'KUBID-v4.0-3PASS',
    logic_nodes: nodes
  });

  // --- PASS 1: SOVEREIGN ANCHOR MATCHING ---
  const panA = recordA.pan?.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const panB = recordB.pan?.replace(/[^A-Z0-9]/g, '').toUpperCase();
  const panMatch = panA && panB && panA === panB;

  const gstinA = (recordA.gstin && recordA.gstin !== 'Pending') ? recordA.gstin.toUpperCase() : null;
  const gstinB = (recordB.gstin && recordB.gstin !== 'Pending') ? recordB.gstin.toUpperCase() : null;
  
  // Extract PAN from GSTIN if missing (Section 3 Pass 1b)
  const extractedPanA = panA || (gstinA?.length === 15 ? gstinA.substring(2, 12) : null);
  const extractedPanB = panB || (gstinB?.length === 15 ? gstinB.substring(2, 12) : null);
  const pinMatch = recordA.pinCode === recordB.pinCode;
  const anchorMatch = extractedPanA && extractedPanB && extractedPanA === extractedPanB;

  if (anchorMatch) {
    return {
      score: 1.0,
      confidence: 1.0,
      verdict: 'AUTO_MERGE' as const,
      edge_case_flag: 'NONE' as const,
      reason_log: `PASS 1: Sovereign Anchor Match. Identical PAN detected.`,
      reasoning: createLinkageAudit('AUTO_MERGE', 1.0, `PASS 1: Sovereign Anchor Match. Identical PAN (${maskPAN(recordA.pan)}) detected across records from ${recordA.department} and ${recordB.department}.`, [
        { node: 'PAN Sovereignty', status: 'PASS', score: 1.0, reason: `Legal identity confirmed via PAN anchor: ${maskPAN(recordA.pan)}` }
      ]),
      reasons: ['Sovereign PAN Anchor Match'],
      riskFactors: [],
      ubid_suggestion: 'TARGET_UBID'
    };
  }

  // --- PASS 2: PHONETIC + STRUCTURAL NORMALIZATION ---
  const normNameA = normalizeString(recordA.businessName);
  const normNameB = normalizeString(recordB.businessName);
  const nameSim = stringSimilarity(normNameA, normNameB);
  const soundexA = soundex(normNameA);
  const soundexB = soundex(normNameB);
  const soundexMatch = soundexA === soundexB;
  
  const normAddrA = normalizationPipeline(recordA.address, 'ADDRESS');
  const normAddrB = normalizationPipeline(recordB.address, 'ADDRESS');
  const addressScore = stringSimilarity(normAddrA, normAddrB);

  // Section 3 Pass 2: pass2_score = (name_score * 0.60) + (address_score * 0.40)
  const jaroSim = jaroWinklerSimilarity(normNameA, normNameB);
  const tokenSim = tokenSortRatio(normNameA, normNameB);
  const pass2NameScore = (nameSim * 0.4) + (jaroSim * 0.3) + (tokenSim * 0.3); 
  const pass2Score = (pass2NameScore * 0.6) + (addressScore * 0.4);

  // Weights from System Config (Section 4 defaults if not provided)
  const W_anchor = knowledge?.config?.weights?.anchor ?? 0.60;
  const W_name = knowledge?.config?.weights?.name ?? 0.25;
  const W_geo = knowledge?.config?.weights?.geo ?? 0.15;

  // Section 3 Pass 3: Geospatial Conflict Resolution
  let latA = recordA.lat;
  let lngA = recordA.lng;
  let latB = recordB.lat;
  let lngB = recordB.lng;

  // If coordinates missing, use centroid lookup (Section 3)
  if (latA === undefined || lngA === undefined) {
    const cA = findCentroid(recordA.pinCode);
    if (cA) { latA = cA.lat; lngA = cA.lng; }
  }
  if (latB === undefined || lngB === undefined) {
    const cB = findCentroid(recordB.pinCode);
    if (cB) { latB = cB.lat; lngB = cB.lng; }
  }

  const hasGeo = latA !== undefined && lngA !== undefined && latB !== undefined && lngB !== undefined;
  let geoScore = 0;
  let distance = 0;

  if (hasGeo) {
    distance = calculateDistance(latA!, lngA!, latB!, lngB!);
    // Section 4: 1.0 if distance ≤ 1km, 0.5 if 1-5km, 0.0 if >5km
    if (distance <= 1) geoScore = 1.0;
    else if (distance <= 5) geoScore = 0.5;
    else geoScore = 0.0;
  }

  // Final Score calculation (Section 4)
  // Sc = (W_anchor * anchor_match) + (W_name * name_score) + (W_geo * geo_score)
  let finalConfidence = (0 * W_anchor) + (pass2Score * W_name) + (geoScore * W_geo);

  // Re-scale if no anchor is present to allow HITL for very strong fuzzy matches
  // Section 4 states HITL for Sc 0.70-0.95. AUTO-LINK Sc > 0.95.
  if (finalConfidence < 0.4 && pass2Score > 0.8) {
      // If we have a very strong name+address match but no anchor, boost to HITL range
      finalConfidence = (pass2Score * 0.75) + (geoScore * 0.2); 
  }

  // Section 3: If distance > 5km, PENALIZE score by multiplying by 0.6
  if (hasGeo && distance > 5) {
    finalConfidence *= 0.6;
  }

  // SPECIAL CASE: IDENTITY COLLISION HARD STOP (Section 3)
  const isDivergentPan = recordA.pan && recordB.pan && recordA.pan !== recordB.pan;
  const ownerMismatch = recordA.ownerName && recordB.ownerName && recordA.ownerName !== recordB.ownerName;
  
  // Section 3: If name_score > 0.90 BUT (owner_name_hash differs AND pincode differs)
  const isIdentityCollision = pass2NameScore > 0.90 && ((ownerMismatch && !pinMatch) || isDivergentPan);
  
  // Extra safety: if owner is different and address is different, even if pincode same, do NOT auto-merge
  if (ownerMismatch && addressScore < 0.5 && finalConfidence > 0.9) {
    finalConfidence = 0.85; // Force to HITL Review
  }
  if (isIdentityCollision) {
    return {
      score: 0.0,
      confidence: 0.0,
      verdict: 'IDENTITY_COLLISION' as const,
      edge_case_flag: 'NONE' as const,
      reason_log: `IDENTITY COLLISION: High similarity but PAN/Owner mismatch.`,
      reasoning: createLinkageAudit('IDENTITY_COLLISION', 0.0, `PASS 3: HARD STOP. High Name Similarity (${(pass2NameScore * 100).toFixed(1)}%) detected, but ${isDivergentPan ? `PANs mismatch (${maskPAN(recordA.pan)} vs ${maskPAN(recordB.pan)})` : 'Owner name and location both mismatch'}. This indicates a potential False Merge risk where separate entities share similar branding.`, [
        { node: 'Collision Guard', status: 'FAIL', score: 0.0, reason: isDivergentPan ? 'Critical Identification Mismatch (PAN divergence)' : 'Owner mismatch combined with Geospatial divergence' }
      ]),
      reasons: ['Identity Collision detected (High similarity, low integrity)'],
      riskFactors: ['High Risk of False Merge'],
      ubid_suggestion: 'NEW_GEN_REQUIRED'
    };
  }

  const nodes: LogicAuditTrail['logic_nodes'] = [
    { node: 'Name Similarity', status: nameSim > 0.85 ? 'PASS' : 'FAIL', score: nameSim, reason: `Similarity: ${(nameSim * 100).toFixed(1)}%` },
    { node: 'Phonetic Match', status: soundexMatch ? 'PASS' : 'FAIL', score: soundexMatch ? 1 : 0, reason: `Soundex: ${soundexA}` },
    { node: 'Geospatial Context', status: geoScore > 0 ? 'PASS' : 'FAIL', score: geoScore, reason: hasGeo ? `Distance: ${distance.toFixed(2)}km` : 'No coordinate data' }
  ];

  const decisionThresholdAuto = knowledge?.config?.thresholds?.autoLink ?? 0.95;
  const decisionThresholdHITL = knowledge?.config?.thresholds?.hitlReview ?? 0.70;

  let verdict: 'AUTO_MERGE' | 'HUMAN_REVIEW' | 'ORPHAN' = 'ORPHAN';
  if (finalConfidence >= decisionThresholdAuto) verdict = 'AUTO_MERGE';
  else if (finalConfidence >= decisionThresholdHITL) verdict = 'HUMAN_REVIEW';

  return {
    score: finalConfidence,
    confidence: finalConfidence,
    verdict,
    edge_case_flag: (hasGeo && distance > 5 && nameSim > 0.8) ? 'BRANCH_NODE' as const : 'NONE' as const,
    reason_log: `${verdict}: Aggregate Confidence ${(finalConfidence * 100).toFixed(0)}%. ${hasGeo ? `Distance ${distance.toFixed(1)}km` : ''}`,
    reasoning: createLinkageAudit(verdict, finalConfidence, `Multi-Pass Logic Synthesis: Final Decision ${verdict} based on weighted synthesis of factors. Name match is ${(nameSim * 100).toFixed(1)}% (${soundexMatch ? 'Phonetically identical' : 'Phonetically distinct'}). Address similarity: ${(addressScore * 100).toFixed(1)}%. Geospatial proximity: ${hasGeo ? `${distance.toFixed(2)}km` : 'unknown'}.`, nodes),
    reasons: [
      `Aggregate Confidence: ${(finalConfidence * 100).toFixed(0)}%`,
      hasGeo ? `Distance: ${distance.toFixed(1)}km` : 'No GPS coordinates'
    ],
    riskFactors: (hasGeo && distance > 5) ? ['High Geospatial Offset'] : [],
    ubid_suggestion: verdict === 'AUTO_MERGE' ? 'TARGET_UBID' : 'NEW_GEN_REQUIRED'
  };
};

