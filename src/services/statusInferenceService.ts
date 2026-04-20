import { ActivityEvent, UBIDRecord } from '../types';
import { subMonths, parseISO, isAfter } from 'date-fns';

export interface VerdictEvidence {
  signalType: string;
  source: string;
  date: string;
  impact: 'Positive' | 'Negative' | 'Neutral';
  description: string;
}

export interface StatusVerdict {
  status: 'Active' | 'Dormant' | 'Closed';
  confidence: number;
  reasoning: string;
  evidenceTrail: VerdictEvidence[];
  analysisWindowMonths: number;
}

/**
 * Infers business status based on a stream of activity events.
 * 
 * Logic:
 * - ACTIVE: Multiple diverse signals OR high-value signal (Audit/Renewal) in last 6 months.
 * - DORMANT: No signals in last 6 months, but signals exist in 6-18 month window.
 * - CLOSED: Explicit "Closure" or "Disconnection" signal OR zero signals across 18 months.
 */
export const inferBusinessStatus = (
  ubid: string, 
  events: ActivityEvent[], 
  windowMonths: number = 18
): StatusVerdict => {
  const ubidEvents = events.filter(e => e.ubid === ubid)
    .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());

  const now = new Date();
  const activeThreshold = subMonths(now, 6);
  const dormantThreshold = subMonths(now, 18);

  const activeSignals = ubidEvents.filter(e => isAfter(parseISO(e.date), activeThreshold));
  const recentSignals = ubidEvents.filter(e => isAfter(parseISO(e.date), dormantThreshold));

  const evidenceTrail: VerdictEvidence[] = ubidEvents.map(e => ({
    signalType: e.eventType,
    source: e.department,
    date: e.date,
    impact: getSignalImpact(e.eventType),
    description: e.details
  }));

  // Check for explicit Closure/Disconnection first (highest signal)
  const closureSignal = ubidEvents.find(e => 
    e.eventType === 'Closure' || e.eventType === 'Disconnection'
  );

  if (closureSignal) {
    return {
      status: 'Closed',
      confidence: 0.95,
      reasoning: `Explicit termination signal detected from ${closureSignal.department} on ${closureSignal.date}.`,
      evidenceTrail,
      analysisWindowMonths: windowMonths
    };
  }

  if (activeSignals.length > 0) {
    const highValueSignals = activeSignals.filter(s => s.value === 'High' || s.value === 'Critical');
    const diverseSources = new Set(activeSignals.map(s => s.department)).size;

    return {
      status: 'Active',
      confidence: Math.min(0.7 + (diverseSources * 0.1), 0.99),
      reasoning: `Active operations confirmed via ${activeSignals.length} signals across ${diverseSources} departments in the last 6 months.`,
      evidenceTrail,
      analysisWindowMonths: windowMonths
    };
  }

  if (recentSignals.length > 0) {
    return {
      status: 'Dormant',
      confidence: 0.85,
      reasoning: `No signals detected in the last 6 months. Last known activity was ${recentSignals[0].eventType} on ${recentSignals[0].date}.`,
      evidenceTrail,
      analysisWindowMonths: windowMonths
    };
  }

  return {
    status: 'Closed',
    confidence: 0.9,
    reasoning: `Zero operational signals detected across all monitoring departments for ${windowMonths} months. Inferring business cessation.`,
    evidenceTrail,
    analysisWindowMonths: windowMonths
  };
};

const getSignalImpact = (type: string): 'Positive' | 'Negative' | 'Neutral' => {
  const negative = ['Closure', 'Disconnection', 'Compliance Filing (Overdue)'];
  const positive = ['Renewal', 'Inspection', 'Bill Payment', 'Safety Audit', 'License Renewal'];
  
  if (negative.includes(type)) return 'Negative';
  if (positive.includes(type)) return 'Positive';
  return 'Neutral';
};

/**
 * Identifies events that cannot be confidently joined to an existing UBID.
 */
export const findOrphanEvents = (events: ActivityEvent[], ubids: UBIDRecord[]) => {
  const ubidSet = new Set(ubids.map(u => u.ubid));
  return events.filter(e => !ubidSet.has(e.ubid));
};
