import { SourceRecord, UBIDRecord, SystemKnowledge, ActivityEvent, MatchSuggestion } from '../types';
import { format, subMonths } from 'date-fns';
import { compareRecords, normalizeString, normalizationPipeline } from './fuzzyMatchingService';
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
  // If we have a parent context, evaluate the Parent-Child relationship
  if (parent) {
     if (record.pan && parent.pan && parent.pan === record.pan) {
        if (record.gstin && parent.gstin && record.gstin !== parent.gstin) {
           return 'Divergent Branch / Fiscal Node';
        }
        if (record.pinCode && parent.pinCode && record.pinCode !== parent.pinCode) {
           return 'Regional Branch Office';
        }
        return 'Local Subsidiary / Unit';
     }
  }
  
  if (record.pan && record.gstin) return 'Primary Sovereign Node';
  if (record.pan) return 'Legal Identity Anchor';
  if (parent && record.pinCode !== parent.pinCode) return 'Regional Branch Office';
  if (record.gstin) return 'Fiscal Operational Node';
  if (record.tradeLicense || record.licenseId) return 'Local Establishment';
  return 'Administrative Trace';
};

export interface ResolutionResult {
  ubids: UBIDRecord[];
  suggestions: MatchSuggestion[];
}

/**
 * Automatically link records based on confidence signals and anchoring rules.
 * Workflow:
 * 1. Identify Strong Anchors (GSTIN/PAN) - 100% Certainty
 * 2. Identify Weak Signals (Name/Address) - Logic-based Probability
 * 3. Group into a Registry
 */
