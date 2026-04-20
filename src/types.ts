export type Department = 'Shop & Establishment' | 'Factories' | 'Labour' | 'KSPCB' | 'BESCOM' | 'Factories & Boilers' | 'Labour Department' | 'Commercial Taxes' | 'BBMP Trade License' | 'BESCOM (Power)' | 'Pollution Control Board' | 'KSPCB (Pollution Control)';

export interface SourceRecord {
  id: string;
  department: Department;
  businessName: string;
  address: string;
  pinCode: string;
  pan?: string;
  gstin?: string;
  ownerName: string;
  phone?: string;
  email?: string;
  [key: string]: any; // Allow for schema drift in different environments
}

export interface StatusChange {
  from: 'Active' | 'Dormant' | 'Closed' | 'Unknown';
  to: 'Active' | 'Dormant' | 'Closed';
  reason: string;
  timestamp: string;
  actor: string;
  type: 'System' | 'Manual';
}

export interface UBIDRecord {
  ubid: string; // The generated or anchored ID
  anchorType: 'Central' | 'Internal';
  anchorId?: string; // The GSTIN or PAN if centrally anchored
  canonicalName: string;
  canonicalAddress: string;
  pinCode: string;
  pan?: string;
  gstin?: string;
  status: 'Active' | 'Dormant' | 'Closed';
  statusHistory?: StatusChange[];
  manualStatusOverride?: {
    status: 'Active' | 'Dormant' | 'Closed';
    reason: string;
    timestamp: string;
    actor: string;
  };
  linkedRecords: SourceRecord[];
  unlinkedRecordIds?: string[]; // Track records manually removed from this UBID
  confidence: number;
  riskScore: number; // 0 to 100
  evidence: string[];
  lastUpdated: string;
  [key: string]: any; // Resiliency for environment-specific data additions
}

export interface ActivityEvent {
  id: string;
  ubid: string;
  department: Department;
  eventType: 'Inspection' | 'Renewal' | 'Bill Payment' | 'Compliance Filing' | 'Closure' | 'Safety Audit' | 'Meter Reading' | 'License Renewal' | 'Disconnection' | 'Emission Test' | 'Load Upgrade' | 'ESI Inspection' | 'Effluent Check' | 'Machine Inspection' | string; // Allow new event types
  date: string;
  details: string;
  value: 'High' | 'Medium' | 'Low' | 'Critical';
  businessNameHint?: string;
  addressHint?: string;
  pinCodeHint?: string;
  [key: string]: any; // Resiliency for new industrial signal types
}

export interface SystemKnowledge {
  manualLinks: Array<{ recordId: string; ubid: string }>;
  manualBlacklist: Array<{ recordIdA: string; recordIdB: string }>; // Prevents these two from ever being linked again
  learnedWeights: {
    nameWeight: number;
    addressWeight: number;
    pinWeight: number;
  };
}

export interface MatchSuggestion {
  id: string;
  recordA: SourceRecord;
  recordB: SourceRecord;
  confidence: number;
  reasons: string[];
  confidenceBreakdown?: {
    name: number;
    address: number;
    location: number;
  };
  riskFactors?: string[];
  priority?: 'High' | 'Medium' | 'Low';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Auto-Committed';
  reviewerFeedback?: {
    action: 'Approved' | 'Rejected';
    reason: string;
    timestamp: string;
    reviewer: string;
  };
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  entityId: string;
  details: string;
  type: 'Security' | 'Governance' | 'System';
}
