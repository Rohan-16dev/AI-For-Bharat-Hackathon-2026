import { SourceRecord, ActivityEvent, Department, UBIDRecord } from './types';
import { subMonths, format } from 'date-fns';

const DEPARTMENTS: Department[] = ['Shop & Establishment', 'Factories', 'Labour', 'KSPCB', 'BESCOM'];

const SAMPLE_NAMES = [
  'Sri Lakshmi Enterprises',
  'Laxmi Ent.',
  'Peenya Precision Tools',
  'Precision Tools & Dies',
  'Karnataka Steel Works',
  'KA Steel Works Pvt Ltd',
  'Green Valley Agro',
  'Green Valley Agricultural Products',
  'Modern Textiles',
  'Modern Textile Mills',
];

const SAMPLE_ADDRESSES = [
  'Plot 45, 2nd Phase, Peenya Industrial Area',
  'No 45, Peenya 2nd Phase, Bangalore',
  '12/A, Industrial Suburb, Yeshwanthpur',
  '12A, Yeshwanthpur Industrial Suburb',
  'Survey No 89, Whitefield Main Road',
  '89, Main Rd, Whitefield',
];

export const generateMockData = () => {
  const sourceRecords: SourceRecord[] = [];
  const activityEvents: ActivityEvent[] = [];

  // Generate some overlapping records to simulate entity resolution needs
  for (let i = 0; i < 20; i++) {
    const baseName = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
    const baseAddress = SAMPLE_ADDRESSES[Math.floor(Math.random() * SAMPLE_ADDRESSES.length)];
    const pinCode = '560058';
    const pan = Math.random() > 0.3 ? `ABCDE${1000 + i}F` : undefined;

    // Create 2-3 records for the same business across different departments
    const numRecords = Math.floor(Math.random() * 2) + 2;
    for (let j = 0; j < numRecords; j++) {
      sourceRecords.push({
        id: `REC-${i}-${j}`,
        department: DEPARTMENTS[Math.floor(Math.random() * DEPARTMENTS.length)],
        businessName: j === 0 ? baseName : baseName.substring(0, baseName.length - Math.floor(Math.random() * 5)),
        address: j === 0 ? baseAddress : baseAddress.replace('Road', 'RD').replace('Industrial', 'Ind.'),
        pinCode,
        pan,
        ownerName: 'White Hawk Coders',
      });
    }
  }

  return { sourceRecords };
};

export const MOCK_UBIDS: UBIDRecord[] = [
  {
    ubid: 'KA-7L8K2P9R-5',
    anchorType: 'Central',
    anchorId: '29AAAAA0000A1Z5',
    canonicalName: 'Sri Lakshmi Enterprises',
    canonicalAddress: 'Plot 45, 2nd Phase, Peenya Industrial Area, Bangalore 560058',
    pinCode: '560058',
    pan: 'ABCDE1234F',
    gstin: '29AAAAA0000A1Z5',
    status: 'Active',
    statusHistory: [
      { from: 'Unknown', to: 'Active', reason: 'Initial Entity Resolution', timestamp: subMonths(new Date(), 0.6).toISOString(), actor: 'System (Anchoring Logic)', type: 'System' }
    ],
    confidence: 0.99,
    riskScore: 12,
    evidence: ['GSTIN Exact Match (Commercial Taxes)', 'PAN Match (Factories)', 'Address Fuzzy Match (Labour)'],
    lastUpdated: format(subMonths(new Date(), 0.5), 'yyyy-MM-dd'),
    linkedRecords: [
      { id: 'R1', department: 'Factories', businessName: 'Sri Lakshmi Enterprises', address: 'Plot 45, Peenya', pinCode: '560058', pan: 'ABCDE1234F', gstin: '29AAAAA0000A1Z5', ownerName: 'White Hawk' },
      { id: 'R2', department: 'Labour', businessName: 'Laxmi Ent.', address: '45, 2nd Phase Peenya', pinCode: '560058', ownerName: 'White Hawk' },
    ]
  },
  {
    ubid: 'KA-B4V6N1M8-X',
    anchorType: 'Central',
    anchorId: 'BPLAS8899K',
    canonicalName: 'Bharath Plastics Ltd',
    canonicalAddress: 'No 22, 1st Cross, Peenya 1st Stage, Bangalore 560058',
    pinCode: '560058',
    pan: 'BPLAS8899K',
    status: 'Active',
    statusHistory: [
      { from: 'Unknown', to: 'Active', reason: 'PAN-based Anchor Creation', timestamp: subMonths(new Date(), 4.2).toISOString(), actor: 'System (Risk Engine)', type: 'System' }
    ],
    confidence: 0.94,
    riskScore: 35,
    lastUpdated: format(subMonths(new Date(), 4), 'yyyy-MM-dd'),
    evidence: ['PAN Match (KSPCB)', 'Name Match (KSPCB)'],
    linkedRecords: [
      { id: 'R21', department: 'KSPCB', businessName: 'Bharath Plastics', address: '22, 1st Cross, Peenya', pinCode: '560058', pan: 'BPLAS8899K', ownerName: 'Gopal Krishnan' },
    ]
  },
  {
    ubid: 'KA-X9W3Q7Z2-K',
    anchorType: 'Internal',
    canonicalName: 'Green Valley Agro',
    canonicalAddress: 'No 124, Bagalur Road, Yelahanka, Bangalore 560063',
    pinCode: '560063',
    status: 'Closed',
    statusHistory: [
      { from: 'Active', to: 'Dormant', reason: 'No signals detected (6m Gap)', timestamp: subMonths(new Date(), 5.5).toISOString(), actor: 'System (Logic Engine)', type: 'System' },
      { from: 'Dormant', to: 'Closed', reason: 'Explicit Disconnection Event', timestamp: subMonths(new Date(), 5.1).toISOString(), actor: 'BESCOM Data Processing', type: 'System' }
    ],
    confidence: 0.78,
    riskScore: 88,
    lastUpdated: format(subMonths(new Date(), 5), 'yyyy-MM-dd'),
    evidence: ['Name Match (Labour)', 'Address Fuzzy Match (Factories)'],
    linkedRecords: [
      { id: 'R6', department: 'Labour', businessName: 'Green Valley Agro', address: '124 Bagalur Rd', pinCode: '560063', ownerName: 'Meena S.' },
      { id: 'R7', department: 'Factories', businessName: 'Green Valley Agricultural Products', address: 'No 124, Yelahanka', pinCode: '560063', ownerName: 'Meena S.' },
    ]
  },
];