export const resolveUBIDs = (records: SourceRecord[], knowledge?: SystemKnowledge, events?: ActivityEvent[]): ResolutionResult => {
  const registry: Map<string, UBIDRecord> = new Map();
  const internalRegistry: UBIDRecord[] = [];
  const suggestions: MatchSuggestion[] = [];
  
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
      // RULE: Extract PAN from GSTIN if PAN is missing
      if (!record.pan && record.gstin && record.gstin.length >= 15 && record.gstin !== 'Pending') {
        record.pan = record.gstin.substring(2, 12).toUpperCase();
      }

      let bestMatch: UBIDRecord | null = null;
      let highestConfidence = 0.0;
      let bestBestMatchData: { ubid: UBIDRecord, confidence: number, result: any } | null = null;
      
      // Check if this record has a mandated manual home
      const manualHomeUbid = forcedLinks.get(record.id);

      // RULE A1: THE ANCHOR RULE (PAN SOVEREIGNTY)
      // Section 7 Edge Case 1: Same PAN but different GSTIN = Parent/Child (Group), NOT same UBID.
      // Section 8 Rule 1: Always use hashed representation for comparison
      const hashedPan = record.pan ? maskPII(record.pan) : undefined;
      const hashedGstin = (record.gstin && record.gstin !== 'Pending') ? maskPII(record.gstin) : undefined;

      if (hashedPan) {
        const panMatch = Array.from(registry.values()).find(u => u.pan === hashedPan);
        if (panMatch) {
          // If GSTINs match or one is missing, they are the same legal entity/branch
          const gstinMatch = !hashedGstin || !panMatch.gstin || panMatch.gstin === 'Pending' || panMatch.gstin === hashedGstin;
          
          if (gstinMatch) {
            bestMatch = panMatch;
            highestConfidence = 1.0; 
          } else {
            // Section 7 Edge Case 1: Different GSTIN but same PAN -> Parent-Child / Group Structure
            // We create a new UBID but link them via Group ID
            const groupId = panMatch.groupId || `GRP-${panMatch.ubid.split('-').pop()}`;
            panMatch.groupId = groupId;
            panMatch.relationship = 'PARENT';
            // bestMatch remains null so a new UBID is created for this distinct GSTIN node
          }
        }
      }

      // RULE A2: AI CONFIDENCE THRESHOLD (>= 95%) 
      // v4.1 Update: Capturing suggestions for Review Queue
      if (!bestMatch) {
         const mergeThreshold = knowledge?.config?.thresholds?.autoLink ?? 0.95; 
         const hitlThreshold = knowledge?.config?.thresholds?.hitlReview ?? 0.70;

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
           const matchResult = existingUbid.linkedRecords.length > 0 
             ? compareRecords(existingUbid.linkedRecords[0], record, knowledge)
             : { confidence: 0, verdict: 'REGISTRY_HOLD', score: 0 } as any;

           if (record.pan && existingUbid.pan && record.pan !== existingUbid.pan) {
             if (matchResult.verdict === 'IDENTITY_COLLISION' || matchResult.isIdentityCollision) {
                // Section 3: Identity Collision HARD STOP. 
                // Do not auto-link. Generate suggestion for Review Queue instead.
                suggestions.push({
                   id: `SUG-COLL-${record.id}-${existingUbid.ubid}`,
                   recordA: existingUbid.linkedRecords[0],
                   recordB: record,
                   confidence: matchResult.confidence,
                   reasons: [`CRITICAL: Name similarity high but PANs mismatch.`],
                   verdict: 'IDENTITY_COLLISION',
                   edgeCaseFlag: 'IDENTITY_COLLISION',
                   status: 'Pending',
                   priority: 'High',
                   details: matchResult.reasoning,
                   reason_log: matchResult.reason_log
                });
                
                existingUbid.edgeCaseFlag = 'IDENTITY_COLLISION';
                existingUbid.verdict = 'HUMAN_REVIEW';
                existingUbid.evidence.push(`CRITICAL: Identity Collision detected with ${record.businessName} (${record.id}). Different PANs found for similar entity profile.`);
             }
             continue;
           }
           
           // Apply threshold logic
           if (matchResult.confidence >= hitlThreshold && matchResult.confidence > highestConfidence) {
             highestConfidence = matchResult.confidence;
             bestBestMatchData = {
               ubid: existingUbid,
               confidence: matchResult.confidence,
               result: matchResult
             };
           }
         }

         if (bestBestMatchData) {
            if (bestBestMatchData.confidence >= mergeThreshold) {
              const u = bestBestMatchData.ubid;
              const res = bestBestMatchData.result;
              
              const isSameDept = u.linkedRecords.some(r => r.department === record.department);
              if (isSameDept && res.confidence > 0.90) {
                 highestConfidence = 0.85; 
                 bestMatch = null; 
                 suggestions.push({
                   id: `SUG-DUP-${record.id}-${u.ubid}`,
                   recordA: u.linkedRecords[0],
                   recordB: record,
                   confidence: 0.85,
                   reasons: [`Possible Intra-Department Duplicate: Same department (${record.department}) and high similarity.`],
                   verdict: 'HUMAN_REVIEW',
                   edgeCaseFlag: 'INTRA_DEPT_DUPLICATE',
                   status: 'Pending',
                   reason_log: `Intra-Department Duplicate: Same department and high similarity.`
                 });
              } else {
                 highestConfidence = bestBestMatchData.confidence;
                 bestMatch = bestBestMatchData.ubid;
              }
            } else if (bestBestMatchData.confidence >= hitlThreshold) {
              suggestions.push({
                id: `SUG-HITL-${record.id}-${bestBestMatchData.ubid.ubid}`,
                recordA: bestBestMatchData.ubid.linkedRecords[0],
                recordB: record,
                confidence: bestBestMatchData.confidence,
                reasons: [`Ambiguous Match: ${Math.floor(bestBestMatchData.confidence * 100)}% similarity.`],
                verdict: 'HUMAN_REVIEW',
                status: 'Pending',
                details: bestBestMatchData.result.reasoning,
                reason_log: bestBestMatchData.result.reason_log
              });
              bestMatch = null;
              highestConfidence = bestBestMatchData.confidence;
            }
         }
       }

       // RULE B1: ORPHAN / LOW CONFIDENCE RULE
      // If confidence falls below 70%, it remains an Orphan (Internal ID)
      const orphanThreshold = knowledge?.config?.thresholds?.hitlReview ?? 0.70;
      if (highestConfidence < orphanThreshold) {
        bestMatch = null; 
      }

      if (bestMatch) {
        if (!bestMatch.linkedRecords.some(r => r.id === record.id)) {
          bestMatch.linkedRecords.push(record);
        }
        
        if (!bestMatch.legal_entity_pan && record.pan) {
          bestMatch.legal_entity_pan = record.pan;
          bestMatch.edgeCaseFlag = 'PARENT_CHILD';
        } else if (bestMatch.pan && record.pan && bestMatch.pan === record.pan) {
           if (bestMatch.gstin && record.gstin && bestMatch.gstin !== record.gstin) {
              bestMatch.edgeCaseFlag = 'MULTI_BUSINESS';
           } else if (bestMatch.pinCode && record.pinCode && bestMatch.pinCode !== record.pinCode) {
              bestMatch.edgeCaseFlag = 'BRANCH_NODE';
           } else {
              bestMatch.edgeCaseFlag = 'PARENT_CHILD';
           }
        }

        // Section 7, Edge Case 2: Intra-Department Duplicates
        const intraDeptMatch = bestMatch.linkedRecords.find(r => r.department === record.department);
        if (intraDeptMatch) {
          const matchResult = compareRecords(intraDeptMatch, record, knowledge);
          if (matchResult.score > 0.90 && intraDeptMatch.pinCode === record.pinCode) {
            bestMatch.edgeCaseFlag = 'INTRA_DEPT_DUPLICATE';
          }
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
        let operationalReasoning: string | any = '';
        if (events && events.length > 0) {
          const statusVerdict = inferBusinessStatus(bestMatch.ubid, events, 180, bestMatch.canonicalName, record.department, knowledge?.config, bestMatch);
          bestMatch.status = statusVerdict.status;
          operationalReasoning = statusVerdict.reasoning;
          if (statusVerdict.status === 'CLOSED') {
            bestMatch.edgeCaseFlag = 'ZOMBIE_STATE';
          }
          if (statusVerdict.logic_trace) {
            const anchorName = record.gstin && record.gstin.length >= 15 ? 'GSTIN (digits 3-12)' : (record.pan ? 'PAN' : 'None');
            statusVerdict.logic_trace.anchor_found = anchorName;
            bestMatch.logic_trace = statusVerdict.logic_trace;
          }
        } else {
          // Fallback to record-based consolidation if no event stream is available
          const statuses = bestMatch.linkedRecords.map(r => r.status.toUpperCase());
          
          let derivedVerdict = 'CLOSED';
          let threshold = 'DEFAULT_REGISTRATION';
          if (statuses.includes('ACTIVE')) {
            bestMatch.status = 'ACTIVE';
            derivedVerdict = 'ACTIVE';
            operationalReasoning = 'Status: ACTIVE. No real-time activity signals detected; status derived from current departmental registration record.';
          } else if (statuses.includes('DORMANT')) {
            bestMatch.status = 'DORMANT';
            derivedVerdict = 'DORMANT';
            operationalReasoning = 'Status: DORMANT. Inactivity inferred from aging departmental records.';
          } else {
            bestMatch.status = 'CLOSED';
            derivedVerdict = 'CLOSED';
            operationalReasoning = 'Status: CLOSED. Explicit closure signal from department source record.';
          }

          bestMatch.logic_trace = {
            anchor_found: record.gstin && record.gstin.length >= 15 ? 'GSTIN (digits 3-12)' : (record.pan ? 'PAN' : 'None'),
            days_inactive: 0,
            threshold_applied: threshold,
            verdict: derivedVerdict
          };
        }

        bestMatch.score = bestMatch.confidence;
        // DO NOT overwrite with linkage logic; explicitly synthesize if needed.
        bestMatch.reasoning = operationalReasoning;
        bestMatch.linkageReasoning = fullMatchResult.reasoning;

        if (!bestMatch.gstin && record.gstin && record.gstin !== 'Pending') {
          bestMatch.gstin = maskPII(record.gstin);
          if (!bestMatch.pan) {
             bestMatch.anchorId = maskPII(record.gstin) || 'UNKNOWN';
             bestMatch.anchorType = 'Central';
          }
          
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
          bestMatch.pan = maskPII(record.pan);
          bestMatch.anchorId = maskPII(record.pan) || 'UNKNOWN';
          bestMatch.anchorType = 'Central';
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
        const isProvisional = !record.pan && (!record.gstin || record.gstin === 'Pending');
        const anchorType = isProvisional ? 'Internal' : 'Central';
        const anchorValue = record.pan ? record.pan : undefined;
        
        const newUbid = createBaseUBID(record, anchorType, anchorValue);
        
        // Section 7 Edge Case 1: Attach Group info if this was a divergent GSTIN node
        if (record.pan) {
          const panMatch = Array.from(registry.values()).find(u => u.pan === record.pan && u.ubid !== newUbid.ubid);
          if (panMatch && panMatch.groupId) {
             newUbid.groupId = panMatch.groupId;
             newUbid.relationship = 'SUBSIDIARY';
             newUbid.evidence.push(`Linked to Parent Entity (Same PAN, Different GSTIN). Group: ${panMatch.groupId}`);
          }
        }

        if (manualHomeUbid) {
          newUbid.ubid = manualHomeUbid;
          newUbid.evidence.push(`Root Establishment via Manual Authority`);
        }

        if (anchorType === 'Central' && anchorValue) {
          registry.set(`KEY-${anchorValue}`, newUbid);
        } else {
          const existingInternal = internalRegistry.find(u => u.ubid === newUbid.ubid);
          if (existingInternal) {
            // Unify linked records if same ID generated
            newUbid.linkedRecords.forEach(lr => {
              if (!existingInternal.linkedRecords.some(er => er.id === lr.id)) {
                existingInternal.linkedRecords.push(lr);
              }
            });
          } else {
            internalRegistry.push(newUbid);
          }
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
  
  // PHASE 3: UNLINKED EVENT DISCOVERY & HITL ROUTING
  // Section 6 & 7: Identify events that couldn't be joined and route to suggestions
  if (events && events.length > 0) {
    events.forEach(event => {
      // Check if event is linked to any UBID in results
      const isLinked = results.some(u => 
        u.ubid === event.ubid || 
        u.linkedRecords.some(r => r.id === event.raw_record_id)
      );

      if (!isLinked) {
        // Search for potential UBID matches based on hints
        if (event.businessNameHint) {
          const pseudoRecord: SourceRecord = {
            id: event.id,
            department: event.department,
            businessName: event.businessNameHint,
            address: event.addressHint || '',
            pinCode: event.pinCodeHint || '',
            ownerName: 'Activity Signal Hint',
            status: 'ACTIVE'
          };

          for (const ubid of results) {
            const comparison = compareRecords(ubid.linkedRecords[0], pseudoRecord, knowledge);
            if (comparison.confidence >= (knowledge?.config?.thresholds?.hitlReview ?? 0.70)) {
              suggestions.push({
                id: `SUG-UNLINKED-${event.id}-${ubid.ubid}`,
                recordA: ubid.linkedRecords[0],
                recordB: pseudoRecord,
                confidence: comparison.confidence,
                reasons: [`Unlinked Event: ${event.eventType} matched existing node at ${Math.floor(comparison.confidence * 100)}% certainty via hints.`],
                verdict: 'HUMAN_REVIEW',
                edgeCaseFlag: 'UNLINKED_EVENT',
                status: 'Pending',
                details: `Digital Signal: ${event.eventType} from ${event.department} on ${event.date}. Details: ${event.details}`
              });
            }
          }
        }
      }
    });
  }

  const uniqueRegistry: Map<string, UBIDRecord> = new Map();
  results.forEach(u => {
    const existing = uniqueRegistry.get(u.ubid);
    if (existing) {
      u.linkedRecords.forEach(r => {
        if (!existing.linkedRecords.some(er => er.id === r.id)) {
          existing.linkedRecords.push(r);
        }
      });
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
        const sectorHint = existing.linkedRecords.length > 0 ? existing.linkedRecords[0].department : undefined;
        const statusVerdict = inferBusinessStatus(existing.ubid, events, 180, existing.canonicalName, sectorHint, knowledge?.config, existing);
        existing.status = statusVerdict.status;
        existing.reasoning = statusVerdict.reasoning;
        if (statusVerdict.status === 'CLOSED') {
          existing.edgeCaseFlag = 'ZOMBIE_STATE';
        }
        if (statusVerdict.logic_trace) {
           const anchorName = existing.gstin && existing.gstin.length >= 15 ? 'GSTIN (digits 3-12)' : (existing.pan ? 'PAN' : 'None');
           statusVerdict.logic_trace.anchor_found = anchorName;
           existing.logic_trace = statusVerdict.logic_trace;
        }
      } else {
        const statuses = existing.linkedRecords.map(r => r.status.toUpperCase());
        
        let derivedVerdict = 'CLOSED';
        let threshold = 'DEFAULT_REGISTRATION';
        if (statuses.includes('ACTIVE')) {
          existing.status = 'ACTIVE';
          derivedVerdict = 'ACTIVE';
          existing.reasoning = 'Status: ACTIVE. Derived from departmental registration - no operational signals detected.';
        } else if (statuses.includes('DORMANT')) {
          existing.status = 'DORMANT';
          derivedVerdict = 'DORMANT';
          existing.reasoning = 'Status: DORMANT. Inferred from aging departmental records.';
        } else {
          existing.status = 'CLOSED';
          derivedVerdict = 'CLOSED';
          existing.reasoning = 'Status: CLOSED. Inferred from closure signals in original source records.';
        }

        existing.logic_trace = {
           anchor_found: existing.gstin && existing.gstin.length >= 15 ? 'GSTIN (digits 3-12)' : (existing.pan ? 'PAN' : 'None'),
           days_inactive: 0,
           threshold_applied: threshold,
           verdict: derivedVerdict
        };
      }
    } else {
      uniqueRegistry.set(u.ubid, u);
    }
  });

  // PHASE 2: CONSOLIDATE GROUP HIERARCHIES (Parent-Child)
  // Section 7, Edge Case 1: Detect entities sharing PAN but having different GSTINs
  const finalResults = Array.from(uniqueRegistry.values());
  const panGroups: Record<string, UBIDRecord[]> = {};

  finalResults.forEach(u => {
    if (u.pan && u.pan !== 'UNKNOWN') {
      if (!panGroups[u.pan]) panGroups[u.pan] = [];
      panGroups[u.pan].push(u);
    }
  });

  Object.entries(panGroups).forEach(([pan, groupUbids]) => {
    if (groupUbids.length > 1) {
      // We found a group!
      const groupId = `GRP-${pan.split('-').pop()}`;
      
      // Determine a potential parent (one with most records or first one)
      const sortedByWeight = [...groupUbids].sort((a, b) => b.linkedRecords.length - a.linkedRecords.length);
      const parent = sortedByWeight[0];
      
      groupUbids.forEach(u => {
        u.groupId = groupId;
        if (u === parent) {
          u.relationship = 'PARENT';
        } else {
          u.relationship = 'SUBSIDIARY';
          u.edgeCaseFlag = 'BRANCH_NODE';
          if (!u.evidence.includes(`Linked to Corporate Group: ${groupId}`)) {
            u.evidence.push(`Linked to Corporate Group: ${groupId} (via Shared PAN Anchor)`);
          }
        }
      });
    }
  });

  return {
    ubids: finalResults,
    suggestions
  };
};


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
 * SHA-256 implementation (Simplified for entropy purposes but cryptographically derived)
 */
export const sha256 = (s: string) => {
  const chrsz = 8;
  const hexcase = 0;
  const safe_add = (x: number, y: number) => {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  };
  const S = (X: number, n: number) => (X >>> n) | (X << (32 - n));
  const R = (X: number, n: number) => (X >>> n);
  const Ch = (x: number, y: number, z: number) => ((x & y) ^ ((~x) & z));
  const Maj = (x: number, y: number, z: number) => ((x & y) ^ (x & z) ^ (y & z));
  const Sigma0256 = (x: number) => (S(x, 2) ^ S(x, 13) ^ S(x, 22));
  const Sigma1256 = (x: number) => (S(x, 6) ^ S(x, 11) ^ S(x, 25));
  const Gamma0256 = (x: number) => (S(x, 7) ^ S(x, 18) ^ R(x, 3));
  const Gamma1256 = (x: number) => (S(x, 17) ^ S(x, 19) ^ R(x, 10));

  const core_sha256 = (m: number[], l: number) => {
    const K = [
      0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
      0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
      0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
      0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
      0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
      0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
      0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
      0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
    ];
    const HASH = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
    const W = new Array(64);
    let a, b, c, d, e, f, g, h, t1, t2;

    m[l >> 5] |= 0x80 << (24 - l % 32);
    m[((l + 64 >> 9) << 4) + 15] = l;

    for (let i = 0; i < m.length; i += 16) {
      a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];

      for (let j = 0; j < 64; j++) {
        if (j < 16) W[j] = m[j + i];
        else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);

        t1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
        t2 = safe_add(Sigma0256(a), Maj(a, b, c));
        h = g; g = f; f = e; e = safe_add(d, t1); d = c; c = b; b = a; a = safe_add(t1, t2);
      }

      HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
      HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
    }
    return HASH;
  };

  const str2binb = (str: string) => {
    const bin = [];
    const mask = (1 << chrsz) - 1;
    for (let i = 0; i < str.length * chrsz; i += chrsz)
      bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
    return bin;
  };

  const binb2hex = (binarray: number[]) => {
    const hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
    let str = "";
    for (let i = 0; i < binarray.length * 4; i++) {
      str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
             hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
    }
    return str;
  };

  return binb2hex(core_sha256(str2binb(s), s.length * chrsz));
};

