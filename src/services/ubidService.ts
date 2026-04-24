import { SourceRecord, UBIDRecord, SystemKnowledge, ActivityEvent } from '../types';
import { format, subMonths } from 'date-fns';
import { compareRecords, normalizeString } from './fuzzyMatchingService';
import { inferBusinessStatus } from './statusInferenceService';

/**
 * --- UBID RESOLUTION ENGINE ---
 * This is the "Brain" of the system. 
 * It takes messy data from different departments and turns them into 
 * a single, clean Unified Business ID (UBID).
 */

/**
 * DYNAMIC ROLE ASSIGNMENT
 * Determines the topological role of a unit within a Parent-Child cluster.
 */
export const getUnitRole = (record: SourceRecord, parent?: UBIDRecord): string => {
  if (record.pan && record.gstin) return 'Primary Sovereign Node';
  if (record.pan) return 'Legal Identity Anchor';
  if (parent && record.pinCode !== parent.pinCode) return 'Regional Branch Office';
  if (record.gstin) return 'Fiscal Operational Node';
  if (record.tradeLicense || record.licenseId) return 'Local Establishment';
  return 'Administrative Trace';
};

/**
 * Automatically link records based on confidence signals and anchoring rules.
 * Workflow:
 * 1. Identify Strong Anchors (GSTIN/PAN) - 100% Certainty
 * 2. Identify Weak Signals (Name/Address) - Logic-based Probability
 * 3. Group into a Registry
 */
