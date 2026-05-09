import { SourceRecord, ActivityEvent, Department } from '../types';

/**
 * Data Sanitizer Service
 * Implements Section 1 & Section 3 preprocessing requirements.
 * 1. Forced Uppercase
 * 2. Whitespace Stripping
 * 3. Column Synonym Mapping
 */

const COLUMN_SYNONYMS: Record<string, string[]> = {
  businessName: ['business_name', 'company_name', 'legal_name', 'enterprise_name', 'unit_name', 'entity_name', 'name', 'firm_name'],
  address: ['business_address', 'office_address', 'location', 'site_address', 'street', 'locality'],
  pinCode: ['pincode', 'pin_code', 'postal_code', 'zip', 'zipcode'],
  ownerName: ['owner_name', 'proprietor', 'director', 'authorized_signatory', 'contact_person', 'applicant_name'],
  pan: ['pan_number', 'pan_card', 'permanent_account_number'],
  gstin: ['gst_number', 'gst', 'gst_id'],
  id: ['raw_id', 'record_id', 'department_id', 'sl_no', 'uid'],
  eventType: ['event_type', 'activity_type', 'signal_type', 'transaction_type'],
  eventDate: ['event_date', 'date', 'transaction_date', 'signal_date'],
  value: ['amount', 'units', 'consumption', 'quantity'],
  details: ['notes', 'remarks', 'description', 'comment'],
  sourceDept: ['source_dept', 'dept', 'department', 'agency']
};

/**
 * Normalizes a value: forces to uppercase and trims whitespace.
 */
export const sanitizeValue = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  return str.toUpperCase();
};

/**
 * Maps raw row keys using common synonyms to canonical internal property names.
 */
export const mapRowToInternal = (row: any): any => {
  const normalizedRow: any = {};
  
  // Clean all keys first to lowercase for easier mapping
  const cleanRow: any = {};
  Object.keys(row).forEach(key => {
    const cleanKey = key.trim().toLowerCase();
    cleanRow[cleanKey] = row[key];
  });

  const matchedKeys = new Set<string>();

  // Map synonyms to canonical field names
  Object.entries(COLUMN_SYNONYMS).forEach(([canonical, aliases]) => {
    const canonicalLower = canonical.toLowerCase();
    
    if (cleanRow[canonicalLower] !== undefined) {
      normalizedRow[canonical] = cleanRow[canonicalLower];
      matchedKeys.add(canonicalLower);
    } else {
      for (const alias of aliases) {
        const aliasLower = alias.toLowerCase();
        if (cleanRow[aliasLower] !== undefined) {
          normalizedRow[canonical] = cleanRow[aliasLower];
          matchedKeys.add(aliasLower);
          break;
        }
      }
    }
  });

  // Preserve other fields that didn't match canonical ones
  Object.keys(cleanRow).forEach(key => {
    if (!matchedKeys.has(key)) {
       normalizedRow[key] = cleanRow[key];
    }
  });

  return normalizedRow;
};

/**
 * Fully sanitizes a row: maps synonyms and normalizes all string values.
 */
export const sanitizeRow = (row: any): any => {
  const mapped = mapRowToInternal(row);
  const sanitized: any = {};
  Object.keys(mapped).forEach(key => {
    sanitized[key] = sanitizeValue(mapped[key]);
  });
  return sanitized;
};

/**
 * Converts a raw data row into a structured SourceRecord.
 */
export const transformToSourceRecord = (rawRow: any, defaultDept: Department, idx: number): SourceRecord => {
  if (!rawRow || typeof rawRow !== 'object') {
    throw new Error('Input row is not a valid object');
  }

  const row = sanitizeRow(rawRow);
  
  const dept = (row.sourceDept || defaultDept) as Department;
  
  // Strict Validation for REQUIRED fields if Registry mode
  if (!row.businessName && !row.address && !row.pan && !row.gstin) {
    throw new Error('Record lacks all identifying attributes (Name, Address, PAN, GSTIN).');
  }

  // Logic for ID generation if missing
  const generatedId = row.id || `${dept}-${idx}-${Math.random().toString(36).substring(2, 7)}`;

  return {
    ...row,
    id: generatedId,
    department: dept,
    businessName: row.businessName || 'UNKNOWN BUSINESS',
    address: row.address || 'ADDRESS NOT PROVIDED',
    pinCode: row.pinCode || '000000',
    ownerName: row.ownerName || 'UNKNOWN OWNER',
    pan: row.pan || undefined,
    gstin: row.gstin || undefined,
    status: (row.status === 'DORMANT' ? 'DORMANT' : 
             row.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE') as any,
  };
};

/**
 * Converts a raw data row into a structured ActivityEvent.
 */
export const transformToActivityEvent = (rawRow: any, idx: number): ActivityEvent => {
  if (!rawRow || typeof rawRow !== 'object') {
    throw new Error('Input event is not a valid object');
  }

  const row = sanitizeRow(rawRow);
  
  // Validation for events
  if (!row.eventType && !row.value) {
    throw new Error('Event record lacks both type and value payload.');
  }

  return {
    ...row,
    id: row.id || `CSV-EVT-${idx}-${Math.random().toString(36).substring(2, 7)}`,
    ubid: row.ubid || '',
    raw_record_id: row.id || row.raw_id || row.rawRecordId,
    department: (row.sourceDept || 'ACTIVITY SOURCE') as Department,
    eventType: row.eventType || 'OPERATIONAL SIGNAL',
    date: row.eventDate || new Date().toISOString().split('T')[0],
    details: row.details || 'CSV INGESTED SIGNAL',
    value: row.value,
    businessNameHint: row.businessName,
    addressHint: row.address,
    pinCodeHint: row.pinCode,
  };
};