/**
 * Deterministic masking for PII (PAN/GSTIN) to satisfy ZERO PII constraints.
 * Uses middle-digit masking for 'Professional Grade' UI display (e.g., AABCR****D).
 */
export const maskPII = (val: string | undefined): string | undefined => {
  if (!val || val === 'Pending' || val === 'UNKNOWN') return val;
  const str = val.trim();
  if (str.length === 10) {
    // PAN format: AABCR1234D -> AABCR****D
    return `${str.substring(0, 5)}****${str.substring(9)}`;
  }
  if (str.length === 15) {
    // GSTIN format: 29AABCR1234D1Z5 -> 29AABCR****1Z5
    return `${str.substring(0, 7)}****${str.substring(12)}`;
  }
  // Fallback: SHA-256 hash if format unknown
  const hash = sha256(val).substring(0, 8).toUpperCase();
  return `ID-${hash}`;
};

/**
 * Generates a deterministic 8-character string from the entropy pool based on an input seed.
 * KUBIP v4.0 enforces the use of a SHA-256 derived entropy segment for high collision resistance.
 */
const generateEntropyString = (seed: string): string => {
  const hash = sha256(seed);
  
  // Use the SHA-256 hash to derive 8 characters from our 34-char alphabet
  let entropy = '';
  for (let i = 0; i < 8; i++) {
    // Take 4 chars from the hex hash as a seed for each entropy char
    const hexSlice = hash.substring(i * 4, i * 4 + 4);
    const charIndex = parseInt(hexSlice, 16) % ENTROPY_ALPHABET.length;
    entropy += ENTROPY_ALPHABET.charAt(charIndex);
  }
  
  return entropy;
};

