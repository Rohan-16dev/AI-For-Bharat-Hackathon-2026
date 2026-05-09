import { ActivityEvent, UBIDRecord, LogicAuditTrail, SystemConfiguration } from '../types';
import { subDays, parseISO, isAfter, format } from 'date-fns';

export interface VerdictEvidence {
  signalType: string;
  source: string;
  date: string;
  impact: 'Positive' | 'Negative' | 'Neutral';
  description: string;
}

export interface StatusVerdict {
  status: 'ACTIVE' | 'DORMANT' | 'CLOSED';
  confidence: number;
  reasoning: string | LogicAuditTrail;
  evidenceTrail: VerdictEvidence[];
  analysisWindowMonths: number;
  edgeCaseFlag?: string;
  logic_trace?: {
    anchor_found: string;
    days_inactive: number;
    threshold_applied: string;
    verdict: string;
  };
}

/**
 * SECTOR-SPECIFIC OPERATIONAL THRESHOLDS (v4.0)
 * Defines the window of "Commercial Vitality" for different industrial archetypes.
 */
const SECTOR_THRESHOLDS: Record<string, number> = {
  'Factories & Boilers': 45, // Power-Intensive: Expect frequent safety/power/labour signals
  'BESCOM (Power)': 45,      // Bill payment expected monthly/bi-monthly
  'Commercial Taxes (GST)': 90, // Quarterly filings
  'Textiles': 240,           // Seasonal nature of textile small-scale units
  'Agriculture': 270,        // Semi-annual seasonal windows
  'General Industrial': 180,  // Standard fallback
};

const getThresholdForRecord = (department: string, config?: SystemConfiguration): number => {
  // Check for specialized sectoral overrides from System Config
  if (config?.sectoralOverrides) {
    const override = config.sectoralOverrides.find(o => department.includes(o.sector));
    if (override) return override.seasonalWindow;
  }

  if (department.includes('Factories')) return SECTOR_THRESHOLDS['Factories & Boilers'];
  if (department.includes('BESCOM')) return SECTOR_THRESHOLDS['BESCOM (Power)'];
  if (department.includes('GST') || department.includes('Tax')) return SECTOR_THRESHOLDS['Commercial Taxes (GST)'];
  if (department.includes('Textile')) return SECTOR_THRESHOLDS['Textiles'];
  if (department.includes('Agro') || department.includes('Agri')) return SECTOR_THRESHOLDS['Agriculture'];
  return SECTOR_THRESHOLDS['General Industrial'];
};

/**
 * KUBIP LOGIC ENGINE v4.0 - PART B: ACTIVITY INTELLIGENCE
 * 
 * SIGNAL WEIGHTS:
 * - ADMIN: (Electricity, Tax, Renewals) = Legal existence.
 * - OPERATIONAL: (Inspections, GST filings, Sales) = Real-world activity.
 * 
 * DYNAMIC WINDOW: Threshold based on department/sector characteristics.
 */

