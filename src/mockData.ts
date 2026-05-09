import { SourceRecord, ActivityEvent, UBIDRecord } from './types';

/**
 * SECTION 10: SAMPLE DATA TO TEST WITH
 * Implement exactly as specified in system instructions.
 */
export const generateMockData = () => {
  const sourceRecords: SourceRecord[] = [
    // Shop Establishment
    {
      id: 'SE001',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Sri Lakshmi Textiles Pvt Ltd',
      address: 'Peenya Industrial Area, Plot 10',
      pinCode: '560058',
      lat: 12.9716,
      lng: 77.5946,
      ownerName: 'Venkatesh Rao',
      status: 'ACTIVE'
    },
    {
      id: 'SE002',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Lakshmi Tex',
      address: 'Peenya, Phase 1',
      pinCode: '560058',
      lat: 12.9718,
      lng: 77.5948,
      ownerName: 'L. Reddy',
      status: 'ACTIVE'
    },
    {
      id: 'SE003',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Raj Industries Ltd',
      address: 'MG Road, Bengaluru',
      pinCode: '560001',
      lat: 12.9800,
      lng: 77.6100,
      pan: 'AABCR1234D',
      gstin: '29AABCR1234D1Z5',
      ownerName: 'Raj Singh',
      status: 'ACTIVE'
    },
    {
      id: 'SE004',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Raj Industries',
      address: 'MG Road, Suite 201',
      pinCode: '560001',
      lat: 12.9801,
      lng: 77.6099,
      pan: 'AABCR1234D',
      ownerName: 'Raj Singh',
      status: 'ACTIVE'
    },
    // Factories
    {
      id: 'FA001',
      department: 'Factories & Boilers',
      businessName: 'SL Textiles',
      address: 'Peenya Industrial Area',
      pinCode: '560058',
      lat: 12.9720,
      lng: 77.5950,
      ownerName: 'Venkatesh Rao',
      status: 'ACTIVE'
    },
    {
      id: 'FA002',
      department: 'Factories & Boilers',
      businessName: 'Raj Inds Pvt Ltd',
      address: 'MG Road Area',
      pinCode: '560001',
      lat: 12.9799,
      lng: 77.6102,
      pan: 'AABCR1234D',
      gstin: '29AABCR1234D1Z5',
      ownerName: 'Raj Singh',
      status: 'ACTIVE'
    },
    {
      id: 'FA003',
      department: 'Factories & Boilers',
      businessName: 'Kumar Brothers Manufacturing',
      address: 'Koramangala 4th Block',
      pinCode: '560034',
      lat: 12.9600,
      lng: 77.5800,
      pan: 'AAXPK9876G',
      ownerName: 'S. Kumar',
      status: 'ACTIVE'
    },
    // KSPCB
    {
      id: 'KS001',
      department: 'KSPCB (Pollution Control)',
      businessName: 'Lakshmi Tex Industries',
      address: 'Peenya Indl Area',
      pinCode: '560058',
      lat: 12.9717,
      lng: 77.5947,
      ownerName: 'L. Reddy',
      status: 'ACTIVE'
    },
    {
      id: 'KS002',
      department: 'KSPCB (Pollution Control)',
      businessName: 'Raj Industries Limited',
      address: 'MG Road',
      pinCode: '560001',
      lat: 12.9800,
      lng: 77.6101,
      pan: 'AABCR1234D',
      gstin: '29AABCR1234D1Z5',
      ownerName: 'Raj Singh',
      status: 'ACTIVE'
    },
    {
      id: 'KS003',
      department: 'KSPCB (Pollution Control)',
      businessName: 'Krishna Textiles',
      address: 'Peenya Industrial Area, Plot 10 (Branch)',
      pinCode: '560058',
      lat: 12.9716, // SAME GEO AS SE001
      lng: 77.5946,
      ownerName: 'K. Krishna',
      status: 'ACTIVE'
    },
    // --- STRESS TEST DATA (User Provided) ---
    {
      id: 'CT-01',
      department: 'Commercial Taxes',
      businessName: 'Reliance Retail Ltd',
      pan: 'ABCDE1234F',
      gstin: '29ABCDE1234F1Z1',
      pinCode: '560001',
      address: 'MG Road, Central',
      ownerName: 'D. Ambani',
      status: 'ACTIVE'
    },
    {
      id: 'CT-02',
      department: 'Commercial Taxes',
      businessName: 'Reliance Trends',
      pan: 'ABCDE1234F',
      gstin: '29ABCDE1234F2Z5',
      pinCode: '560011',
      address: 'Jayanagar Shopping Complex',
      ownerName: 'D. Ambani',
      status: 'ACTIVE'
    },
    {
      id: 'BE-01',
      department: 'BESCOM (Power)',
      businessName: 'Reliance Retail Hub',
      pan: 'ABCDE1234F',
      pinCode: '560001',
      address: 'MG Road Hub',
      ownerName: 'D. Ambani',
      status: 'ACTIVE'
    },
    {
      id: 'BE-02',
      department: 'BESCOM (Power)',
      businessName: 'Trends Store',
      pan: 'ABCDE1234F',
      pinCode: '560011',
      address: 'Jayanagar Outer Ring',
      ownerName: 'D. Ambani',
      status: 'ACTIVE'
    },
    {
      id: 'LB-01',
      department: 'Labour Department',
      businessName: 'Venkateshwara Industrial Works',
      pinCode: '560058',
      address: 'Peenya 2nd Stage',
      ownerName: 'Ravi Kumar',
      status: 'ACTIVE'
    },
    {
      id: 'LB-02',
      department: 'Labour Department',
      businessName: 'Venkatshwar Ind. Wrks',
      pinCode: '560058',
      address: 'Peenya 2nd Stg',
      ownerName: 'Ravi Kumar',
      status: 'ACTIVE'
    },
    {
      id: 'TL-01',
      department: 'BBMP Trade License',
      businessName: 'Sai Refreshments',
      address: '12th Main, Indiranagar',
      pinCode: '560038',
      ownerName: 'Anil K.',
      status: 'ACTIVE'
    },
    {
      id: 'TL-02',
      department: 'BBMP Trade License',
      businessName: 'Sai Refreshments',
      address: '45th Cross, Indiranagar',
      pinCode: '560038',
      ownerName: 'Sunil M.',
      status: 'ACTIVE'
    },
    {
      id: 'FB-01',
      department: 'Factories & Boilers',
      businessName: 'Cauvery Precision Tools',
      pinCode: '570016',
      address: 'Hebbal Indl Estate, Mysuru',
      ownerName: 'S. Murthy',
      status: 'ACTIVE'
    },
    // --- DORMANT MOCK DATA ---
    {
      id: 'DM-01',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Old World Antiques',
      address: 'Brigade Road, Shop 12',
      pinCode: '560001',
      ownerName: 'M. Hussain',
      status: 'ACTIVE'
    },
    // --- REVENUE RISK / HIGH VALUE ORPHAN ---
    {
      id: 'RR-01',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Shadow Tech Operations',
      address: 'HSR Layout, Sector 2', // No PAN or GSTIN
      pinCode: '560102',
      ownerName: 'Unknown',
      status: 'ACTIVE'
    },
    // --- CONTRADICTION / EVASION RISK ---
    {
      id: 'RR-02',
      department: 'Commercial Taxes',
      businessName: 'Neon Lights Bar & Restaurant',
      pan: 'BXTPR8888Z',
      gstin: '29BXTPR8888Z1Z5',
      address: 'Indiranagar 100ft Road',
      pinCode: '560038',
      ownerName: 'K. Sharma',
      status: 'ACTIVE'
    }
  ];

  return { sourceRecords };
};

