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
  | 'Commercial Taxes (GST)'
  | 'BWSSB (Water)'
  | 'System';

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
  edgeCaseFlag: 'ZOMBIE_STATE' | 'PARENT_CHILD' | 'NONE' | 'BRANCH_NODE' | 'MULTI_VERTICAL' | 'MULTI_BUSINESS' | 'MISSING_IDS' | 'MANUAL_REVERSION' | 'IDENTITY_COLLISION' | 'INTRA_DEPT_DUPLICATE' | 'HIGH_RISK_COMPLIANCE_GAP' | 'POSSIBLY_SEASONAL';
  groupId?: string; // Section 7 Edge Case 1: Group Identifier
  relationship?: 'PARENT' | 'SUBSIDIARY'; // Section 7 Edge Case 1: Group Logic
  logic_trace?: {
    anchor_found: string;
    days_inactive: number;
    threshold_applied: string;
    verdict: string;
  };
  linked_units: Array<{ 
    unit_id: string; 
    type: string; 
    unit_status: string; 
    latest_signal: string;
    role?: string;
  }>; // Schema v4.0 Children units
  reasoning: string | LogicAuditTrail;
  linkageReasoning?: string | LogicAuditTrail;
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
  raw_record_id?: string; // Section 6: Join via department's own ID
  department: Department;
  eventType: 'Inspection' | 'Renewal' | 'Bill Payment' | 'Compliance Filing' | 'Closure' | 'Safety Audit' | 'Meter Reading' | 'License Renewal' | 'Disconnection' | 'Emission Test' | 'Load Upgrade' | 'ESI Inspection' | 'Effluent Check' | 'Machine Inspection' | string; // Allow new event types
  date: string;
  details: string;
  value?: string | number;
  businessNameHint?: string;
  addressHint?: string;
  pinCodeHint?: string;
  [key: string]: any; // Resiliency for new industrial signal types
}

export interface SystemConfiguration {
  weights: {
    anchor: number; // W_anchor
    name: number;   // W_name
    geo: number;    // W_geo
  };
  thresholds: {
    autoLink: number; // Sc > 0.95
    hitlReview: number; // Sc 0.70
  };
  dormancy: {
    recentSignalWindow: number; // default 180 days
    annualSignalWindow: number; // default 365 days
  };
  sectoralOverrides: Array<{
    sector: string;
    seasonalWindow: number;
    description: string;
  }>;
}

export interface SystemKnowledge {
  manualLinks: Array<{ recordId: string; ubid: string }>;
  manualBlacklist: Array<{ recordIdA: string; recordIdB: string; flag?: string }>; 
  approvedAliases: Array<{ name: string; address: string; ubid: string; frequency: number }>; 
  config: SystemConfiguration;
  learnedWeights: {
    nameWeight: number;
    addressWeight: number;
    pinWeight: number;
  };
  riskTolerance: number; 
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
  verdict?: 'AUTO_MERGE' | 'HUMAN_REVIEW' | 'ORPHAN' | 'IDENTITY_COLLISION';
  edgeCaseFlag?: 'BRANCH_NODE' | 'MULTI_VERTICAL' | 'MULTI_BUSINESS' | 'MISSING_IDS' | 'IDENTITY_COLLISION' | 'MANUAL_REVERSION' | 'INTRA_DEPT_DUPLICATE' | 'UNLINKED_EVENT' | 'NONE';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Deferred' | 'Auto-Committed';
  details?: string | LogicAuditTrail;
  reason_log?: string;
  reviewerFeedback?: {
    action: 'Approved' | 'Rejected' | 'Deferred';
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
  details: string | LogicAuditTrail;
  edgeCaseFlag?: string;
  type: 'Security' | 'Governance' | 'System';
}

export interface LogicAuditTrail {
  verdict: string;
  confidence: number;
  logic_nodes: Array<{
    node: string;
    status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
    score: number;
    reason: string;
  }>;
  explanation: string;
  timestamp: string;
  engine_version: string;
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