/**
 * Alphabet for the entropy pool (34 chars, excluding O and I)
 * Alphabet: "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
 */
const ENTROPY_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates the single MOD-34 checksum character as specified in Section 2:
 * "Computed as: sum of (position * char_value) mod 34"
 * If checksum char would be O or I, shift +1 until valid. (Though our 34-char alphabet already excludes them).
 */
const calculateKUBIDChecksum = (entropy: string): string => {
  let sum = 0;
  
  for (let i = 0; i < entropy.length; i++) {
    const char = entropy[i];
    const val = ENTROPY_ALPHABET.indexOf(char);
    // Section 2: position * char_value (1-indexed position)
    sum += (i + 1) * (val === -1 ? 0 : val);
  }
  
  const checksumIndex = sum % 34;
  return ENTROPY_ALPHABET.charAt(checksumIndex);
};

/**
 * Promotes a provisional (KA-INT) ID to a permanent (KA) ID while preserving the entropy string and checksum.
 */
export const promoteUBID = (id: string): string => {
  if (!id.includes('KA-INT')) return id;
  
  const parts = id.split('-');
  // Format: KA-INT-XXXXXXXX-C
  if (parts.length < 4) return id; 
  
  const entropy = parts[2];
  const checksum = parts[3]; 
  
  return `KA-${entropy}-${checksum}`;
};