export const MOCK_UBIDS: UBIDRecord[] = [];

export const MOCK_EVENTS: ActivityEvent[] = [
  // --- STRESS TEST EVENTS ---
  {
    id: 'BE-EVT-01',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'Meter Reading',
    date: '2025-01-10',
    details: 'Meter reading (Hub)',
    value: 0, // Dormancy Test: Reading is 0
    raw_record_id: 'BE-01',
    businessNameHint: 'Reliance Retail Hub'
  },
  {
    id: 'BE-EVT-02',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'Meter Reading',
    date: '2026-05-01',
    details: 'High load reading',
    value: 4500,
    raw_record_id: 'BE-02',
    businessNameHint: 'Trends Store'
  },
  // --- DORMANT MOCK EVENTS ---
  {
    id: 'EVT-DORMANT-01',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2025-08-15', // ~9 months ago = DORMANT
    details: 'Power consumption',
    value: 120,
    raw_record_id: 'DM-01',
    businessNameHint: 'Old World Antiques'
  },
  {
    id: 'EVT-DORMANT-02',
    ubid: '',
    department: 'BBMP Trade License',
    eventType: 'RENEWAL',
    date: '2025-07-20',
    details: 'Last renewal',
    value: null,
    raw_record_id: 'DM-01',
    businessNameHint: 'Old World Antiques'
  },
  // --- REVENUE RISK / HIGH VALUE ORPHAN MOCK EVENTS ---
  {
    id: 'EVT-RR-01',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2026-04-20', // Very recent
    details: 'Heavy commercial power load',
    value: 15400, // Very high consumption
    raw_record_id: 'RR-01',
    businessNameHint: 'Shadow Tech Operations'
  },
  {
    id: 'EVT-RR-02',
    ubid: '',
    department: 'BWSSB (Water)',
    eventType: 'CONSUMPTION',
    date: '2026-05-02', 
    details: 'Commercial water connection',
    value: 8000,
    raw_record_id: 'RR-01',
    businessNameHint: 'Shadow Tech Operations'
  },
  // --- CONTRADICTION / EVASION RISK MOCK EVENTS ---
  {
    id: 'EVT-RR-03',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2026-05-05', // Active power yesterday
    details: 'Active commercial usage',
    value: 9500,
    raw_record_id: 'RR-02',
    businessNameHint: 'Neon Lights Bar & Restaurant'
  },
  {
    id: 'EVT-RR-04',
    ubid: '',
    department: 'Commercial Taxes (GST)',
    eventType: 'Tax Filing',
    date: '2024-10-10', // Last filing over 1.5 years ago
    details: 'Last GST Filing',
    value: 0, // Or non-filed
    raw_record_id: 'RR-02',
    businessNameHint: 'Neon Lights Bar & Restaurant'
  },
  // --- EXISTING MOCK EVENTS ---
  {
    id: 'EVT001',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2024-11-15',
    details: 'Power consumption signal',
    value: 8400,
    raw_record_id: 'SE001', // Joined via SE001
    businessNameHint: 'Sri Lakshmi Textiles Pvt Ltd'
  },
  {
    id: 'EVT002',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2024-12-01',
    details: 'Power consumption signal',
    value: 8200,
    raw_record_id: 'FA001', // Joined via FA001
    businessNameHint: 'SL Textiles'
  },
  {
    id: 'EVT003',
    ubid: '',
    department: 'KSPCB (Pollution Control)',
    eventType: 'Inspection',
    date: '2023-06-10',
    details: 'Environmental Compliance Inspection',
    value: null,
    raw_record_id: 'KS001', // Joined via KS001
    businessNameHint: 'Lakshmi Tex Industries'
  },
  {
    id: 'EVT004',
    ubid: '',
    department: 'Commercial Taxes (GST)',
    eventType: 'Tax Filing',
    date: '2024-12-20',
    details: 'GST Filing Return',
    value: 45000,
    raw_record_id: 'SE003', // Joined via SE003
    businessNameHint: 'Raj Industries Ltd'
  },
  {
    id: 'EVT005',
    ubid: '',
    department: 'BESCOM (Power)',
    eventType: 'CONSUMPTION',
    date: '2024-12-18',
    details: 'Industrial load reading',
    value: 12000,
    raw_record_id: 'FA002', // Joined via FA002
    businessNameHint: 'Raj Inds Pvt Ltd'
  },
  {
    id: 'EVT006',
    ubid: '',
    department: 'BBMP Trade License',
    eventType: 'RENEWAL',
    date: '2024-11-01',
    details: 'Renewal check',
    value: null,
    raw_record_id: 'UNKNOWN99', // UNLINKED TEST
    businessNameHint: 'Mystery Entity'
  }
];
