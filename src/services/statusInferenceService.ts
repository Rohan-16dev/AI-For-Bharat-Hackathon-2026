import { ActivityEvent, UBIDRecord } from '../types';
import { subDays, parseISO, isAfter } from 'date-fns';

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
  reasoning: string;
  evidenceTrail: VerdictEvidence[];
  analysisWindowMonths: number;
}

/**
 * KUBIP LOGIC ENGINE v4.0 - PART B: ACTIVITY INTELLIGENCE
 * 
 * SIGNAL WEIGHTS:
 * - ADMIN: (Electricity, Tax, Renewals) = Legal existence.
 * - OPERATIONAL: (Inspections, GST filings, Sales) = Real-world activity.
 * 
 * WINDOW: 180 Days (Active) vs. >180 Days (Dormant).
 */

export const inferBusinessStatus = (
  ubid: string, 
  events: ActivityEvent[], 
  windowDays: number = 180,
  businessName?: string
): StatusVerdict => {
  const ubidEvents = events.filter(e => e.ubid === ubid || (businessName && e.businessNameHint === businessName))
    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

  const now = new Date();
  const operationalThreshold = subDays(now, windowDays);
  const closedThreshold = subDays(now, 365); // 12+ months

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

  if (closureSignal) {
    return {
      status: 'CLOSED',
      confidence: 0.98,
      reasoning: `Explicit termination signal detected from ${closureSignal.department} on ${closureSignal.date}.`,
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30)
    };
  }

  // 1. ACTIVE: If AT LEAST ONE signal is Operational within 180 days.
  if (recentOperational.length > 0) {
    const latestOp = recentOperational[0];
    return {
      status: 'ACTIVE',
      confidence: 0.95,
      reasoning: `Status: ACTIVE. Operational activity verified via ${latestOp.eventType} (${latestOp.department}) on ${latestOp.date}. Consistent real-world signals match legal status.`,
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30)
    };
  }

  // 2. DORMANT: Only if ALL signals are non-operational (Admin-only) for >180 days OR only Admin signals in window.
  if (recentAdmin.length > 0) {
    const latestAdmin = recentAdmin[0];
    return {
      status: 'DORMANT',
      confidence: 0.85,
      reasoning: `Status: DORMANT. No operational activity detected since ${latestAdmin.date}. Identity is maintained via administrative signals (${latestAdmin.eventType}) but lacks commercial vitality.`,
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30)
    };
  }

  // 3. CLOSED: Zero signals of any kind for 12+ months.
  const anyRecentSignals = ubidEvents.filter(e => isAfter(parseISO(e.date), closedThreshold));
  if (anyRecentSignals.length === 0 && ubidEvents.length > 0) {
    const lastSignalOverall = ubidEvents[0];
    return {
      status: 'CLOSED',
      confidence: 0.92,
      reasoning: `Status: CLOSED. Identity is clinically dead. Last digital footprint detected on ${lastSignalOverall.date} (${lastSignalOverall.eventType}). Inferred closure due to 12+ months signal silence.`,
      evidenceTrail,
      analysisWindowMonths: Math.floor(windowDays / 30)
    };
  }

  // Handle sparse or old data
  if (ubidEvents.length > 0) {
    const lastSignal = parseISO(ubidEvents[0].date);
    if (isAfter(lastSignal, operationalThreshold)) {
      return {
          status: 'ACTIVE',
          confidence: 0.75,
          reasoning: `Status: ACTIVE. Latest signal is recent, although classified as low-weight.`,
          evidenceTrail,
          analysisWindowMonths: Math.floor(windowDays / 30)
      };
    }
  }

  return {
    status: 'ACTIVE',
    confidence: 0.7,
    reasoning: `Status derived from current departmental registration validity. No specific operational activity signals detected in the 180-day window.`,
    evidenceTrail,
    analysisWindowMonths: Math.floor(windowDays / 30)
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