export const inferBusinessStatus = (
  ubid: string, 
  events: ActivityEvent[], 
  defaultWindowDays: number = 180,
  businessName?: string,
  departmentHint?: string,
  config?: SystemConfiguration,
  ubidRecord?: UBIDRecord // Pass full record to check linked records for joining
): StatusVerdict => {
  // Join Strategy:
  // 1. Check if event specifically has this UBID
  // 2. Check if event's raw_record_id matches any of the records linked to this UBID
  // 3. Check if businessNameHint matches (tentative)
  const linkedRecordIds = ubidRecord?.linkedRecords.map(r => r.id) || [];

  const ubidEvents = events.filter(e => 
    e.ubid === ubid || 
    (e.raw_record_id && linkedRecordIds.includes(e.raw_record_id)) ||
    (businessName && e.businessNameHint === businessName)
  ).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

  const now = new Date();
  
  // v4.0 DYNAMIC THRESHOLD LOGIC
  const configRecentWindow = config?.dormancy?.recentSignalWindow ?? defaultWindowDays;
  const configAnnualWindow = config?.dormancy?.annualSignalWindow ?? 365;

  const windowDays = departmentHint ? getThresholdForRecord(departmentHint, config) : configRecentWindow;
  const operationalThreshold = subDays(now, windowDays);
  const closedThreshold = subDays(now, configAnnualWindow); 

  const adminEventTypes = ['Electricity', 'Tax', 'Renewals', 'Bill Payment', 'Meter Reading', 'Property Tax', 'License Renewal', 'BESCOM', 'BBMP Trade License'];
  const operationalEventTypes = ['Inspection', 'GST Filing', 'Sales', 'Shipment', 'Safety Audit', 'Compliance Filing', 'Check-In', 'KSPCB', 'Factories'];

  const operationalSignals = ubidEvents.filter(e => 
    operationalEventTypes.some(type => e.eventType.includes(type) || e.department.includes(type)) || 
    e.value === 'High' || 
    e.value === 'Critical'
  );
  
  const recentOperational = operationalSignals.filter(e => isAfter(parseISO(e.date), operationalThreshold));
  const recentAdmin = ubidEvents.filter(e => 
    (adminEventTypes.some(type => e.eventType.includes(type) || e.department.includes(type))) && 
    isAfter(parseISO(e.date), operationalThreshold)
  );

  const evidenceTrail: VerdictEvidence[] = ubidEvents.map(e => ({
    signalType: e.eventType,
    source: e.department,
    date: e.date,
    impact: getSignalImpact(e.eventType),
    description: e.details
  }));

  // Check for explicit Closure/Disconnection first (highest signal)
  const closureSignal = ubidEvents.find(e => 
    e.eventType === 'Closure' || e.eventType === 'Disconnection' || e.details.toLowerCase().includes('closed')
  );

  const latestEvent = ubidEvents.length > 0 ? parseISO(ubidEvents[0].date) : new Date();
  const days_inactive = Math.floor((now.getTime() - latestEvent.getTime()) / (1000 * 60 * 60 * 24));

  const createStatusAudit = (verdict: 'ACTIVE' | 'DORMANT' | 'CLOSED', confidence: number, explanation: string): LogicAuditTrail => {
    const nodes: LogicAuditTrail['logic_nodes'] = [
      {
        node: 'Dynamic Thresholding',
        status: 'PASS',
        score: 1.0,
        reason: `Operational window: ${windowDays} days (Sector: ${departmentHint || 'General'})`
      },
      {
        node: 'Operational Signals',
        status: recentOperational.length > 0 ? 'PASS' : (operationalSignals.length > 0 ? 'INCONCLUSIVE' : 'FAIL'),
        score: recentOperational.length > 0 ? 1.0 : (operationalSignals.length > 0 ? 0.5 : 0.0),
        reason: recentOperational.length > 0 
          ? `Active Operational: ${recentOperational.length} signal(s) in last ${windowDays}d.` 
          : (operationalSignals.length > 0 ? `Stale Operational: Last activity was over ${windowDays}d ago.` : 'No operational signals detected in history.')
      },
      {
        node: 'Administrative Pulse',
        status: recentAdmin.length > 0 ? 'PASS' : (ubidEvents.length > 0 ? 'INCONCLUSIVE' : 'FAIL'),
        score: recentAdmin.length > 0 ? 1.0 : (ubidEvents.length > 0 ? 0.3 : 0.0),
        reason: recentAdmin.length > 0 
          ? `Active Admin: ${recentAdmin.length} administrative pulse(s) in last ${windowDays}d.` 
          : (ubidEvents.length > 0 ? 'Stale Admin: Registration exists but pulse is flat.' : 'Zero administrative pulse detected.')
      }
    ];

    if (closureSignal) {
      nodes.push({
        node: 'Termination Guard',
        status: 'FAIL',
        score: 0.0,
        reason: `Explicit closure signal found: ${closureSignal.eventType} from ${closureSignal.department} on ${closureSignal.date}.`
      });
    }

    if (hasRecentConsumption && !hasYearlyFilings) {
      nodes.push({
        node: 'Compliance Contradiction',
        status: 'FAIL',
        score: 0.2,
        reason: `Activity Mismatch: High Utility Consumption (${totalConsumption90d}) vs Zero Tax Filings.`
      });
    }

    return {
      verdict,
      confidence,
      explanation,
      timestamp: new Date().toISOString(),
      engine_version: 'v4.0 (Heartbeat Engine)',
      logic_nodes: nodes
    };
  };

  // Check for CONTRADICTION (Section 6 Step 2)
  // "if BESCOM/BWSSB shows consumption (value > 0) in last 90 days BUT GST/TRADE shows no filing in last 365 days"
  const ninetyDaysAgo = subDays(now, 90);
  const yearAgo = subDays(now, 365);
  
  const recentConsumptionEvents = ubidEvents.filter(e => 
    (e.department.includes('BESCOM') || e.department.includes('BWSSB')) && 
    (typeof e.value === 'number') &&
    isAfter(parseISO(e.date), ninetyDaysAgo)
  );

  const totalConsumption90d = recentConsumptionEvents.reduce((acc, e) => acc + (Number(e.value) || 0), 0);
  const hasRecentConsumption = totalConsumption90d > 0;

  const hasYearlyFilings = ubidEvents.some(e => 
    (e.department.includes('GST') || e.department.includes('Tax') || e.department.includes('TRADE') || e.eventType.includes('FILING') || e.eventType.includes('Compliance')) &&
    isAfter(parseISO(e.date), yearAgo)
  );

  // Section 7 Edge Case 4: High-Value Orphan (Internal ID + High Consumption)
  const isInternal = ubid.startsWith('KA-INT');
  if (isInternal && days_inactive <= 90 && totalConsumption90d > 5000) {
    return {
      status: 'ACTIVE',
      confidence: 1.0,
      edgeCaseFlag: 'NONE', // This is handled via the dashboard identifying high-value orphans
      reasoning: createStatusAudit('ACTIVE', 1.0, `ACTIVE (Enforcement Priority). Reason: Active high-consumption business with no legal identifier. Priority target for compliance enforcement (Total 90d consumption: ${totalConsumption90d}).`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: 'NONE_INTERNAL',
        days_inactive: 0,
        threshold_applied: 'HIGH_VALUE_ORPHAN',
        verdict: 'ACTIVE'
      }
    };
  }

  if (hasRecentConsumption && !hasYearlyFilings) {
    return {
      status: 'ACTIVE',
      confidence: 0.90,
      reasoning: createStatusAudit('ACTIVE', 0.90, `ACTIVE (Consumption Wins) BUT flag = HIGH_RISK_COMPLIANCE_GAP. Reason: Active utility consumption detected but zero compliance filings. Potential tax/regulatory evasion. Flag for enforcement review.`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: "TBD",
        days_inactive: 0,
        threshold_applied: 'CONTRADICTION_LOGIC',
        verdict: 'ACTIVE'
      }
    };
  }

  if (closureSignal) {
    return {
      status: 'CLOSED',
      confidence: 0.98,
      reasoning: createStatusAudit('CLOSED', 0.98, `Explicit termination signal detected from ${closureSignal.department} on ${closureSignal.date}.`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: "TBD",
        days_inactive,
        threshold_applied: 'CLOSURE_SIGNAL',
        verdict: 'CLOSED'
      }
    };
  }

  // 1. ACTIVE: If AT LEAST ONE signal is Operational within dynamic threshold.
  if (recentOperational.length > 0) {
    const latestOp = recentOperational[0];
    const op_days_inactive = Math.floor((now.getTime() - parseISO(latestOp.date).getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'ACTIVE',
      confidence: 0.95,
      reasoning: createStatusAudit('ACTIVE', 0.95, `Operational activity verified via ${latestOp.eventType} (${latestOp.department}) on ${latestOp.date}. Consistent real-world signals match legal status.`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: "TBD",
        days_inactive: op_days_inactive,
        threshold_applied: `${windowDays}_DAY_DYNAMIC_RULE`,
        verdict: 'ACTIVE'
      }
    };
  }

  // 2. DORMANT: Only if ALL signals are non-operational (Admin-only) for > window days.
  if (recentAdmin.length > 0) {
    const latestAdmin = recentAdmin[0];
    const admin_days_inactive = Math.floor((now.getTime() - parseISO(latestAdmin.date).getTime()) / (1000 * 60 * 60 * 24));
    return {
      status: 'DORMANT',
      confidence: 0.85,
      reasoning: createStatusAudit('DORMANT', 0.85, `Identity is maintained via administrative signals (${latestAdmin.eventType}) but lacks commercial vitality (No operational signals in ${windowDays} days).`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: "TBD",
        days_inactive: admin_days_inactive,
        threshold_applied: `${windowDays}_DAY_DYNAMIC_RULE`,
        verdict: 'DORMANT'
      }
    };
  }

  // Handle sparse or old data: If latest signal is 6-12 months old, it's DORMANT
  if (ubidEvents.length > 0) {
    const lastSignal = parseISO(ubidEvents[0].date);
    if (isAfter(lastSignal, closedThreshold)) {
      // Check for SEASONAL (Section 6 Step 2)
      // "if business has 0 signals for 6+ months but historically had regular signals same month in prior year"
      const currentMonth = now.getMonth();
      const hasHistoricalSeasonalSignal = ubidEvents.some(e => {
        const date = parseISO(e.date);
        const diffYears = now.getFullYear() - date.getFullYear();
        return diffYears >= 1 && date.getMonth() === currentMonth;
      });

      if (hasHistoricalSeasonalSignal) {
        return {
          status: 'DORMANT',
          confidence: 0.85,
          edgeCaseFlag: 'POSSIBLY_SEASONAL',
          reasoning: createStatusAudit('DORMANT', 0.85, `Possible seasonal operation. No activity last 6 months but historical pattern suggests seasonal business. Verified against prior year seasonal signals.`),
          evidenceTrail,
          analysisWindowMonths: Math.floor(windowDays / 30),
          logic_trace: {
            anchor_found: "TBD",
            days_inactive,
            threshold_applied: 'SEASONAL_PATTERN_DETECTED',
            verdict: 'DORMANT'
          }
        };
      }

      return {
          status: 'DORMANT',
          confidence: 0.8,
          reasoning: createStatusAudit('DORMANT', 0.8, `Latest activity signal is older than ${windowDays} days but within 12 months. Entity is considered dormant.`),
          evidenceTrail,
          analysisWindowMonths: Math.floor(windowDays / 30),
          logic_trace: {
            anchor_found: "TBD",
            days_inactive,
            threshold_applied: '6_TO_12_MONTHS_RULE',
            verdict: 'DORMANT'
          }
      };
    }
  }

  // 3. CLOSED: Zero signals of any kind for 12+ months.
  if (ubidEvents.length > 0) {
    const lastSignalOverall = ubidEvents[0];
    return {
      status: 'CLOSED',
      confidence: 0.92,
      reasoning: createStatusAudit('CLOSED', 0.92, `Last digital footprint detected on ${lastSignalOverall.date}. Inferred closure due to 12+ months signal silence.`),
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30),
      logic_trace: {
        anchor_found: "TBD",
        days_inactive,
        threshold_applied: '365_DAY_RULE',
        verdict: 'CLOSED'
      }
    };
  }

  return {
    status: 'ACTIVE',
    confidence: 0.7,
    reasoning: `Status derived from current departmental registration validity. No specific activity signals detected.`,
    evidenceTrail,
    analysisWindowMonths: Math.floor(windowDays / 30),
    logic_trace: {
      anchor_found: "TBD",
      days_inactive,
      threshold_applied: 'DEFAULT_REGISTRATION',
      verdict: 'ACTIVE'
    }
  };
};