export const resolveUBIDs = (records: SourceRecord[], knowledge?: SystemKnowledge, events?: ActivityEvent[]): UBIDRecord[] => {
  const registry: Map<string, UBIDRecord> = new Map();
  const internalRegistry: UBIDRecord[] = [];
  
  // PRE-PROCESSING: Build a map for forced manual links
  const forcedLinks = new Map<string, string>();
  if (knowledge?.manualLinks) {
    knowledge.manualLinks.forEach(link => forcedLinks.set(link.recordId, link.ubid));
  }

  // RULE A: Avoid linking records that a human reviewer has explicitly marked as 'Not Same'
  const isBlacklisted = (idA: string, idB: string) => {
    return knowledge?.manualBlacklist.some(b => 
      (b.recordIdA === idA && b.recordIdB === idB) || 
      (b.recordIdA === idB && b.recordIdB === idA)
    );
  };

  /**
   * PHASE 1: PRIMARY ANCHORING & SIMILARITY CHECK
   */
  records.forEach(record => {
    try {
      let bestMatch: UBIDRecord | null = null;
      let highestConfidence = 0.0;
      
      // Check if this record has a mandated manual home
      const manualHomeUbid = forcedLinks.get(record.id);

      // RULE A1: THE ANCHOR RULE (PAN SOVEREIGNTY)
      // Master UBIDs roll up under the Sovereign PAN Anchor.
      if (record.pan) {
        const panUbid = Array.from(registry.values()).find(u => u.pan === record.pan);
        if (panUbid) {
          bestMatch = panUbid;
          highestConfidence = 1.0; // Anchor match is absolute certainty
        }
      }

      // RULE A2: AI CONFIDENCE THRESHOLD (>= 95%) 
      // Only merge if confidence is >= 95% (Hard constraint per v4.0)
      if (!bestMatch) {
         const mergeThreshold = 0.95; 

         const allExisting = Array.from(registry.values()).concat(internalRegistry);

         for (const existingUbid of allExisting) {
           if (manualHomeUbid === existingUbid.ubid) {
             bestMatch = existingUbid;
             highestConfidence = 1.0;
             break;
           }

           if (knowledge?.approvedAliases) {
             const hasAlias = knowledge.approvedAliases.some(a => 
               a.ubid === existingUbid.ubid && a.name === record.businessName && a.address === record.address
             );
             if (hasAlias) {
               bestMatch = existingUbid;
               highestConfidence = 1.0; // Trusted alias counts as anchor certainty
               break; 
             }
           }

           const hasConflict = existingUbid.linkedRecords.some(r => isBlacklisted(r.id, record.id));
           if (hasConflict) continue;

           // RULE A1.5: PAN SOVEREIGNTY GUARD
           // If both entities have a PAN and they are different, they MUST NOT match.
           if (record.pan && existingUbid.pan && record.pan !== existingUbid.pan) {
             continue;
           }

           if (existingUbid.linkedRecords.length === 0) continue;
           const matchResult = compareRecords(existingUbid.linkedRecords[0], record, knowledge);
           
           // Apply the 95% Master merge threshold
           if (matchResult.confidence >= mergeThreshold && matchResult.confidence > highestConfidence) {
             highestConfidence = matchResult.confidence;
             bestMatch = existingUbid;
           }
         }
      }

      // RULE B1: ORPHAN / LOW CONFIDENCE RULE
      // If confidence falls below 70%, it remains an Orphan (Internal ID)
      const orphanThreshold = 0.70;
      if (highestConfidence < orphanThreshold) {
        bestMatch = null; 
      }

      if (bestMatch) {
        bestMatch.linkedRecords.push(record);
        
        if (!bestMatch.legal_entity_pan && record.pan) {
          bestMatch.legal_entity_pan = record.pan;
          bestMatch.edgeCaseFlag = 'PARENT_CHILD';
        }

        if (bestMatch.linked_units) {
          bestMatch.linked_units.push({
            unit_id: record.gstin || record.id,
            type: record.department,
            unit_status: record.status.toUpperCase(),
            latest_signal: format(new Date(), 'yyyy-MM-dd'),
            role: getUnitRole(record, bestMatch)
          });
        }

        const matchType = highestConfidence >= 0.98 ? (record.pan === bestMatch.pan ? 'PAN Sovereign Link' : 'Legal Identity Match') : 
                       manualHomeUbid ? 'Manual Authority Linkage' :
                       'High-Confidence Cross-Factor Match';
        bestMatch.evidence.push(`${matchType} (${record.department}, ${Math.floor(highestConfidence * 100)}% Conf)`);
      
        if (record.activities) {
          const currentActivities = new Set(bestMatch.activities || []);
          record.activities.forEach(a => currentActivities.add(a));
          bestMatch.activities = Array.from(currentActivities);
        }

        const fullMatchResult = compareRecords(bestMatch.linkedRecords[0], record, knowledge);
        if (fullMatchResult.edge_case_flag && fullMatchResult.edge_case_flag !== 'NONE') {
          bestMatch.edgeCaseFlag = fullMatchResult.edge_case_flag as any;
        }

        const riskResult = calculateDynamicRisk(bestMatch);
        bestMatch.riskScore = riskResult.score;
        bestMatch.riskFactors = riskResult.factors;

        // KUBIP v4.0 STATUS CONSOLIDATION LOGIC
        // This is the operational source of truth.
        let operationalReasoning = '';
        if (events && events.length > 0) {
          const statusVerdict = inferBusinessStatus(bestMatch.ubid, events, 180, bestMatch.canonicalName);
          bestMatch.status = statusVerdict.status;
          operationalReasoning = statusVerdict.reasoning;
        } else {
          // Fallback to record-based consolidation if no event stream is available
          const statuses = bestMatch.linkedRecords.map(r => r.status.toUpperCase());
          if (statuses.includes('ACTIVE')) {
            bestMatch.status = 'ACTIVE';
            operationalReasoning = 'Status: ACTIVE. No real-time activity signals detected; status derived from current departmental registration record.';
          } else if (statuses.includes('DORMANT')) {
            bestMatch.status = 'DORMANT';
            operationalReasoning = 'Status: DORMANT. Inactivity inferred from aging departmental records.';
          } else {
            bestMatch.status = 'CLOSED';
            operationalReasoning = 'Status: CLOSED. Explicit closure signal from department source record.';
          }
        }

        bestMatch.score = bestMatch.confidence;
        // DO NOT overwrite with linkage logic; explicitly synthesize if needed.
        bestMatch.reasoning = operationalReasoning;
        bestMatch.linkageReasoning = fullMatchResult.reasoning;

        if (!bestMatch.gstin && record.gstin && record.gstin !== 'Pending') {
          bestMatch.gstin = record.gstin;
          bestMatch.anchorId = record.gstin;
          bestMatch.anchorType = 'Central';
          
          if (bestMatch.ubid.includes('KA-INT')) {
            const oldId = bestMatch.ubid;
            const promotedUbid = promoteUBID(oldId);
            bestMatch.ubid = promotedUbid; 
            if (!bestMatch.historicalIds) bestMatch.historicalIds = [];
            bestMatch.historicalIds.push(oldId);
            bestMatch.evidence.push(`ID PROMOTED: Upgraded from Provisional (${oldId}) to Permanent (${promotedUbid}) due to GSTIN discovery. Entropy preserved.`);
          }
        }
        if (!bestMatch.pan && record.pan) {
          bestMatch.pan = record.pan;
          if (bestMatch.ubid.includes('KA-INT')) {
            const oldId = bestMatch.ubid;
            const promotedUbid = promoteUBID(oldId);
            bestMatch.ubid = promotedUbid;
            bestMatch.anchorType = 'Central';
            if (!bestMatch.historicalIds) bestMatch.historicalIds = [];
            bestMatch.historicalIds.push(oldId);
            bestMatch.evidence.push(`ID PROMOTED: Upgraded from Provisional (${oldId}) to Permanent (${promotedUbid}) due to PAN discovery. Entropy preserved.`);
          }
        }
        if (!bestMatch.tradeLicense && record.tradeLicense) {
          bestMatch.tradeLicense = record.tradeLicense;
        }
      } else {
        const isProvisional = !record.pan && !record.gstin;
        const anchorType = isProvisional ? 'Internal' : 'Central';
        const anchorValue = (record.gstin && record.gstin !== 'Pending') ? record.gstin : (record.pan || undefined);
        
        const newUbid = createBaseUBID(record, anchorType, anchorValue);
        
        if (manualHomeUbid) {
          newUbid.ubid = manualHomeUbid;
          newUbid.evidence.push(`Root Establishment via Manual Authority`);
        }

        if (anchorType === 'Central' && anchorValue) {
          registry.set(`KEY-${anchorValue}`, newUbid);
        } else {
          internalRegistry.push(newUbid);
        }
        
        if (highestConfidence >= 0.7 && highestConfidence < 0.95) {
          newUbid.evidence.push(`Fuzzy Identity: Record matches existing node at ${Math.floor(highestConfidence * 100)}% confidence, but falls below Master Threshold (95%). Assigned new provisional identity.`);
          newUbid.verdict = 'HUMAN_REVIEW';
          newUbid.edgeCaseFlag = 'NONE';
        } else if (highestConfidence > 0 && highestConfidence < 0.7) {
          newUbid.evidence.push(`Orphan Rule Applied: Low match confidence (${Math.floor(highestConfidence * 100)}%) with existing nodes. Treated as new orphan.`);
          newUbid.verdict = 'ORPHAN';
          newUbid.edgeCaseFlag = 'NONE';
        } else {
          newUbid.evidence.push(`Initial Entry (${record.department}) - Unique Anchor.`);
        }
      }
    } catch (e) {
      console.error(`Linkage Engine failure on record ${record.id} during PHASE 1:`, e);
    }
  });

  const results = [...Array.from(registry.values()), ...internalRegistry];
  
  const uniqueRegistry: Map<string, UBIDRecord> = new Map();
  results.forEach(u => {
    const existing = uniqueRegistry.get(u.ubid);
    if (existing) {
      existing.linkedRecords.push(...u.linkedRecords);
      // Merge linked_units correctly without duplicates
      if (u.linked_units) {
        const existingIds = new Set(existing.linked_units.map(lu => lu.unit_id));
        u.linked_units.forEach(lu => {
          if (!existingIds.has(lu.unit_id)) {
            existing.linked_units.push(lu);
          }
        });
      }
      u.evidence.forEach(e => {
        if (!existing.evidence.includes(e)) existing.evidence.push(e);
      });
      if (u.activities) {
        existing.activities = Array.from(new Set([...(existing.activities || []), ...u.activities]));
      }
      existing.confidence = Math.max(existing.confidence, u.confidence);
      existing.score = existing.confidence;
      existing.riskScore = Math.max(existing.riskScore, u.riskScore);
      
      // Re-reconcile status
      if (events && events.length > 0) {
        const statusVerdict = inferBusinessStatus(existing.ubid, events, 180, existing.canonicalName);
        existing.status = statusVerdict.status;
        existing.reasoning = statusVerdict.reasoning;
      } else {
        const statuses = existing.linkedRecords.map(r => r.status.toUpperCase());
        if (statuses.includes('ACTIVE')) {
          existing.status = 'ACTIVE';
          existing.reasoning = 'Status: ACTIVE. Derived from departmental registration - no operational signals detected.';
        } else if (statuses.includes('DORMANT')) {
          existing.status = 'DORMANT';
          existing.reasoning = 'Status: DORMANT. Inferred from aging departmental records.';
        } else {
          existing.status = 'CLOSED';
          existing.reasoning = 'Status: CLOSED. Inferred from closure signals in original source records.';
        }
      }
    } else {
      uniqueRegistry.set(u.ubid, u);
    }
  });

  return Array.from(uniqueRegistry.values());
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
 * REINFORCEMENT LEARNING ENGINE:
 * Adjusts system weights based on manual administrative actions.
 * If an admin approves a match despite low name similarity, the system 
 * learns to trust other factors (address/pincode) more for that cluster archetype.
 */
export const adjustSystemWeights = (knowledge: SystemKnowledge, action: 'Approved' | 'Rejected', recordA: SourceRecord, recordB: SourceRecord): SystemKnowledge => {
  const newWeights = { ...knowledge.learnedWeights };
  const learningRate = 0.05;

  const simResult = compareRecords(recordA, recordB);
  
  if (action === 'Approved') {
    // If approved but name was different, decrease name weight slightly
    if (simResult.confidence < 0.9 && simResult.reasons.some(r => r.includes('Name'))) {
      newWeights.nameWeight = Math.max(0.1, newWeights.nameWeight - learningRate);
      newWeights.addressWeight += learningRate / 2;
    }
  } else {
    // If rejected but identifiers matched, the system was too aggressive with anchors
    if (simResult.confidence > 0.8) {
      newWeights.nameWeight = Math.min(0.9, newWeights.nameWeight + learningRate);
    }
  }

  return {
    ...knowledge,
    learnedWeights: newWeights
  };
};

/**
 * Generates a deterministic 8-character string from the entropy pool based on an input seed.
 */
const generateEntropyString = (seed: string): string => {
  // More robust FNV-1a style hash for better distribution
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  
  // Use bitwise rotation and XOR to spread bits before entropy extraction
  let h1 = hash >>> 0;
  let h2 = (h1 ^ (h1 >>> 16)) >>> 0;
  
  let entropy = '';
  // Mix seed length to reduce collision of short similar strings
  let mix = seed.length;
  
  // Strictly enforce 8 characters of entropy
  for (let i = 0; i < 8; i++) {
    const charIndex = Math.abs(h2 + mix) % ENTROPY_ALPHABET.length;
    entropy += ENTROPY_ALPHABET.charAt(charIndex);
    
    // Scramble for next character
    mix = (mix * 31 + i) >>> 0;
    h2 = ((h2 >>> 3) | (h2 << 29)) ^ mix;
  }
  
  // Emergency fallback check to ensure 100% compliance with XXXXXXXX segment length
  if (entropy.length !== 8) {
    return (entropy.padEnd(8, 'X')).substring(0, 8);
  }
  
  return entropy;
};

/**
 * Calculates a Mod-36 checksum character for the entropy string.
 * This ensures the checksum stays stable even if the ID is promoted (prefix changes).
 */
const calculateMod36Checksum = (entropy: string): string => {
  let sum = 0;
  
  for (let i = 0; i < entropy.length; i++) {
    const char = entropy[i];
    const val = MOD36_ALPHABET.indexOf(char);
    // Weighted sum based on entropy position
    sum += (val === -1 ? 0 : val) * (i + 1);
  }
  
  return MOD36_ALPHABET.charAt(sum % 36);
};

/**
 * Promotes a provisional (KA-INT) ID to a permanent (KA) ID while preserving the entropy string and checksum.
 */
export const promoteUBID = (id: string): string => {
  if (!id.includes('KA-INT')) return id;
  
  // Extract entropy (the 8-char block after KA-INT-)
  // Format: KA-INT-XXXXXXXX-C
  const parts = id.split('-');
  if (parts.length < 4) return id; 
  
  const entropy = parts[2];
  const checksum = parts[3]; // Checksum stays the same because it's based on entropy
  
  return `KA-${entropy}-${checksum}`;
};

/**
 * Generates the final UBID in the format KA-XXXXXXXX-C or KA-INT-XXXXXXXX-C
 */
export const generateUnifiedBusinessIdentifier = (seed: string, isProvisional: boolean = false): string => {
  const prefix = isProvisional ? 'KA-INT' : 'KA';
  const entropy = generateEntropyString(seed);
  const checksum = calculateMod36Checksum(entropy);
  return `${prefix}-${entropy}-${checksum}`;
};

/**
 * DYNAMIC RISK ENGINE
 * Evaluates the integrity and operational consistency of a UBID.
 */
const calculateDynamicRisk = (ubid: UBIDRecord): { score: number; factors: string[] } => {
  let score = 0;
  const factors: string[] = [];

  // 1. Status Drift Check
  const uniqueStatuses = new Set(ubid.linkedRecords.map(r => r.status));
  if (uniqueStatuses.size > 1) {
    score += 25;
    factors.push('Departmental Status Drift detected');
  }

  // 2. Identity Consistency Check
  const owners = ubid.linkedRecords.map(r => normalizeString(r.ownerName || 'UNKNOWN'));
  const uniqueOwners = new Set(owners);
  if (uniqueOwners.size > 1 && !ubid.ubid.includes('KA-INT')) {
    score += 15;
    factors.push('Consolidated Ownership discrepancy');
  }

  // 3. Anchor Health
  if (!ubid.pan && !ubid.gstin) {
    score += 20;
    factors.push('Missing high-integrity Legal Anchors (PAN/GSTIN)');
  }

  // 4. Complexity Weight
  if (ubid.edgeCaseFlag === 'MULTI_VERTICAL') {
    score += 10;
    factors.push('Multi-Vertical operational complexity');
  }
  if (ubid.edgeCaseFlag === 'BRANCH_NODE') {
    score += 5;
    factors.push('Geospatial branching detected');
  }
  if (ubid.edgeCaseFlag === 'MULTI_BUSINESS') {
    score += 15;
    factors.push('Ownership overlap (Multi-Business)');
  }

  // 5. Signal Recency
  const lastUpdateMonths = (Date.now() - new Date(ubid.lastUpdated).getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (lastUpdateMonths > 6) {
    score += Math.min(25, lastUpdateMonths * 2);
    factors.push(`Stale signal data (> ${Math.floor(lastUpdateMonths)} months)`);
  }

  return { 
    score: Math.min(100, Math.max(5, score)), 
    factors 
  };
};

export const createBaseUBID = (record: SourceRecord, type: 'Central' | 'Internal' = 'Internal', anchorId?: string): UBIDRecord => {
  // Use unique identifiers or business details as seed for deterministic generation
  const seed = anchorId || `${record.businessName}-${record.pinCode}-${record.ownerName}`;
  const isProvisional = !record.pan && !record.gstin;
  const ubid = generateUnifiedBusinessIdentifier(seed, isProvisional);
  
  const statusValue = record.status === 'UNKNOWN' ? 'ACTIVE' : (record.status.toUpperCase() as 'ACTIVE' | 'DORMANT' | 'CLOSED');
  const confidenceValue = isProvisional ? 0.65 : 0.99; // Internal IDs start below Master threshold

  const base: UBIDRecord = {
    ubid,
    legal_entity_pan: record.pan,
    score: confidenceValue,
    confidence: confidenceValue,
    confidence_metadata: {
      anchor: isProvisional ? (record.tradeLicense ? 'Trade License' : 'Internal Registry') : (record.gstin ? 'GSTIN' : 'PAN'),
      fuzzy: isProvisional ? 'Provisional entry - awaiting sovereign anchor' : 'Sovereign anchor established'
    },
    verdict: isProvisional ? 'HUMAN_REVIEW' : 'AUTO_MERGE',
    status: statusValue,
    edgeCaseFlag: isProvisional ? 'NONE' : (record.pan ? 'PARENT_CHILD' : 'NONE'),
    reasoning: isProvisional 
      ? `Provisional identity created. Record lacks Sovereign PAN/GSTIN anchor or match confidence was < 95%. Scheduled for Human Intervention.`
      : `Master identity anchored via ${record.gstin ? 'GSTIN' : 'PAN'}. Certainty level high (v4.0 Sovereign Anchor).`,
    linkageReasoning: isProvisional 
      ? 'Identity established via departmental registration (Provisional).'
      : `Identity anchored via ${record.gstin ? 'GSTIN' : 'PAN'} (Sovereign).`,
    ui_metadata: { label: 'Synthetic Data', color: '#00008B' },
    
    anchorType: isProvisional ? 'Internal' : 'Central',
    anchorId: anchorId,
    canonicalName: record.businessName,
    canonicalAddress: record.address,
    pinCode: record.pinCode,
    pan: record.pan,
    gstin: record.gstin,
    tradeLicense: record.tradeLicense,
    activities: record.activities || [],
    confidenceRecord: confidenceValue,
    riskScore: 0, // Will be updated immediately
    evidence: [`Initial Entry (${record.department})`],
    lastUpdated: format(new Date(), 'yyyy-MM-dd'),
    linkedRecords: [record],
    linked_units: [
      {
        unit_id: record.gstin || record.id,
        type: record.department,
        unit_status: record.status.toUpperCase(),
        latest_signal: format(new Date(), 'yyyy-MM-dd'),
        role: getUnitRole(record)
      }
    ]
  };

  const riskResult = calculateDynamicRisk(base);
  base.riskScore = riskResult.score;
  base.riskFactors = riskResult.factors;
  return base;
};
