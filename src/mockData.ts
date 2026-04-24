import { SourceRecord, ActivityEvent, Department, UBIDRecord } from './types';
import { subMonths, format } from 'date-fns';

const DEPARTMENTS: Department[] = [
  'Shop & Establishment (BBMP)', 
  'Factories & Boilers', 
  'Labour Department', 
  'KSPCB (Pollution Control)', 
  'Commercial Taxes (GST)',
  'BESCOM (Power)'
];

/**
 * GENERATES SOURCE RECORDS based on v4.0 Test Suite (White Hawk Coders)
 * PURPOSE: Demonstrate UBID Entity Resolution & Logic Engine
 * COMPLIANCE: 100% Synthetic Data.
 */
export const generateMockData = () => {
  const sourceRecords: SourceRecord[] = [
    {
      id: 'ST-001',
      department: 'Factories & Boilers',
      businessName: 'Cauvery Hi-Tech Weaving Unit',
      address: 'Peenya Industrial Area, Plot 12, Bengaluru',
      pinCode: '560058',
      pan: 'CHKD7788P',
      gstin: '29CHKD7788P1Z5',
      ownerName: 'Lokesh Gowda',
      status: 'ACTIVE',
      activities: ['Textile Manufacturing']
    },
    {
      id: 'ST-002',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Cauvery Handloom Retail Shop',
      address: 'Commercial Street, Shop 44, Bengaluru',
      pinCode: '560001',
      pan: 'CHKD7788P',
      ownerName: 'Lokesh Gowda',
      status: 'ACTIVE',
      activities: ['Retail Trade']
    },
    {
      id: 'ST-003',
      department: 'Commercial Taxes (GST)',
      businessName: 'Dharwad Logistics Hub',
      address: 'Hubli-Dharwad Bypass',
      pinCode: '580020',
      pan: 'DLOG5544Q',
      gstin: '29DLOG5544Q1Z2',
      ownerName: 'Ravi M.',
      status: 'ACTIVE',
      activities: ['Logistics', 'Warehousing']
    },
    {
      id: 'ST-004',
      department: 'Labour Department',
      businessName: 'Hassan Agro Exports',
      address: 'APMC Yard, Hassan',
      pinCode: '573201',
      ownerName: 'Shiva H.',
      status: 'ACTIVE',
      activities: ['Agro Exports']
    },
    {
      id: 'ST-005',
      department: 'BESCOM (Power)',
      businessName: 'Hassan Agricultural Center',
      address: 'APMC Yard, Gate 2, Hassan',
      pinCode: '573201',
      ownerName: 'Shiva H.',
      status: 'ACTIVE',
      activities: ['Agro Services']
    },
    {
      id: 'ST-006',
      department: 'Commercial Taxes (GST)',
      businessName: 'Mysuru Heritage Silks (Closed)',
      address: 'Mysuru Road, Sector 1',
      pinCode: '570001',
      pan: 'MHSI9922Z',
      gstin: '29MHSI9922Z1Z9',
      ownerName: 'Heritage Group',
      status: 'CLOSED',
      activities: ['Retail']
    },
    {
      id: 'ST-007',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Apex Electronics',
      address: 'Brigade Road, Bengaluru',
      pinCode: '560001',
      pan: 'APEX1111A',
      ownerName: 'Rahul K.',
      status: 'ACTIVE',
      activities: ['Retail Electronics']
    },
    {
      id: 'ST-008',
      department: 'Labour Department',
      businessName: 'Apex Electronics',
      address: 'Brigade Road, Bengaluru',
      pinCode: '560001',
      pan: 'DIFF2222B', // SAME NAME, DIFFERENT PAN
      ownerName: 'Rahul K.',
      status: 'ACTIVE',
      activities: ['Consumer Durables']
    }
  ];

  return { sourceRecords };
};

export const MOCK_UBIDS: UBIDRecord[] = []; // Will be populated by resolveUBIDs at runtime in App.tsx

export const MOCK_EVENTS: ActivityEvent[] = [
  { 
    id: 'E1', 
    ubid: 'AUTO-GEN-1', 
    department: 'KSPCB (Pollution Control)', 
    eventType: 'Inspection', 
    date: '2026-04-10', 
    details: 'Factory Inspection: Fully Compliant', 
    value: 'High', 
    businessNameHint: 'Cauvery Hi-Tech Weaving Unit' 
  },
  { 
    id: 'E2', 
    ubid: 'AUTO-GEN-1', 
    department: 'BESCOM (Power)', 
    eventType: 'Bill Payment', 
    date: '2026-04-15', 
    details: 'Industrial Grid Usage: Consistent', 
    value: 'High',
    businessNameHint: 'Cauvery Hi-Tech Weaving Unit'
  },
  {
    id: 'E3',
    ubid: 'AUTO-GEN-1',
    department: 'Shop & Establishment (BBMP)',
    eventType: 'License Renewal',
    date: '2026-03-20',
    details: 'Trade License Renewal: Success',
    value: 'Medium',
    businessNameHint: 'Cauvery Handloom Retail Shop'
  },
  {
    id: 'E4',
    ubid: 'AUTO-GEN-2',
    department: 'Commercial Taxes (GST)',
    eventType: 'Tax Filing',
    date: '2026-04-05',
    details: 'GSTR-3B Filing: On Time',
    value: 'High',
    businessNameHint: 'Dharwad Logistics Hub'
  },
  {
    id: 'E5',
    ubid: 'AUTO-GEN-3',
    department: 'Labour Department',
    eventType: 'Inspection',
    date: '2026-04-12',
    details: 'Export Permit Compliance Check: Pass',
    value: 'High',
    businessNameHint: 'Hassan Agro Exports'
  },
  {
    id: 'E6',
    ubid: 'AUTO-GEN-3',
    department: 'BESCOM (Power)',
    eventType: 'Safety Audit',
    date: '2026-04-14',
    details: 'High-tension power safety audit: Verified',
    value: 'Medium',
    businessNameHint: 'Hassan Agricultural Center'
  },
  {
    id: 'E7',
    ubid: 'AUTO-GEN-4',
    department: 'Commercial Taxes (GST)',
    eventType: 'Tax Filing',
    date: '2025-01-20',
    details: 'Final Return (GSTR-10) - Business Ceased',
    value: 'Low',
    businessNameHint: 'Mysuru Heritage Silks (Closed)'
  },
  {
    id: 'E8',
    ubid: 'AUTO-GEN-5',
    department: 'Shop & Establishment (BBMP)',
    eventType: 'License Renewal',
    date: '2026-04-20',
    details: 'Trade License Renewal under PAN APEX1111A',
    value: 'Medium',
    businessNameHint: 'Apex Electronics'
  }
];