/**
 * Generates the final UBID in the format KA-XXXXXXXX-C or KA-INT-XXXXXXXX-C
 * Implementation follows Section 2 of KUBID Master Prompt.
 */
export const generateUnifiedBusinessIdentifier = (seed: string, isProvisional: boolean = false): string => {
  const prefix = isProvisional ? 'KA-INT' : 'KA';
  const entropy = generateEntropyString(seed);
  const checksum = calculateKUBIDChecksum(entropy);
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
  // v4.0 Normalization Pipeline for stable deterministic seeding
  const normName = normalizationPipeline(record.businessName, 'NAME');
  const normAddr = normalizationPipeline(record.address, 'ADDRESS');
  
  // Section 2: If neither PAN nor GSTIN, use name + pincode + dept_code for orphan hash
  const deptCodeMap: Record<string, string> = {
    'Shop & Establishment (BBMP)': 'SE',
    'Factories & Boilers': 'FB',
    'Labour & Employment': 'LB',
    'KSPCB (Pollution Control)': 'KS',
    'Commercial Taxes (GST)': 'GT',
    'BESCOM (Power)': 'BS'
  };
  const deptCode = deptCodeMap[record.department] || 'XX';
  
  const seed = anchorId || `${normName}${record.pinCode}${deptCode}`;
  const isProvisional = !record.pan && (!record.gstin || record.gstin === 'Pending');
  const ubid = generateUnifiedBusinessIdentifier(seed, isProvisional);
  
  const statusValue = record.status === 'UNKNOWN' ? 'ACTIVE' : (record.status.toUpperCase() as 'ACTIVE' | 'DORMANT' | 'CLOSED');
  const confidenceValue = isProvisional ? 0.65 : 0.99; // Internal IDs start below Master threshold

  const base: UBIDRecord = {
    ubid,
    legal_entity_pan: maskPII(record.pan) || 'UNKNOWN',
    score: confidenceValue,
    confidence: confidenceValue,
    confidence_metadata: {
      anchor: isProvisional ? (record.tradeLicense ? 'Trade License' : 'Internal Registry') : (record.pan ? 'PAN' : 'GSTIN'),
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
    anchorId: anchorId ? maskPII(anchorId) : undefined,
    canonicalName: record.businessName,
    canonicalAddress: record.address,
    pinCode: record.pinCode,
    pan: maskPII(record.pan),
    gstin: maskPII(record.gstin),
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
