import { SourceRecord, UBIDRecord, SystemKnowledge } from '../types';
import { format, subMonths } from 'date-fns';
import { compareRecords, normalizeString } from './fuzzyMatchingService';

/**
 * Automatically link records based on confidence signals and anchoring rules.
 */
export const resolveUBIDs = (records: SourceRecord[], knowledge?: SystemKnowledge): UBIDRecord[] => {
  const registry: Map<string, UBIDRecord> = new Map();
  const internalRegistry: UBIDRecord[] = [];
  const linkedRecordIds = new Set<string>();

  // Check blacklist
  const isBlacklisted = (idA: string, idB: string) => {
    return knowledge?.manualBlacklist.some(b => 
      (b.recordIdA === idA && b.recordIdB === idB) || 
      (b.recordIdA === idB && b.recordIdB === idA)
    );
  };

  // 1. Primary Anchoring: GSTIN & PAN (Linear Pass)
  records.forEach(record => {
    const gstin = record.gstin && record.gstin !== 'Pending' ? record.gstin : null;
    const pan = record.pan || null;

    if (gstin || pan) {
      const gstinKey = gstin ? `KA-REG-G-${gstin}` : null;
      const panKey = pan ? `KA-REG-P-${pan}` : null;
      
      const targetKey = gstinKey || panKey!;
      let existing = registry.get(targetKey);

      // Conflict Check
      const hasConflict = existing?.linkedRecords.some(r => isBlacklisted(r.id, record.id));
      if (hasConflict) return;

      if (!existing) {
        existing = createBaseUBID(record, 'Central', gstin || pan!);
        registry.set(targetKey, existing);
      }
      
      existing.linkedRecords.push(record);
      linkedRecordIds.add(record.id);
      
      const matchType = gstin ? 'GSTIN Match' : 'PAN Match';
      if (!existing.evidence.includes(matchType)) {
        existing.evidence.push(`${matchType} (${record.department})`);
      }
    }
  });

  // 2. Secondary Linkage: Name + PinCode (Fuzzy groupings)
  records.forEach(record => {
    if (linkedRecordIds.has(record.id)) return;

    let bestMatch: UBIDRecord | null = null;
    let highestConfidence = 0.8; 

    // Performance: Filter by PIN before comparison
    const candidates = internalRegistry.filter(u => u.pinCode === record.pinCode);

    candidates.forEach(existingUbid => {
      const matchResult = compareRecords(existingUbid.linkedRecords[0], record, knowledge);
      if (matchResult.confidence > highestConfidence) {
        highestConfidence = matchResult.confidence;
        bestMatch = existingUbid;
      }
    });

    if (bestMatch) {
      bestMatch.linkedRecords.push(record);
      bestMatch.evidence.push(`Fuzzy Linkage (${record.department}, ${Math.floor(highestConfidence * 100)}% Conf)`);
    } else {
      const newUbid = createBaseUBID(record, 'Internal');
      internalRegistry.push(newUbid);
      newUbid.linkedRecords.push(record);
      newUbid.evidence.push(`Address/Name Anchor (${record.department})`);
    }
    linkedRecordIds.add(record.id);
  });

  return [...Array.from(registry.values()), ...internalRegistry];
};

/**
 * Alphabet for the entropy pool (34 chars, excluding O and I)
 */
const ENTROPY_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Alphabet for the Mod-36 checksum (36 chars)
 */
const MOD36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a deterministic 8-character string from the entropy pool based on an input seed.
 */
const generateEntropyString = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  
  let val = Math.abs(hash);
  let entropy = '';
  for (let i = 0; i < 8; i++) {
    entropy += ENTROPY_ALPHABET.charAt(val % ENTROPY_ALPHABET.length);
    val = Math.floor(val / ENTROPY_ALPHABET.length) + (i * 137); // Ensure variation
    if (val === 0) val = seed.length + i + 100;
  }
  return entropy.split('').reverse().join('');
};

/**
 * Calculates a Mod-36 checksum character for a given string.
 */
const calculateMod36Checksum = (input: string): string => {
  let sum = 0;
  const fullString = `KA${input}`;
  
  for (let i = 0; i < fullString.length; i++) {
    const char = fullString[i];
    const val = MOD36_ALPHABET.indexOf(char);
    // Simple weighted sum
    sum += (val === -1 ? 0 : val) * (i + 1);
  }
  
  return MOD36_ALPHABET.charAt(sum % 36);
};

/**
 * Generates the final UBID in the format KA-XXXXXXXX-C
 */
export const generateUnifiedBusinessIdentifier = (seed: string): string => {
  const entropy = generateEntropyString(seed);
  const checksum = calculateMod36Checksum(entropy);
  return `KA-${entropy}-${checksum}`;
};

const createBaseUBID = (record: SourceRecord, type: 'Central' | 'Internal', anchorId?: string): UBIDRecord => {
  // Use unique identifiers or business details as seed for deterministic generation
  const seed = anchorId || `${record.businessName}-${record.pinCode}-${record.ownerName}`;
  const ubid = generateUnifiedBusinessIdentifier(seed);
  
  return {
    ubid,
    anchorType: type,
    anchorId: anchorId,
    canonicalName: record.businessName,
    canonicalAddress: record.address,
    pinCode: record.pinCode,
    pan: record.pan,
    gstin: record.gstin,
    status: 'Active',
    confidence: type === 'Central' ? 0.99 : 0.75,
    riskScore: type === 'Central' ? 10 : 40,
    evidence: [],
    lastUpdated: format(new Date(), 'yyyy-MM-dd'),
    linkedRecords: []
  };
};