export const MOCK_EVENTS: ActivityEvent[] = [
  { id: 'E1', ubid: 'KA-7L8K2P9R-5', department: 'KSPCB', eventType: 'Inspection', date: format(subMonths(new Date(), 2), 'yyyy-MM-dd'), details: 'Routine environmental compliance check', value: 'High', businessNameHint: 'Sri Lakshmi Enterprises', addressHint: 'Plot 45, Peenya Ind Area', pinCodeHint: '560058' },
  { id: 'E2', ubid: 'KA-7L8K2P9R-5', department: 'BESCOM', eventType: 'Bill Payment', date: format(subMonths(new Date(), 1), 'yyyy-MM-dd'), details: 'Monthly electricity bill paid', value: 'Low' },
  { id: 'E3', ubid: 'KA-B4V6N1M8-X', department: 'Labour', eventType: 'Compliance Filing', date: format(subMonths(new Date(), 14), 'yyyy-MM-dd'), details: 'Annual return filed', value: 'High', businessNameHint: 'Bharath Plastics', pinCodeHint: '560058' },
  { id: 'E4', ubid: 'KA-7L8K2P9R-5', department: 'Factories', eventType: 'Safety Audit', date: format(subMonths(new Date(), 3), 'yyyy-MM-dd'), details: 'Quarterly safety standards verification', value: 'High' },
  { id: 'E5', ubid: 'KA-B4V6N1M8-X', department: 'KSPCB', eventType: 'Renewal', date: format(subMonths(new Date(), 6), 'yyyy-MM-dd'), details: 'Pollution control certificate renewed', value: 'Medium' },
  { id: 'E6', ubid: 'KA-X9W3Q7Z2-K', department: 'BESCOM', eventType: 'Meter Reading', date: format(subMonths(new Date(), 0.5), 'yyyy-MM-dd'), details: 'Industrial high-tension meter reading', value: 'Low' },
  { id: 'E7', ubid: 'KA-X9W3Q7Z2-K', department: 'Shop & Establishment', eventType: 'License Renewal', date: format(subMonths(new Date(), 10), 'yyyy-MM-dd'), details: 'Trade license successfully renewed', value: 'High' },
  { id: 'E8', ubid: 'KA-X9W3Q7Z2-K', department: 'BESCOM', eventType: 'Disconnection', date: format(subMonths(new Date(), 5), 'yyyy-MM-dd'), details: 'Power supply disconnected on request', value: 'Critical' },
  { id: 'E11', ubid: 'KA-7L8K2P9R-5', department: 'Factories', eventType: 'Safety Audit', date: format(subMonths(new Date(), 0.5), 'yyyy-MM-dd'), details: 'CNC workshop safety certification', value: 'High' },
  { id: 'E12', ubid: 'KA-B4V6N1M8-X', department: 'KSPCB', eventType: 'Emission Test', date: format(subMonths(new Date(), 1), 'yyyy-MM-dd'), details: 'Plastic moulding emission monitoring', value: 'Medium' },
  { id: 'E13', ubid: '', department: 'Labour', eventType: 'Inspection', date: format(subMonths(new Date(), 0.1), 'yyyy-MM-dd'), details: 'Child labour compliance verification', value: 'High', businessNameHint: 'SRI LAXMI ENT', addressHint: '45, PEENYA II PHASE', pinCodeHint: '560058' },
  { id: 'E14', ubid: '', department: 'BESCOM', eventType: 'Load Upgrade', date: format(subMonths(new Date(), 0.2), 'yyyy-MM-dd'), details: 'Request for 50HP power upgrade', value: 'Medium', businessNameHint: 'GREEN VALEY AGRO', addressHint: '124, BAGALUR RD', pinCodeHint: '560063' },
];