const getSignalImpact = (type: string): 'Positive' | 'Negative' | 'Neutral' => {
  const negative = ['Closure', 'Disconnection', 'Overdue Compliance'];
  const positive = ['Renewal', 'Inspection', 'Filing', 'Safety Audit', 'License Renewal', 'Sales', 'GST Filing'];
  
  if (negative.some(n => type.includes(n))) return 'Negative';
  if (positive.some(p => type.includes(p))) return 'Positive';
  return 'Neutral';
};

/**
 * Section 7, Edge Case 4: High-Value Orphan Detection
 * KA-INT UBID with recent high consumption but no legal anchor.
 */
export const getHighValueOrphans = (ubids: UBIDRecord[], events: ActivityEvent[]) => {
  const now = new Date();
  const ninetyDaysAgo = subDays(now, 90);
  
  return ubids.filter(ubid => {
    // Must be internal (orphan) and have no PAN/GSTIN
    const isOrphan = ubid.ubid.includes('-INT-') || ubid.anchorType === 'Internal';
    const hasLegalAnchor = !!(ubid.pan || ubid.gstin || (ubid.legal_entity_pan && ubid.legal_entity_pan !== 'UNKNOWN'));
    
    if (!isOrphan || hasLegalAnchor) return false;
    
    const linkedRecordIds = ubid.linkedRecords?.map(r => r.id) || [];
    const ubidEvents = events.filter(e => 
      e.ubid === ubid.ubid ||
      (e.raw_record_id && linkedRecordIds.includes(e.raw_record_id)) ||
      (e.businessNameHint && e.businessNameHint === ubid.canonicalName)
    );
    const recentEvents = ubidEvents.filter(e => isAfter(parseISO(e.date), ninetyDaysAgo));
    
    if (recentEvents.length === 0) return false;
    
    // Check for high consumption (electricity/water)
    const consumption = recentEvents
      .filter(e => e.eventType.includes('CONSUMPTION') || e.department.includes('BESCOM'))
      .reduce((sum, e) => sum + (typeof e.value === 'number' ? e.value : 0), 0);
      
    return consumption > 5000;
  });
};

