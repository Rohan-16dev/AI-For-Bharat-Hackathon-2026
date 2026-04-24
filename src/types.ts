export type Department = 
  | 'Shop & Establishment' 
  | 'Factories' 
  | 'Labour' 
  | 'KSPCB' 
  | 'BESCOM' 
  | 'Factories & Boilers' 
  | 'Labour Department' 
  | 'Commercial Taxes' 
  | 'BBMP Trade License' 
  | 'BESCOM (Power)' 
  | 'Pollution Control Board' 
  | 'KSPCB (Pollution Control)'
  | 'Shop & Establishment (BBMP)'
  | 'Commercial Taxes (GST)';

export interface SourceRecord {
  id: string;
  department: Department;
  businessName: string;
  address: string;
  pinCode: string;
  pan?: string;
  gstin?: string;
  tradeLicense?: string;
  ownerName: string;
  phone?: string;
  email?: string;
  status: 'ACTIVE' | 'DORMANT' | 'CLOSED' | 'UNKNOWN';
  activities?: string[]; // e.g., ["Retail", "Warehousing"]
  [key: string]: any; // Allow for schema drift in different environments
}

export interface StatusChange {
  from: 'ACTIVE' | 'DORMANT' | 'CLOSED' | 'UNKNOWN';
  to: 'ACTIVE' | 'DORMANT' | 'CLOSED';
  reason: string;
  timestamp: string;
  actor: string;
  type: 'System' | 'Manual';
}

export interface UBIDRecord {
  ubid: string; // The generated or anchored ID
  legal_entity_pan?: string; // Schema v4.0 Sovereign Key
  score: number; // confidence score
  confidence_metadata: {
    anchor: string;
    fuzzy: string;
  };
  verdict: 'AUTO_MERGE' | 'HUMAN_REVIEW' | 'IDENTITY_COLLISION' | 'ORPHAN';
  status: 'ACTIVE' | 'DORMANT' | 'CLOSED';
  edgeCaseFlag: 'ZOMBIE_STATE' | 'PARENT_CHILD' | 'NONE' | 'BRANCH_NODE' | 'MULTI_VERTICAL' | 'MULTI_BUSINESS' | 'MISSING_IDS' | 'MANUAL_REVERSION' | 'IDENTITY_COLLISION';
  linked_units: Array<{ 
    unit_id: string; 
    type: string; 
    unit_status: string; 
    latest_signal: string;
    role?: string;
  }>; // Schema v4.0 Children units
  reasoning: string;
  linkageReasoning?: string;
  ui_metadata: { 
    label: string; 
    color: string;
  }; // Schema v4.0 branding
  
  // Internal fields for app functionality
  anchorType?: 'Central' | 'Internal';
  anchorId?: string;
  canonicalName: string;
  canonicalAddress: string;
  pinCode: string;
  pan?: string;
  gstin?: string;
  tradeLicense?: string;
  activities?: string[];
  statusHistory?: StatusChange[];
  manualStatusOverride?: {
    status: 'ACTIVE' | 'DORMANT' | 'CLOSED';
    reason: string;
    timestamp: string;
    actor: string;
  };
  linkedRecords: SourceRecord[];
  unlinkedRecordIds?: string[];
  historicalIds?: string[];
  confidence: number; // keeping for backward compat during migration
  riskScore: number;
  riskFactors?: string[];
  evidence: string[];
  lastUpdated: string;
  [key: string]: any;
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
  manualBlacklist: Array<{ recordIdA: string; recordIdB: string; flag?: string }>; // Prevents these two from ever being linked again
  approvedAliases: Array<{ name: string; address: string; ubid: string; frequency: number }>; // Feedback loop: Records confirmed variations
  learnedWeights: {
    nameWeight: number;
    addressWeight: number;
    pinWeight: number;
  };
  riskTolerance: number; // 0.0 (Strict) to 1.0 (Lenient). Affects auto-merge thresholds.
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
  verdict?: 'AUTO_MERGE' | 'HUMAN_REVIEW' | 'ORPHAN';
  edgeCaseFlag?: 'BRANCH_NODE' | 'MULTI_VERTICAL' | 'MULTI_BUSINESS' | 'MISSING_IDS' | 'IDENTITY_COLLISION' | 'MANUAL_REVERSION' | 'NONE';
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
  edgeCaseFlag?: string;
  type: 'Security' | 'Governance' | 'System';
}

export interface AppNotification {
  id: string;
  timestamp: string;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'info' | 'error' | 'security' | 'governance';
  read: boolean;
  entityId?: string;
}