/**
 * Section 6, Step 2: Contradiction Detection
 * Active consumption but zero compliance filings.
 */
export const getContradictions = (ubids: UBIDRecord[], events: ActivityEvent[]) => {
  const now = new Date();
  const ninetyDaysAgo = subDays(now, 90);
  const oneYearAgo = subDays(now, 365);
  
  return ubids.filter(ubid => {
    const linkedRecordIds = ubid.linkedRecords?.map(r => r.id) || [];
    const ubidEvents = events.filter(e => 
      e.ubid === ubid.ubid ||
      (e.raw_record_id && linkedRecordIds.includes(e.raw_record_id)) ||
      (e.businessNameHint && e.businessNameHint === ubid.canonicalName)
    );
    
    // Signal A: Consumption in last 90 days
    const hasRecentConsumption = ubidEvents.some(e => 
      (e.department.includes('BESCOM') || e.department.includes('BWSSB')) && 
      (typeof e.value === 'number' && e.value > 0) &&
      isAfter(parseISO(e.date), ninetyDaysAgo)
    );
    
    // Signal B: Compliance filings in last 365 days
    const hasYearlyFilings = ubidEvents.some(e => 
      (e.department.includes('GST') || e.department.includes('TRADE') || e.eventType.includes('FILING') || e.eventType.includes('Compliance')) &&
      isAfter(parseISO(e.date), oneYearAgo)
    );
    
    return hasRecentConsumption && !hasYearlyFilings;
  });
};

/**
 * Identifies events that cannot be confidently joined to an existing UBID.
 */
export const findOrphanEvents = (events: ActivityEvent[], ubids: UBIDRecord[]) => {
  const ubidSet = new Set(ubids.map(u => u.ubid));
  const nameSet = new Set(ubids.map(u => u.canonicalName).filter(Boolean));
  
  return events.filter(e => {
    const matchedById = ubidSet.has(e.ubid);
    const matchedByName = e.businessNameHint && nameSet.has(e.businessNameHint);
    return !matchedById && !matchedByName;
  });
};
