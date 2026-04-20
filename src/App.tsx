import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import Fuse from 'fuse.js';
import { debounce } from 'lodash';
import { 
  LayoutDashboard, 
  Search, 
  Users, 
  Activity, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  ChevronRight,
  Filter,
  Download,
  Info,
  ArrowRight,
  MapPin,
  Building2,
  FileText,
  Sparkles,
  ExternalLink,
  ChevronDown,
  History,
  Link as LinkIcon,
  Fingerprint,
  ShieldCheck,
  RefreshCcw,
  Zap,
  Link2Off,
  MousePointer2,
  Settings,
  Shield,
  FileSearch,
  Lock
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Treemap,
  ComposedChart,
  Area,
  Line
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { subMonths, formatDistanceToNow, parseISO, format } from 'date-fns';
import { cn } from './lib/utils';
import { MOCK_UBIDS, MOCK_EVENTS, generateMockData } from './mockData';
import { SelfHealingBridge } from './components/SelfHealingBridge';
import { SchemaEvolutionTool } from './components/SchemaEvolutionTool';
import { UBIDRecord, ActivityEvent, Department, MatchSuggestion, StatusChange, SystemKnowledge, SourceRecord, AuditEntry } from './types';
import { resolveUBIDs } from './services/ubidService';
import { inferBusinessStatus, findOrphanEvents, StatusVerdict } from './services/statusInferenceService';
import { compareRecords, normalizeString } from './services/fuzzyMatchingService';
import { GeminiChat } from './components/GeminiChat';
import { ThinkingAssistant } from './components/ThinkingAssistant';
import { getMapsGroundingInfo } from './services/geminiService';

// --- Components ---

const StatCard = React.memo(({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
  <motion.div 
    whileHover={{ y: -2 }}
    className="bg-card p-4 rounded-lg border border-border shadow-sm hover:shadow-md transition-all cursor-default"
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">{title}</span>
      <Icon className={cn("w-4 h-4", color.replace('bg-', 'text-'))} />
    </div>
    <div className="text-2xl font-bold text-text-main">{value}</div>
  </motion.div>
));

StatCard.displayName = 'StatCard';

const Dashboard = ({ ubids, events }: { ubids: UBIDRecord[], events: ActivityEvent[] }) => {
  const [mapsInfo, setMapsInfo] = useState<string | null>(null);
  const [isMapsLoading, setIsMapsLoading] = useState(false);

  const handleFetchMapsInfo = async () => {
    setIsMapsLoading(true);
    try {
      const info = await getMapsGroundingInfo('Peenya Industrial Area');
      setMapsInfo(info || null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMapsLoading(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts = { Active: 0, Dormant: 0, Closed: 0 };
    ubids.forEach(u => {
      if (u.status === 'Active') counts.Active++;
      else if (u.status === 'Dormant') counts.Dormant++;
      else if (u.status === 'Closed') counts.Closed++;
    });
    return [
      { name: 'Active', value: counts.Active, color: '#38A169' },
      { name: 'Dormant', value: counts.Dormant, color: '#D69E2E' },
      { name: 'Closed', value: counts.Closed, color: '#E53E3E' },
    ];
  }, [ubids]);

  const deptData = useMemo(() => {
    const depts: Record<string, number> = {};
    ubids.forEach(u => {
      u.linkedRecords.forEach(r => {
        depts[r.department] = (depts[r.department] || 0) + 1;
      });
    });
    return Object.entries(depts).map(([name, count]) => ({ name, count }));
  }, [ubids]);

  const pinDensityData = useMemo(() => {
    const pinCounts: Record<string, { count: number, active: number }> = {};
    ubids.forEach(u => {
      if (!pinCounts[u.pinCode]) pinCounts[u.pinCode] = { count: 0, active: 0 };
      pinCounts[u.pinCode].count++;
      if (u.status === 'Active') pinCounts[u.pinCode].active++;
    });
    
    return Object.entries(pinCounts)
      .map(([pin, stats]) => ({ pin, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [ubids]);

  const recentEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
      .slice(0, 5);
  }, [events]);

  return (
    <div className="space-y-4">
      {/* System Status Banner */}
      <div className="bg-white px-4 py-2 rounded-lg border border-border flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-status-active animate-pulse" />
            <span className="text-[10px] font-bold text-text-main uppercase">Registry Online</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-status-active" />
            <span className="text-[10px] font-bold text-text-muted uppercase">Integrity Verified</span>
          </div>
        </div>
        <div className="text-[10px] text-text-muted">
          Last sync: <span className="font-bold">Just now</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total UBIDs" value={ubids.length.toLocaleString()} icon={Database} color="bg-accent" />
        <StatCard title="Active Businesses" value={statusCounts.find(s => s.name === 'Active')?.value.toLocaleString() || '0'} icon={Activity} color="bg-status-active" />
        <StatCard title="Compliance Health" value={`${((statusCounts.find(s => s.name === 'Active')?.value || 0) / (ubids.length || 1) * 100).toFixed(1)}%`} icon={Shield} color="bg-status-active" />
        <StatCard title="Orphan Signals" value={events.filter(e => !ubids.find(u => u.ubid === e.ubid)).length} icon={AlertCircle} color="bg-status-closed" />
      </div>

      {/* Grid Analysis */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-text-main">Geospatial Registry Density (by PIN Code)</h3>
          <span className="text-[10px] text-text-muted">Direct Database Mapping</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {pinDensityData.map(item => (
            <div key={item.pin} className="p-3 bg-bg/50 rounded border border-border flex flex-col items-center">
              <span className="text-[10px] font-bold text-text-muted">{item.pin}</span>
              <div className="w-full h-1 bg-gray-200 mt-2 rounded overflow-hidden">
                <div 
                  className="h-full bg-accent" 
                  style={{ width: `${Math.min(100, (item.count / Math.max(1, ...pinDensityData.map(p => p.count))) * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-text-main mt-1.5">{item.count.toLocaleString()}</span>
            </div>
          ))}
          {pinDensityData.length === 0 && (
            <div className="col-span-full py-4 text-center text-xs text-text-muted italic">
              No registry data available for density mapping.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status Distribution */}
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-main mb-4">Business Status Distribution</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusCounts}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusCounts.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {statusCounts.map(item => (
              <div key={item.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-text-muted">{item.name} ({item.value})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-main mb-4">Registry Source Breakdown (by Entity)</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#718096' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#718096' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2B6CB0" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {deptData.length === 0 && (
            <p className="text-center text-xs text-text-muted italic mt-4">No departmental data linked.</p>
          )}
        </div>
      </div>

      <div className="bg-card p-4 rounded-lg border border-border shadow-sm flex flex-col">
        <h3 className="text-sm font-bold text-text-main mb-4">Operational Signal Velocity (Activity Tracking)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pinDensityData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="pin" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#718096' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#718096' }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" fill="#EBF8FF" stroke="#3182CE" name="Total Entities" />
              <Line type="monotone" dataKey="active" stroke="#38A169" strokeWidth={2} dot={false} name="Active Entities" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-4 px-2 justify-center">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            Total Record Volume
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            Verified Active Status
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Strategic AI Insights */}
        <div className="lg:col-span-3 bg-blue-50/30 p-4 rounded-lg border border-blue-100 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text-main">Strategic AI Insights</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-white rounded border border-blue-100">
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Entity Resolution</p>
              <p className="text-xs text-text-main leading-relaxed">
                AI has identified a <span className="font-bold text-status-active">14% increase</span> in cross-departmental matches this month. 428 records are currently awaiting manual verification in the high-confidence tier.
              </p>
            </div>
            <div className="p-3 bg-white rounded border border-blue-100">
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Compliance Risk</p>
              <p className="text-xs text-text-main leading-relaxed">
                <span className="font-bold text-status-closed">8.2% of businesses</span> in the Peenya cluster show no activity signals for 18+ months. Recommended action: Targeted inspections for potential dormant entities.
              </p>
            </div>
            <div className="p-3 bg-white rounded border border-blue-100">
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Data Integrity</p>
              <p className="text-xs text-text-main leading-relaxed">
                PAN/GSTIN linkage has reached <span className="font-bold text-status-active">92% coverage</span>. Missing identifiers are primarily concentrated in the 'Shop & Establishment' sector (approx. 1,200 records).
              </p>
            </div>
          </div>
        </div>

        {/* Maps Grounding Section */}
        <div className="lg:col-span-2 bg-card p-4 rounded-lg border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-bold text-text-main">Local Industrial Intelligence (Peenya)</h3>
            </div>
            <button 
              onClick={handleFetchMapsInfo}
              disabled={isMapsLoading}
              className="text-[10px] font-bold text-accent uppercase tracking-wider hover:underline disabled:opacity-50"
            >
              {isMapsLoading ? 'Fetching...' : 'Refresh Maps Data'}
            </button>
          </div>
          <div className="bg-bg/50 p-4 rounded border border-border overflow-y-auto max-h-[300px]">
            {mapsInfo ? (
              <div className="prose prose-sm max-w-none prose-p:text-xs prose-p:text-text-main prose-headings:text-sm prose-headings:font-bold prose-headings:text-accent prose-li:text-xs prose-li:text-text-main">
                <ReactMarkdown>{mapsInfo}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-xs text-text-muted italic">Click refresh to fetch real-time data about the Peenya Industrial Area using Google Maps grounding.</p>
            )}
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
          <h3 className="text-sm font-bold text-text-main mb-4">Recent System Activity</h3>
          <div className="space-y-4">
            {recentEvents.map((event, idx) => (
              <div key={event.id} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-text-main">{event.eventType}</p>
                  <p className="text-[10px] text-text-muted">{event.ubid} • {event.department}</p>
                  <p className="text-[9px] text-text-muted/60 mt-0.5">{event.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Mock Data for Reviewer Queue ---
const INITIAL_SUGGESTIONS: MatchSuggestion[] = [
  {
    id: 'S1',
    confidence: 0.94,
    priority: 'High',
    status: 'Pending',
    recordA: {
      id: 'F101',
      department: 'Factories',
      businessName: 'SRI LAKSHMI ENTERPRISES',
      address: 'PLOT 45, 2ND PHASE, PEENYA IND AREA',
      pinCode: '560058',
      ownerName: 'White Hawk Coders',
      phone: '+91 98450 12345',
      email: 'ramesh@lakshmient.com',
      gstin: '29AAAAA0000A1Z5'
    },
    recordB: {
      id: 'L202',
      department: 'Labour',
      businessName: 'LAXMI ENT.',
      address: '45, PEENYA 2ND PHASE, BANGALORE',
      pinCode: '560058',
      ownerName: 'White Hawk C',
      phone: '9845012345',
      email: 'admin@lakshmient.com',
      gstin: '29AAAAA0000A1Z5'
    },
    reasons: ['GSTIN Exact Match', 'Address similarity: 94%', 'Name phonetic match: 88%', 'Owner name match: 91%'],
    confidenceBreakdown: { name: 0.88, address: 0.94, location: 1.0 },
    riskFactors: ['Minor address discrepancy', 'Owner name abbreviation']
  },
  {
    id: 'S2',
    confidence: 0.76,
    priority: 'Medium',
    status: 'Pending',
    recordA: {
      id: 'SE303',
      department: 'Shop & Establishment',
      businessName: 'MODERN TEXTILE MILLS',
      address: 'SY NO 89, WHITEFIELD MAIN RD',
      pinCode: '560066',
      ownerName: 'ANITA SINGH',
      phone: '+91 80 2839 4455',
      email: 'info@moderntextiles.in',
      gstin: '29BBBBB1111B1Z2'
    },
    recordB: {
      id: 'P404',
      department: 'KSPCB',
      businessName: 'MODERN TEXTILES',
      address: '89, MAIN RD, WHITEFIELD',
      pinCode: '560066',
      ownerName: 'ANITA S',
      phone: '080-28394455',
      email: 'anita.s@moderntextiles.in',
      gstin: 'Pending'
    },
    reasons: ['PIN Code match', 'Name similarity: 82%', 'Address similarity: 78%', 'Phone number match'],
    confidenceBreakdown: { name: 0.82, address: 0.78, location: 1.0 },
    riskFactors: ['Missing GSTIN in Record B', 'Address format variation']
  },
  {
    id: 'S3',
    confidence: 0.88,
    priority: 'High',
    status: 'Pending',
    recordA: {
      id: 'TL505',
      department: 'Shop & Establishment', // BBMP Trade License
      businessName: 'PRECISION TOOLS PVT LTD',
      address: 'NO 12, 4TH CROSS, RAJAJINAGAR',
      pinCode: '560010',
      ownerName: 'VIJAY BHASKAR',
      phone: '+91 99000 88776',
      email: 'v.bhaskar@precision.com',
      gstin: '29CCCCC2222C1Z9'
    },
    recordB: {
      id: 'CT606',
      department: 'Factories', // Commercial Taxes
      businessName: 'PRECISION TOOLS PRIVATE LIMITED',
      address: '12, 4TH CROSS, RAJAJINAGAR, BENGALURU',
      pinCode: '560010',
      ownerName: 'VIJAY BHASKAR',
      phone: '9900088776',
      email: 'accounts@precisiontools.com',
      gstin: '29CCCCC2222C1Z9'
    },
    reasons: ['GSTIN Exact Match', 'Owner Name Exact Match', 'Address similarity: 98%'],
    confidenceBreakdown: { name: 1.0, address: 0.98, location: 1.0 },
    riskFactors: ['None - High Integrity Match']
  },
  {
    id: 'S4',
    confidence: 0.92,
    priority: 'High',
    status: 'Pending',
    recordA: {
      id: 'BE707',
      department: 'BESCOM',
      businessName: 'GALAXY PLASTICS',
      address: 'PLOT 12, KIADB INDUSTRIAL AREA, BOMMASANDRA',
      pinCode: '560099',
      ownerName: 'RAJESH MEHTA',
      phone: '080-27831122',
      email: 'info@galaxyplastics.com',
      gstin: '29DDDDD3333D1Z8'
    },
    recordB: {
      id: 'PC808',
      department: 'KSPCB',
      businessName: 'GALAXY PLASTICS PVT LTD',
      address: '12, KIADB INDL AREA, BOMMASANDRA',
      pinCode: '560099',
      ownerName: 'RAJESH M',
      phone: '27831122',
      email: 'compliance@galaxyplastics.com',
      gstin: '29DDDDD3333D1Z8'
    },
    reasons: ['GSTIN Exact Match', 'Phone Suffix Match', 'Address similarity: 91%'],
    riskFactors: ['Legal entity suffix variation']
  },
  {
    id: 'S5',
    confidence: 0.68,
    priority: 'Low',
    status: 'Pending',
    recordA: {
      id: 'L909',
      department: 'Labour',
      businessName: 'SUNRISE BAKERY',
      address: '456, 10TH MAIN, JAYANAGAR 4TH BLOCK',
      pinCode: '560011',
      ownerName: 'MOHAMMED ARSHAD',
      phone: '+91 98860 55443',
      email: 'arshad@sunrise.in',
      gstin: '29EEEEE4444E1Z7'
    },
    recordB: {
      id: 'TL010',
      department: 'Shop & Establishment',
      businessName: 'SUNRISE FOODS',
      address: '456, JAYANAGAR 4TH BLOCK, BANGALORE',
      pinCode: '560011',
      ownerName: 'SARA ARSHAD',
      phone: '9886055443',
      email: 'sara@sunrise.in',
      gstin: 'Pending'
    },
    reasons: ['Address Match', 'Phone Number Match', 'Email Domain Match'],
    riskFactors: ['Different Owner Name', 'Business Name Variation']
  },
  {
    id: 'S6',
    confidence: 0.82,
    priority: 'Medium',
    status: 'Pending',
    recordA: {
      id: 'F111',
      department: 'Factories',
      businessName: 'OMEGA ENGINEERING WORKS',
      address: 'C-234, 2ND STAGE, PEENYA',
      pinCode: '560058',
      ownerName: 'KIRAN DESAI',
      phone: '+91 94480 66778',
      email: 'kiran@omegaeng.com',
      gstin: '29FFFFF5555F1Z6'
    },
    recordB: {
      id: 'CT212',
      department: 'Factories',
      businessName: 'OMEGA ENGG WORKS',
      address: 'C-234, PEENYA 2ND STAGE',
      pinCode: '560058',
      ownerName: 'KIRAN D',
      phone: '9448066778',
      email: 'accounts@omegaeng.com',
      gstin: '29FFFFF5555F1Z6'
    },
    reasons: ['GSTIN Exact Match', 'Phone Match', 'Address similarity: 95%'],
    riskFactors: ['Abbreviated Business Name']
  },
  {
    id: 'S7',
    confidence: 0.74,
    priority: 'Medium',
    status: 'Pending',
    recordA: {
      id: 'SE313',
      department: 'Shop & Establishment',
      businessName: 'BLUE CHIP SOLUTIONS',
      address: 'NO 78, 3RD FLOOR, MG ROAD',
      pinCode: '560001',
      ownerName: 'SANJAY RAO',
      phone: '+91 80 4123 9988',
      email: 'sanjay@bluechip.com',
      gstin: '29GGGGG6666G1Z5'
    },
    recordB: {
      id: 'L414',
      department: 'Labour',
      businessName: 'BLUECHIP SOLUTIONS',
      address: '78, MG ROAD, BENGALURU',
      pinCode: '560001',
      ownerName: 'SANJAY R',
      phone: '41239988',
      email: 'hr@bluechip.com',
      gstin: 'Pending'
    },
    reasons: ['Address similarity: 88%', 'Phone suffix match', 'Name phonetic match'],
    riskFactors: ['Missing GSTIN', 'Name spacing variation']
  },
  {
    id: 'S8',
    confidence: 0.96,
    priority: 'High',
    status: 'Pending',
    recordA: {
      id: 'P515',
      department: 'KSPCB',
      businessName: 'ROYAL PHARMA LTD',
      address: 'SURVEY NO 112, JIGANI INDL AREA',
      pinCode: '56105',
      ownerName: 'DR. AMIT PATEL',
      phone: '+91 99800 11223',
      email: 'amit@royalpharma.com',
      gstin: '29HHHHH7777H1Z4'
    },
    recordB: {
      id: 'F616',
      department: 'Factories',
      businessName: 'ROYAL PHARMACEUTICALS LIMITED',
      address: 'SY NO 112, JIGANI INDUSTRIAL AREA',
      pinCode: '56105',
      ownerName: 'AMIT PATEL',
      phone: '9980011223',
      email: 'compliance@royalpharma.com',
      gstin: '29HHHHH7777H1Z4'
    },
    reasons: ['GSTIN Exact Match', 'Phone Match', 'Address similarity: 97%'],
    riskFactors: ['None - High Integrity Match']
  }
];

const QualityReport = ({ ubids }: { ubids: UBIDRecord[] }) => {
  const highConf = ubids.filter(u => u.confidence >= 0.9).length;
  const ratio = ubids.length > 0 ? (highConf / ubids.length) * 100 : 0;
  return (
    <div className="bg-bg/50 p-4 rounded-lg border border-border flex items-center justify-between h-full">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-green-100 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-text-main">Data Trust Score</p>
          <p className="text-[10px] text-text-muted">{ratio.toFixed(1)}% High-Confidence</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-bold text-accent">{ratio.toFixed(0)}%</p>
        <p className="text-[9px] text-text-muted uppercase font-bold tracking-widest">Calculated</p>
      </div>
    </div>
  );
};

const CentralUBIDRegistry = ({ 
  ubids, 
  setUbids,
  onUpdateStatus,
  onUnlinkRecord,
  onResolveOrphans,
  knowledge,
  events
}: { 
  ubids: UBIDRecord[], 
  setUbids: React.Dispatch<React.SetStateAction<UBIDRecord[]>>,
  onUpdateStatus?: (ubidId: string, status: 'Active' | 'Dormant' | 'Closed', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void,
  onResolveOrphans?: () => void,
  knowledge: SystemKnowledge,
  events: ActivityEvent[]
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorFilter, setAnchorFilter] = useState<'All' | 'Central' | 'Internal'>('All');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const orphans = useMemo(() => {
    return findOrphanEvents(events, ubids)
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [events, ubids]);

  const stats = useMemo(() => ({
    total: ubids.length,
    central: ubids.filter(u => u.anchorType === 'Central').length,
    internal: ubids.filter(u => u.anchorType === 'Internal').length,
  }), [ubids]);

  const filteredUbids = useMemo(() => {
    return ubids.filter(u => {
      const matchesSearch = !searchTerm || 
        u.ubid.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.canonicalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.anchorId?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesFilter = anchorFilter === 'All' || u.anchorType === anchorFilter;
      
      return matchesSearch && matchesFilter;
    });
  }, [ubids, searchTerm, anchorFilter]);

  const runResolution = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const { sourceRecords } = generateMockData();
      const resolved = resolveUBIDs(sourceRecords, knowledge);
      setUbids(resolved);
      setIsProcessing(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-text-main flex items-center gap-2">
              <Fingerprint className="w-6 h-6 text-accent" />
              Central UBID Registry
            </h2>
            <p className="text-sm text-text-muted mt-1 shadow-inner px-2 py-0.5 bg-bg/30 rounded inline-block">
              Authoritative Cross-Departmental Identity Index
            </p>
          </div>
          <div className="flex items-center gap-3">
             <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input 
                  type="text" 
                  placeholder="Search Registry..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-bg border border-border rounded-lg text-sm focus:ring-1 focus:ring-accent outline-none w-64"
                />
             </div>
             <button 
                onClick={runResolution}
                disabled={isProcessing}
                className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-accent/90 transition-all disabled:opacity-50"
              >
                {isProcessing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isProcessing ? 'Processing...' : 'Run Automated Linking'}
              </button>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Resolved Identities" value={stats.total} icon={Fingerprint} color="bg-accent" />
            <StatCard title="Centrally Anchored" value={stats.central} icon={ShieldCheck} color="bg-status-active" />
            <StatCard title="Internally Linked" value={stats.internal} icon={LinkIcon} color="bg-status-dormant" />
          </div>
          <div className="lg:w-80">
            <QualityReport ubids={ubids} />
          </div>
        </div>

        {orphans.length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-bold text-red-900">{orphans.length} Unlinked Activity Signals Detected</p>
                <p className="text-xs text-red-700">Events from department systems exist without a matching UBID. Review required.</p>
              </div>
            </div>
            <button 
              onClick={() => onResolveOrphans?.()}
              className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded shadow hover:bg-red-700 transition-colors uppercase tracking-wider"
            >
              Resolve Orphans
            </button>
          </div>
        )}

        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-bg/20 flex items-center justify-between">
            <div className="flex items-center gap-4">
               <button 
                 onClick={() => setAnchorFilter('All')}
                 className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded", anchorFilter === 'All' ? "bg-accent text-white" : "text-text-muted hover:bg-bg")}
               >
                 All
               </button>
               <button 
                 onClick={() => setAnchorFilter('Central')}
                 className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded", anchorFilter === 'Central' ? "bg-accent text-white" : "text-text-muted hover:bg-bg")}
               >
                 Central Anchors
               </button>
               <button 
                 onClick={() => setAnchorFilter('Internal')}
                 className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded", anchorFilter === 'Internal' ? "bg-accent text-white" : "text-text-muted hover:bg-bg")}
               >
                 Internal Anchors
               </button>
            </div>
            <span className="text-[10px] font-bold text-text-muted uppercase">Showing {filteredUbids.length} of {ubids.length}</span>
          </div>
          
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg/50 border-b border-border">
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif">UBID / Anchor</th>
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif">Canonical Identity</th>
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif">System Coverage</th>
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif">Signal Confidence</th>
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUbids.map((ubid) => {
                const isExpanded = expandedRow === ubid.ubid;
                return (
                  <React.Fragment key={ubid.ubid}>
                    <tr 
                      className={cn(
                        "border-b border-border/50 transition-colors cursor-pointer group",
                        isExpanded ? "bg-accent/5" : "hover:bg-bg/30"
                      )}
                      onClick={() => setExpandedRow(isExpanded ? null : ubid.ubid)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded", ubid.anchorType === 'Central' ? "bg-green-100" : "bg-orange-100")}>
                            {ubid.anchorType === 'Central' ? <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> : <LinkIcon className="w-3.5 h-3.5 text-orange-600" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-text-main font-mono tracking-tighter">{ubid.ubid}</p>
                            <p className="text-[9px] text-text-muted uppercase font-medium">{ubid.anchorType} Anchor {ubid.anchorId ? `(${ubid.anchorId})` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-bold text-text-main group-hover:text-accent transition-colors">{ubid.canonicalName}</p>
                        <p className="text-[10px] text-text-muted truncate max-w-[200px]">{ubid.canonicalAddress}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex -space-x-1.5">
                          {Array.from(new Set(ubid.linkedRecords.map(r => r.department))).map((dept, i) => (
                            <div 
                              key={i} 
                              title={dept}
                              className="w-6 h-6 rounded-full border-2 border-white bg-accent/10 flex items-center justify-center text-[8px] font-bold text-accent shadow-sm"
                            >
                              {dept.charAt(0)}
                            </div>
                          ))}
                          {ubid.linkedRecords.length > 3 && (
                            <div className="w-6 h-6 rounded-full border-2 border-white bg-bg flex items-center justify-center text-[8px] font-bold text-text-muted">
                              +{ubid.linkedRecords.length - 3}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                           <div className="w-16 h-1.5 bg-bg rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${ubid.confidence * 100}%` }}
                                className={cn("h-full", ubid.confidence > 0.9 ? "bg-status-active" : "bg-status-dormant")} 
                              />
                           </div>
                           <span className={cn("text-[10px] font-bold", ubid.confidence > 0.9 ? "text-status-active" : "text-status-dormant")}>
                             {Math.round(ubid.confidence * 100)}%
                           </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1 hover:bg-bg rounded text-text-muted hover:text-accent transition-colors">
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <ChevronDown className={cn("w-4 h-4 text-text-muted transition-transform", isExpanded ? "rotate-180" : "")} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-bg/10">
                        <td colSpan={5} className="p-0 border-b border-border">
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                          >
                             <UBIDDetailContent 
                               ubid={ubid} 
                               events={events}
                               onUpdateStatus={(status, reason) => onUpdateStatus?.(ubid.ubid, status, reason)}
                               onUnlinkRecord={(recordId) => onUnlinkRecord?.(ubid.ubid, recordId)}
                             />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filteredUbids.length === 0 && (
            <div className="p-12 text-center">
              <Search className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium text-text-muted">No records found matching your search in the Registry.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ReviewerQueue = ({ 
  suggestions, 
  setSuggestions, 
  onApprove, 
  onReject 
}: { 
  suggestions: MatchSuggestion[],
  setSuggestions: React.Dispatch<React.SetStateAction<MatchSuggestion[]>>,
  onApprove: (suggestion: MatchSuggestion) => void,
  onReject: (suggestion: MatchSuggestion) => void
}) => {
  const [filter, setFilter] = useState<'All' | 'High' | 'Medium' | 'Low' | 'History'>('All');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showCommitSuccess, setShowCommitSuccess] = useState(false);

  // Auto-commitment logic for high-confidence matches (> 0.95)
  useEffect(() => {
    const autoCommit = () => {
      const highConfidencePending = suggestions.filter(
        s => s.status === 'Pending' && s.confidence >= 0.95
      );

      if (highConfidencePending.length > 0) {
        // Trigger external side effects outside of the state update map
        highConfidencePending.forEach(s => onApprove(s));

        setSuggestions(prev => prev.map(s => {
          if (s.confidence >= 0.95 && s.status === 'Pending') {
            return { 
              ...s, 
              status: 'Auto-Committed' as const,
              reviewerFeedback: {
                action: 'Approved',
                reason: 'Auto-committed via High Confidence Threshold (>= 0.95)',
                timestamp: new Date().toISOString(),
                reviewer: 'System (Logic Engine)'
              }
            };
          }
          return s;
        }));
        setShowCommitSuccess(true);
        setTimeout(() => setShowCommitSuccess(false), 3000);
      }
    };

    const timer = setTimeout(autoCommit, 2000);
    return () => clearTimeout(timer);
  }, [onApprove, suggestions]);

  const handleAction = (id: string, action: 'Approved' | 'Rejected' | 'Pending') => {
    setActioningId(id);
    
    // Simulate capturing feedback and persisting
    setTimeout(() => {
      const suggestion = suggestions.find(s => s.id === id);
      if (suggestion) {
        if (action === 'Approved') onApprove(suggestion);
        if (action === 'Rejected') onReject(suggestion);
      }
      
      setSuggestions(prev => prev.map(s => 
        s.id === id 
          ? { 
              ...s, 
              status: action as any,
              reviewerFeedback: action === 'Pending' ? undefined : {
                action: action as any,
                reason: action === 'Rejected' ? 'Manual reversal of linkage due to identity mismatch.' : `Manually ${action.toLowerCase()} by admin based on industrial identity verification.`,
                timestamp: new Date().toISOString(),
                reviewer: 'White Hawk Admin'
              }
            } 
          : s
      ));
      setActioningId(null);
    }, 800);
  };

  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(s => {
      if (filter === 'History') return s.status !== 'Pending';
      
      // Hide auto-committed or processed items from the main active queue 
      if (s.status !== 'Pending') return false;

      if (filter === 'All') return true;
      if (filter === 'High') return s.confidence >= 0.9;
      if (filter === 'Medium') return s.confidence >= 0.7 && s.confidence < 0.9;
      if (filter === 'Low') return s.confidence < 0.7;
      return true;
    });
  }, [filter, suggestions]);

  return (
    <div className="space-y-4">
      {showCommitSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="bg-green-50 border border-green-200 p-3 rounded-lg flex items-center justify-between"
        >
          <div className="flex items-center gap-2 text-green-700 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4" />
            High-confidence matches (&gt;95%) have been automatically committed to the UBID registry.
          </div>
        </motion.div>
      )}

      {/* System Learning Feedback Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded">
            <Fingerprint className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-tight">Reinforced Links</p>
            <p className="text-xs font-bold text-text-main">{suggestions.filter(s => s.status === 'Approved' || s.status === 'Auto-Committed').length} Decisions</p>
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded">
            <Link2Off className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-tight">Suppression Rules</p>
            <p className="text-xs font-bold text-text-main">{suggestions.filter(s => s.status === 'Rejected').length} Antigens</p>
          </div>
        </div>
        <div className="bg-accent/5 p-3 rounded-lg border border-accent/20 flex items-center gap-3">
          <div className="p-2 bg-accent/10 rounded">
            <Zap className="w-4 h-4 text-accent" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-accent uppercase tracking-tight">Intelligence Gain</p>
            <p className="text-xs font-bold text-accent">+{ (suggestions.filter(s => s.status !== 'Pending').length * 1.4).toFixed(1) }% Conf</p>
          </div>
        </div>
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center gap-3">
          <div className="p-2 bg-slate-200 rounded">
            <RefreshCcw className="w-4 h-4 text-text-muted" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-text-muted uppercase tracking-tight">Sync Status</p>
            <p className="text-xs font-bold text-text-muted">Real-time Feed</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-main">Reviewer Queue ({filteredSuggestions.length} pending)</h2>
          <p className="text-xs text-text-muted">Explainable confidence signals for ambiguous industrial linkages.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-card border border-border rounded p-0.5">
            {['All', 'High', 'Medium', 'Low', 'History'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all",
                  filter === f ? "bg-accent text-white" : "text-text-muted hover:text-text-main"
                )}
              >
                {f}
              </button>
            ))}
          </div>
          <button 
            onClick={() => {
              const highConfIds = suggestions.filter(s => s.confidence >= 0.9 && s.status === 'Pending').map(s => s.id);
              if (highConfIds.length > 0) {
                setSuggestions(prev => prev.map(s => 
                  highConfIds.includes(s.id) ? { ...s, status: 'Approved' } : s
                ));
              }
            }}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <Sparkles className="w-3 h-3" /> Commit All High Confidence
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {filteredSuggestions.map(s => (
            <motion.div 
              key={s.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: actioningId === s.id ? 0.5 : 1, scale: 1 }}
              exit={{ opacity: 0, x: 50 }}
              className="bg-card rounded-lg border border-border shadow-sm overflow-hidden group hover:border-accent/30 transition-all"
            >
              <div className="px-4 py-2 bg-bg border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "px-2 py-1.5 rounded text-[10px] font-bold uppercase flex items-center gap-3",
                    s.confidence >= 0.9 ? "bg-green-50 text-status-active" : 
                    s.confidence >= 0.75 ? "bg-blue-50 text-confidence-high" : "bg-orange-50 text-confidence-mid"
                  )}>
                    <div className="flex flex-col min-w-[80px]">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" />
                        Confidence: {(s.confidence * 100).toFixed(0)}%
                      </div>
                      <div className="w-full bg-gray-200 h-1 rounded-full mt-1 overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${s.confidence * 100}%` }}
                          className={cn(
                            "h-full transition-all duration-1000",
                            s.confidence >= 0.9 ? "bg-status-active" : "bg-accent"
                          )}
                        />
                      </div>
                    </div>
                    {s.confidenceBreakdown && (
                      <div className="hidden sm:flex gap-3 border-l border-current/20 pl-3">
                        <div className="flex flex-col">
                          <span className="text-[7px] opacity-70">Name</span>
                          <div className="h-0.5 w-8 bg-current/20 rounded-full overflow-hidden">
                            <div className="h-full bg-current" style={{ width: `${s.confidenceBreakdown.name * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[7px] opacity-70">Addr</span>
                          <div className="h-0.5 w-8 bg-current/20 rounded-full overflow-hidden">
                            <div className="h-full bg-current" style={{ width: `${s.confidenceBreakdown.address * 100}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[7px] opacity-70">Loc</span>
                          <div className="h-0.5 w-8 bg-current/20 rounded-full overflow-hidden">
                            <div className="h-full bg-current" style={{ width: `${s.confidenceBreakdown.location * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Priority:</span>
                    <span className={cn(
                      "text-[10px] font-bold uppercase",
                      s.priority === 'High' ? "text-red-500" : "text-orange-500"
                    )}>{s.priority}</span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono">ID: {s.id}</span>
                </div>
                <div className="flex gap-2 p-1">
                  {s.status === 'Pending' ? (
                    <>
                      <button 
                        disabled={!!actioningId}
                        onClick={() => handleAction(s.id, 'Rejected')}
                        className="px-3 py-1 text-[10px] font-bold text-status-closed hover:bg-red-50 border border-transparent hover:border-red-100 rounded transition-all disabled:opacity-50 uppercase"
                      >
                        Keep Separate
                      </button>
                      <button 
                        disabled={!!actioningId}
                        onClick={() => handleAction(s.id, 'Approved')}
                        className="px-3 py-1 text-[10px] font-bold text-white bg-accent hover:opacity-90 rounded shadow-sm transition-all disabled:opacity-50 uppercase"
                      >
                        Approve Linkage
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-1 rounded uppercase",
                        s.status === 'Approved' ? "bg-green-100 text-status-active border border-green-200" :
                        s.status === 'Auto-Committed' ? "bg-blue-100 text-accent border border-blue-200" :
                        "bg-red-100 text-status-closed border border-red-200"
                      )}>
                        Decision: {s.status}
                      </span>
                      {s.status !== 'Rejected' && (
                        <button 
                          onClick={() => handleAction(s.id, 'Rejected')}
                          className="text-[9px] font-bold text-red-600 hover:underline uppercase tracking-tighter"
                        >
                          Undo/Reverse Match
                        </button>
                      )}
                      {s.status === 'Rejected' && (
                        <button 
                          onClick={() => handleAction(s.id, 'Pending')}
                          className="text-[9px] font-bold text-accent hover:underline uppercase tracking-tighter"
                        >
                          Restore to Queue
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block z-10">
                  <div className="bg-white p-2 rounded-full border border-border shadow-md">
                    <ArrowRight className="w-4 h-4 text-accent" />
                  </div>
                </div>
                
                {/* Record A */}
                <div className="space-y-3 p-3 rounded-lg bg-bg/30 border border-transparent hover:border-border transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-wider">
                      <Database className="w-3.5 h-3.5" /> {s.recordA.department}
                    </div>
                    <span className="text-[9px] font-bold text-text-muted bg-white px-1.5 py-0.5 rounded border border-border">SOURCE A</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-main leading-tight">{s.recordA.businessName}</h4>
                    <div className="flex items-start gap-1.5 mt-1.5 text-text-muted">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <p className="text-[11px] leading-tight">{s.recordA.address}, {s.recordA.pinCode}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">Owner</span>
                      <p className="text-[11px] font-medium text-text-main">{s.recordA.ownerName}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">GSTIN</span>
                      <p className="text-[11px] font-mono text-text-main">{s.recordA.gstin}</p>
                    </div>
                  </div>
                </div>

                {/* Record B */}
                <div className="space-y-3 p-3 rounded-lg bg-bg/30 border border-transparent hover:border-border transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-wider">
                      <Database className="w-3.5 h-3.5" /> {s.recordB.department}
                    </div>
                    <span className="text-[9px] font-bold text-text-muted bg-white px-1.5 py-0.5 rounded border border-border">SOURCE B</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-main leading-tight">{s.recordB.businessName}</h4>
                    <div className="flex items-start gap-1.5 mt-1.5 text-text-muted">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <p className="text-[11px] leading-tight">{s.recordB.address}, {s.recordB.pinCode}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">Owner</span>
                      <p className={cn(
                        "text-[11px] font-medium",
                        s.recordA.ownerName !== s.recordB.ownerName ? "text-orange-600 bg-orange-50 px-1 rounded" : "text-text-main"
                      )}>
                        {s.recordB.ownerName}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">GSTIN</span>
                      <p className={cn(
                        "text-[11px] font-mono", 
                        !s.recordB.gstin || s.recordB.gstin === 'Pending' ? "text-orange-500 italic" : 
                        s.recordA.gstin !== s.recordB.gstin ? "text-orange-600 bg-orange-50 px-1 rounded" : "text-text-main"
                      )}>
                        {s.recordB.gstin || 'Pending'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 bg-blue-50/20 border-t border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">Explainable Signal: Evidence Analysis</span>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-green-200 rounded-sm" />
                      <span className="text-[9px] text-text-muted uppercase font-bold">Strong Identity</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-blue-100 rounded-sm" />
                      <span className="text-[9px] text-text-muted uppercase font-bold">Fuzzy Pattern</span>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {s.recordA.businessName.split(' ').map((word, i) => (
                        <span key={i} className={cn(
                          "text-[11px] px-1 rounded font-medium", 
                          s.recordB.businessName.includes(word) ? "bg-green-100 text-status-active border border-green-200" : "text-text-main"
                        )}>
                          {word}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.recordA.address.split(',').map((part, i) => (
                        <span key={i} className={cn(
                          "text-[11px] px-1 rounded", 
                          s.recordB.address.includes(part.trim()) ? "bg-blue-100 text-accent border border-blue-200" : "text-text-muted"
                        )}>
                          {part}{i !== s.recordA.address.split(',').length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {s.recordB.businessName.split(' ').map((word, i) => (
                        <span key={i} className={cn(
                          "text-[11px] px-1 rounded font-medium", 
                          s.recordA.businessName.includes(word) ? "bg-green-100 text-status-active border border-green-200" : "text-text-main"
                        )}>
                          {word}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.recordB.address.split(',').map((part, i) => (
                        <span key={i} className={cn(
                          "text-[11px] px-1 rounded", 
                          s.recordA.address.includes(part.trim()) ? "bg-blue-100 text-accent border border-blue-200" : "text-text-muted"
                        )}>
                          {part}{i !== s.recordB.address.split(',').length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] font-bold text-text-muted uppercase block mb-1.5">Match Evidence</span>
                    <div className="flex flex-wrap gap-2">
                      {s.reasons.map((r, i) => (
                        <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-border text-accent font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-text-muted uppercase block mb-1.5">Risk & Discrepancies</span>
                    <div className="flex flex-wrap gap-2">
                      {s.riskFactors?.map((rf, i) => (
                        <span key={i} className="text-[10px] bg-white px-2 py-0.5 rounded border border-border text-orange-600 font-medium flex items-center gap-1">
                          <AlertCircle className="w-2.5 h-2.5" /> {rf}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {filteredSuggestions.length === 0 && (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed border-border">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-status-active opacity-20" />
            <p className="text-sm font-medium text-text-muted">Queue is empty. Active linkages resolved.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const LogEntry = React.memo(({ entry }: { entry: AuditEntry }) => (
  <tr className="hover:bg-bg/50 transition-colors">
    <td className="px-4 py-3 font-mono text-[10px] whitespace-nowrap">
        {format(parseISO(entry.timestamp), 'yyyy-MM-dd HH:mm:ss')}
    </td>
    <td className="px-4 py-3">
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
        entry.type === 'Security' ? "bg-red-50 text-red-600 border-red-100" :
        entry.type === 'Governance' ? "bg-blue-50 text-blue-600 border-blue-100" :
        "bg-gray-50 text-gray-600 border-gray-100"
      )}>
        {entry.type}
      </span>
    </td>
    <td className="px-4 py-3 font-bold text-text-main">{entry.action}</td>
    <td className="px-4 py-3 italic text-text-muted">{entry.actor}</td>
    <td className="px-4 py-3 font-mono text-[10px] text-accent uppercase tracking-tighter truncate max-w-[100px]">{entry.entityId}</td>
    <td className="px-4 py-3 text-text-main pr-8">{entry.details}</td>
  </tr>
));

LogEntry.displayName = 'LogEntry';

const AuditTrail = ({ log }: { log: AuditEntry[] }) => {
  const [filter, setFilter] = useState<'All' | 'Security' | 'Governance' | 'System'>('All');
  const filteredLog = useMemo(() => {
    return log.filter(entry => filter === 'All' || entry.type === filter);
  }, [log, filter]);

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="p-4 bg-bg/50 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-bold text-text-main">Immutable Audit Ledger</h2>
        </div>
        <div className="flex gap-2">
          {['All', 'Security', 'Governance', 'System'].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t as any)}
              className={cn(
                "px-2 py-1 text-[10px] font-bold rounded uppercase transition-all",
                filter === t ? "bg-accent text-white" : "bg-bg border border-border text-text-muted"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-bg text-[10px] font-bold text-text-muted uppercase border-b border-border">
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Context ID</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {filteredLog.length > 0 ? filteredLog.map(entry => (
              <LogEntry key={entry.id} entry={entry} />
            )) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-muted italic">
                  No governance actions recorded in current session.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusSignals = ({ ubid, events }: { ubid: UBIDRecord, events: ActivityEvent[] }) => {
  const verdict = useMemo(() => inferBusinessStatus(ubid.ubid, events), [ubid.ubid, events]);
  
  return (
    <div className="bg-bg/50 p-4 rounded-lg border border-border relative overflow-hidden">
      {ubid.manualStatusOverride && (
        <div className="absolute top-0 right-0 bg-accent text-white text-[8px] font-bold px-3 py-1 rounded-bl uppercase tracking-tighter">
          Manual Override Active
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Operational Verdict</h4>
        </div>
        <div className="flex items-center gap-3">
          <div className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase opacity-50 line-through",
            verdict.status === 'Active' ? "bg-green-100 text-status-active" :
            verdict.status === 'Dormant' ? "bg-orange-100 text-status-dormant" :
            "bg-red-100 text-status-closed"
          )}>
            {verdict.status} (Inferred)
          </div>
          <ArrowRight className="w-3 h-3 text-text-muted" />
          <div className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase ring-2 ring-accent ring-inset",
            ubid.status === 'Active' ? "bg-green-100 text-status-active" :
            ubid.status === 'Dormant' ? "bg-orange-100 text-status-dormant" :
            "bg-red-100 text-status-closed"
          )}>
            {ubid.status} {ubid.manualStatusOverride ? '(Manual)' : ''}
          </div>
        </div>
      </div>
      
      <p className="text-xs text-text-main font-medium leading-relaxed mb-1">
        {ubid.manualStatusOverride ? `Reviewer Logic: ${ubid.manualStatusOverride.reason}` : verdict.reasoning}
      </p>
      {ubid.manualStatusOverride && (
        <p className="text-[10px] text-text-muted mb-4 italic">
          Decision by {ubid.manualStatusOverride.actor} on {new Date(ubid.manualStatusOverride.timestamp).toLocaleDateString()}
        </p>
      )}
      {!ubid.manualStatusOverride && <div className="mb-4" />}

      <div className="space-y-2">
        <span className="text-[9px] font-bold text-text-muted uppercase block border-b border-border/50 pb-1">Signal Analysis Window (18 Months)</span>
        <div className="flex flex-wrap gap-2">
          {verdict.evidenceTrail.slice(0, 5).map((e, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white border border-border px-2 py-1 rounded shadow-sm">
              <div className={cn(
                "w-1.5 h-1.5 rounded-full",
                e.impact === 'Positive' ? "bg-green-500" : e.impact === 'Negative' ? "bg-red-500" : "bg-gray-400"
              )} />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-text-main">{e.signalType}</span>
                <span className="text-[8px] text-text-muted leading-none">{e.date}</span>
              </div>
            </div>
          ))}
          {verdict.evidenceTrail.length > 5 && (
            <div className="text-[9px] font-bold text-text-muted self-center">+{verdict.evidenceTrail.length - 5} MORE</div>
          )}
        </div>
      </div>
    </div>
  );
};

const UBIDDetailContent = ({ 
  ubid, 
  events,
  onUpdateStatus,
  onUnlinkRecord
}: { 
  ubid: UBIDRecord, 
  events: ActivityEvent[],
  onUpdateStatus?: (status: 'Active' | 'Dormant' | 'Closed', reason: string) => void,
  onUnlinkRecord?: (recordId: string) => void
}) => {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState(ubid.status);
  const [overrideReason, setOverrideReason] = useState('');
  
  const relevantEvents = useMemo(() => {
    return events
      .filter(e => e.ubid === ubid.ubid)
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [events, ubid.ubid]);

  const sortedHistory = useMemo(() => {
    return (ubid.statusHistory || [])
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [ubid.statusHistory]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    verdict: true,
    history: false,
    records: true,
    timeline: false
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const CollapsibleHeader = ({ id, label, icon: Icon, badge }: { id: string, label: string, icon: any, badge?: string | number }) => (
    <button 
      onClick={() => toggleSection(id)}
      className="w-full flex items-center justify-between py-3 border-b border-border hover:bg-bg/50 transition-colors group px-1"
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("w-3.5 h-3.5", openSections[id] ? "text-accent" : "text-text-muted")} />
        <h3 className={cn(
          "text-[10px] font-bold uppercase tracking-wider",
          openSections[id] ? "text-text-main" : "text-text-muted"
        )}>
          {label}
        </h3>
        {badge !== undefined && (
          <span className="text-[9px] bg-bg border border-border px-1.5 rounded-full text-text-muted font-bold ml-1">
            {badge}
          </span>
        )}
      </div>
      <ChevronDown className={cn(
        "w-3.5 h-3.5 text-text-muted transition-transform duration-200",
        openSections[id] ? "rotate-180" : ""
      )} />
    </button>
  );

  return (
    <div className="p-4 space-y-4 bg-white border-t border-border">
      <div className="flex flex-wrap items-center justify-between gap-4 py-2 border-b border-border/50">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5">
            <div className={cn("p-1.5 rounded", ubid.anchorType === 'Central' ? "bg-green-100" : "bg-orange-100")}>
              {ubid.anchorType === 'Central' ? <ShieldCheck className="w-3.5 h-3.5 text-green-600" /> : <LinkIcon className="w-3.5 h-3.5 text-orange-600" />}
            </div>
            <span className="text-[10px] font-bold text-text-main uppercase">{ubid.anchorType} Anchor {ubid.anchorId ? `(${ubid.anchorId})` : ''}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", ubid.status === 'Active' ? "bg-status-active" : "bg-status-dormant")} />
            <span className="text-xs font-medium text-text-main">
              Status: {ubid.status} 
              {ubid.manualStatusOverride && (
                <span className="ml-1.5 px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[9px] font-bold rounded border border-orange-100 uppercase">Override</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">PAN: {ubid.pan || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-status-active" />
            <span className="text-xs text-text-muted">Confidence: {(ubid.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        
        <button 
          onClick={() => setIsUpdatingStatus(!isUpdatingStatus)}
          className="px-3 py-1.5 bg-bg border border-border rounded text-[10px] font-bold text-text-muted hover:text-accent hover:border-accent transition-all uppercase flex items-center gap-1.5"
        >
          <Settings className="w-3 h-3" /> Override Status
        </button>
      </div>

      <AnimatePresence>
        {isUpdatingStatus && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-orange-50/30 border border-orange-100 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold text-orange-600 uppercase">Manual Status Override</h4>
                <button onClick={() => setIsUpdatingStatus(false)} className="text-text-muted hover:text-orange-600">
                  <span className="text-[10px] font-bold uppercase underline">Cancel</span>
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-text-muted uppercase">Target Status</label>
                  <select 
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full text-xs p-2 bg-white border border-border rounded focus:ring-1 focus:ring-accent outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Dormant">Dormant</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[9px] font-bold text-text-muted uppercase">Reason for Change</label>
                  <input 
                    type="text"
                    placeholder="e.g., Physical site visit confirmed operation..."
                    className="w-full text-xs p-2 bg-white border border-border rounded focus:ring-1 focus:ring-accent outline-none"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button 
                  disabled={!overrideReason}
                  onClick={() => {
                    onUpdateStatus?.(newStatus, overrideReason);
                    setIsUpdatingStatus(false);
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded text-[10px] font-bold uppercase tracking-wider shadow-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Commit Manual Verdict
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Operational Verdict Section */}
      <div className="space-y-2">
        <CollapsibleHeader id="verdict" label="Operational Health Signals" icon={Activity} />
        <AnimatePresence initial={false}>
          {openSections.verdict && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2">
                <StatusSignals ubid={ubid} events={events} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status History Section */}
      <div className="space-y-2">
        <CollapsibleHeader 
          id="history" 
          label="Status Governance History" 
          icon={History} 
          badge={sortedHistory.length}
        />
        <AnimatePresence initial={false}>
          {openSections.history && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 px-1 pt-4">
                {sortedHistory.length > 0 ? (
                  sortedHistory.map((h, i) => (
                    <div key={i} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0">
                      <div className={cn(
                        "absolute -left-[7px] top-0 w-3 h-3 rounded-full border-2 border-white shadow-sm",
                        h.type === 'Manual' ? "bg-orange-500" : "bg-accent"
                      )} />
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 bg-bg px-2 py-0.5 rounded border border-border">
                          <span className="text-[10px] text-text-muted line-through font-medium">{h.from}</span>
                          <ArrowRight className="w-2.5 h-2.5 text-text-muted" />
                          <span className={cn(
                            "text-[10px] font-bold uppercase",
                            h.to === 'Active' ? "text-status-active" : 
                            h.to === 'Dormant' ? "text-status-dormant" : "text-status-closed"
                          )}>
                            {h.to}
                          </span>
                        </div>
                        <span className="text-[10px] text-text-muted font-medium">
                          {format(new Date(h.timestamp), 'MMM dd, yyyy HH:mm')}
                        </span>
                        <span className={cn(
                          "text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-tighter",
                          h.type === 'Manual' ? "bg-orange-50 text-orange-600 border border-orange-100" : "bg-blue-50 text-blue-600 border border-blue-100"
                        )}>
                          {h.type}
                        </span>
                      </div>
                      <p className="text-xs text-text-main font-bold leading-tight">{h.reason}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Fingerprint className="w-3 h-3 text-text-muted/50" />
                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight">Actor: {h.actor}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 bg-bg/50 rounded-lg border border-dashed border-border">
                    <History className="w-6 h-6 text-text-muted opacity-20 mb-2" />
                    <p className="text-[11px] font-medium text-text-muted uppercase tracking-tight">No recorded state transitions in registry ledger</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Thinking Assistant Integration */}
      <ThinkingAssistant 
        data={{ 
          entity: ubid, 
          recentActivity: relevantEvents 
        }} 
        title={`AI Logic Audit: ${ubid.ubid}`} 
      />

      <div className="space-y-2">
        <CollapsibleHeader 
          id="records" 
          label="Linked Source Records" 
          icon={LinkIcon} 
          badge={ubid.linkedRecords.length}
        />
        <AnimatePresence initial={false}>
          {openSections.records && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                {ubid.linkedRecords.map((r, i) => (
                  <div key={i} className="p-3 bg-bg rounded border border-border flex justify-between items-start group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Building2 className="w-3.5 h-3.5 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase">{r.department}</span>
                      </div>
                      <p className="text-sm font-bold text-text-main">{r.businessName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-text-muted">ID: {r.id}</p>
                        <span className="w-1 h-1 bg-border rounded-full" />
                        <p className="text-[10px] text-text-muted truncate">{r.address}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => onUnlinkRecord?.(r.id)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Unlink record from this UBID"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {ubid.linkedRecords.length === 0 && (
                  <div className="col-span-2 text-center py-8 bg-bg rounded-lg border border-dashed border-border flex flex-col items-center justify-center">
                    <Link2Off className="w-6 h-6 text-text-muted opacity-20 mb-2" />
                    <p className="text-xs font-medium text-text-muted uppercase tracking-tight">Zero linkages remaining</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="space-y-2">
        <CollapsibleHeader 
          id="timeline" 
          label="Activity Timeline" 
          icon={Activity} 
          badge={relevantEvents.length}
        />
        <AnimatePresence initial={false}>
          {openSections.timeline && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 pt-4">
                {relevantEvents.length > 0 ? (
                  relevantEvents.map((e, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center">
                          <Activity className="w-3 h-3 text-accent" />
                        </div>
                        {i !== relevantEvents.length - 1 && (
                          <div className="w-px h-full bg-border my-1" />
                        )}
                      </div>
                      <div className="pb-4">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-text-main">{e.eventType}</span>
                          <span className="text-[10px] text-text-muted">{e.date}</span>
                          <span className={cn(
                            "px-1 py-0.5 rounded text-[9px] font-bold uppercase",
                            e.value === 'High' ? "bg-blue-100 text-confidence-high" : "bg-bg text-text-muted"
                          )}>
                            {e.value}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed">{e.details}</p>
                        <p className="text-[10px] text-text-muted/70 mt-0.5">Source: {e.department}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 bg-bg/50 rounded-lg border border-dashed border-border">
                    <Clock className="w-6 h-6 text-text-muted opacity-20 mb-2" />
                    <p className="text-[11px] font-medium text-text-muted uppercase tracking-tight">Verified existence, but no historical signals found</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const UBIDExplorer = ({ 
  ubids,
  events,
  selectedUbid, 
  setSelectedUbid,
  onUpdateStatus,
  onUnlinkRecord
}: { 
  ubids: UBIDRecord[],
  events: ActivityEvent[],
  selectedUbid: UBIDRecord | null, 
  setSelectedUbid: (u: UBIDRecord | null) => void,
  onUpdateStatus?: (ubidId: string, status: 'Active' | 'Dormant' | 'Closed', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Debounce search term
  const debouncedSearchHandler = useCallback(
    debounce((value: string) => {
      setDebouncedSearch(value);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearchHandler(searchTerm);
  }, [searchTerm, debouncedSearchHandler]);

  const validateUBID = (value: string) => {
    if (!value) {
      setValidationError(null);
      return;
    }

    const upperValue = value.toUpperCase();
    
    // Support multiple anchor formats
    const isUBID = upperValue.startsWith('KA-UBID-');
    const isGSTIN = upperValue.startsWith('KA-GSTIN-');
    const isPAN = upperValue.startsWith('KA-PAN-');

    if (!isUBID && !isGSTIN && !isPAN) {
      setValidationError("Must start with 'KA-UBID-', 'KA-GSTIN-', or 'KA-PAN-'");
      return;
    }

    setValidationError(null);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    validateUBID(value.toUpperCase());
  };

  const fuse = useMemo(() => new Fuse(ubids, {
    keys: ['canonicalName', 'ubid', 'pan', 'gstin'],
    threshold: 0.4,
    includeScore: true
  }), [ubids]);

  const filteredUbids = useMemo(() => {
    if (!debouncedSearch) return ubids.map(u => ({ item: u, score: 1 }));
    return fuse.search(debouncedSearch).map(result => ({
      item: result.item,
      score: 1 - (result.score || 0)
    }));
  }, [debouncedSearch, fuse, ubids]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input 
            type="text" 
            placeholder="Search UBID, Name, PAN or GSTIN..."
            className={cn(
              "w-full pl-10 pr-4 py-2 text-sm bg-bg border rounded-lg focus:ring-2 focus:ring-accent/20 outline-none transition-all",
              validationError ? "border-red-500" : "border-border"
            )}
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>
        {validationError && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-1.5 text-[10px] text-red-600 font-medium px-1 mt-2"
          >
            <AlertCircle className="w-3 h-3" />
            {validationError}
          </motion.div>
        )}
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredUbids.map(({ item: u, score }) => {
            const isExpanded = selectedUbid?.ubid === u.ubid;
            
            return (
              <motion.div 
                key={u.ubid}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-card rounded-lg border transition-all overflow-hidden",
                  isExpanded ? "border-accent ring-1 ring-accent shadow-md" : "border-border hover:border-accent/50"
                )}
              >
                <button 
                  onClick={() => setSelectedUbid(isExpanded ? null : u)}
                  className="w-full p-4 text-left flex justify-between items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-mono font-bold text-accent px-1.5 py-0.5 bg-blue-50 rounded">{u.ubid}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          u.status === 'Active' ? "bg-green-100 text-status-active" : "bg-orange-100 text-status-dormant"
                        )}>
                          {u.status}
                        </span>
                        {debouncedSearch && (
                          <span className="text-[9px] font-bold text-accent/70 uppercase">
                            {Math.round(score * 100)}% Match
                          </span>
                        )}
                      </div>
                    </div>
                    <h4 className="text-base font-bold text-text-main truncate">{u.canonicalName}</h4>
                    <div className="flex items-center gap-1.5 mt-1 text-text-muted">
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <p className="text-xs truncate">{u.canonicalAddress}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${u.canonicalName} ${u.canonicalAddress}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 text-text-muted hover:text-accent hover:bg-blue-50 rounded-full transition-all"
                      title="View on Google Maps"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <div className={cn("transition-transform duration-200", isExpanded ? "rotate-180" : "")}>
                      <ChevronDown className="w-5 h-5 text-text-muted" />
                    </div>
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <UBIDDetailContent 
                        ubid={u} 
                        events={events}
                        onUpdateStatus={(status, reason) => onUpdateStatus?.(u.ubid, status, reason)}
                        onUnlinkRecord={(recordId) => onUnlinkRecord?.(u.ubid, recordId)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
        
        {filteredUbids.length === 0 && (
          <div className="text-center py-12 bg-card rounded-lg border border-dashed border-border">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-text-muted">No entities found matching your search</p>
          </div>
        )}
      </div>
    </div>
  );
};

const OrphanResolution = ({ 
  orphans, 
  ubids,
  onResolve
}: { 
  orphans: ActivityEvent[], 
  ubids: UBIDRecord[],
  onResolve: (event: ActivityEvent, action: 'create' | 'link', targetUbidId?: string) => void
}) => {
  const [activeOrphan, setActiveOrphan] = useState<ActivityEvent | null>(null);
  const [targetUbidId, setTargetUbidId] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [ubidSearch, setUbidSearch] = useState('');

  const suggestedMatches = useMemo(() => {
    if (!activeOrphan) return [];
    
    const pseudoRecord: SourceRecord = {
      id: activeOrphan.id,
      department: activeOrphan.department,
      businessName: activeOrphan.businessNameHint || '',
      address: activeOrphan.addressHint || '',
      pinCode: activeOrphan.pinCodeHint || '',
      ownerName: '' 
    };

    return ubids.map(ubid => {
      // Use official metadata if no linked records exist, otherwise first record
      const anchor = ubid.linkedRecords[0] || { 
        businessName: ubid.canonicalName, 
        address: ubid.canonicalAddress, 
        pinCode: ubid.pinCode 
      };
      const result = compareRecords(pseudoRecord, anchor as SourceRecord);
      return { ...ubid, matchResult: result };
    })
    .filter(u => u.matchResult.confidence > 0.3)
    .sort((a, b) => b.matchResult.confidence - a.matchResult.confidence)
    .slice(0, 3);
  }, [activeOrphan, ubids]);

  const filteredOrphans = useMemo(() => {
    if (!searchTerm) return orphans;
    return orphans.filter(o => 
      o.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.businessNameHint?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.details.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [orphans, searchTerm]);

  const filteredUbids = useMemo(() => {
    if (!ubidSearch) return ubids.slice(0, 10);
    return ubids.filter(u => 
      u.ubid.toLowerCase().includes(ubidSearch.toLowerCase()) ||
      u.canonicalName.toLowerCase().includes(ubidSearch.toLowerCase())
    ).slice(0, 10);
  }, [ubids, ubidSearch]);

  const handleLink = () => {
    if (!activeOrphan || !targetUbidId) return;
    setIsResolving(true);
    setTimeout(() => {
      onResolve(activeOrphan, 'link', targetUbidId);
      setActiveOrphan(null);
      setTargetUbidId('');
      setIsResolving(false);
    }, 1000);
  };

  const handleCreate = () => {
    if (!activeOrphan) return;
    setIsResolving(true);
    setTimeout(() => {
      onResolve(activeOrphan, 'create');
      setActiveOrphan(null);
      setIsResolving(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-main">Orphan Event Resolution</h2>
          <p className="text-xs text-text-muted">Surface events that could not be confidently joined to a UBID for manual review.</p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input 
            type="text"
            placeholder="Filter orphans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-white border border-border rounded-lg text-xs w-full md:w-[240px] focus:outline-none focus:ring-1 focus:ring-accent font-medium shadow-sm transition-all"
          />
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider w-[240px]">Event / Depth</th>
              <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Source Hint</th>
              <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Details</th>
              <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredOrphans.length > 0 ? filteredOrphans.map(event => (
              <React.Fragment key={event.id}>
                <tr 
                  className={cn(
                    "hover:bg-bg/50 transition-colors cursor-pointer",
                    activeOrphan?.id === event.id ? "bg-accent/5" : ""
                  )}
                  onClick={() => setActiveOrphan(activeOrphan?.id === event.id ? null : event)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-red-100 rounded">
                        <AlertCircle className="w-3 h-3 text-red-600" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-text-main">{event.eventType}</p>
                        <p className="text-[9px] text-text-muted font-mono">{event.date}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[11px] font-medium text-accent">{event.businessNameHint || 'No Name Hint'}</p>
                    <p className="text-[10px] text-text-muted">{event.department}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-[10px] text-text-main truncate max-w-[300px]">{event.details}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      className={cn(
                        "text-[10px] font-bold uppercase transition-all flex items-center gap-1.5 ml-auto",
                        activeOrphan?.id === event.id ? "text-accent" : "text-text-muted hover:text-accent"
                      )}
                    >
                      {activeOrphan?.id === event.id ? 'Hide Resolution' : 'Resolve'}
                      <ChevronDown className={cn("w-3 h-3 transition-transform", activeOrphan?.id === event.id ? "rotate-180" : "")} />
                    </button>
                  </td>
                </tr>
                <AnimatePresence>
                  {activeOrphan?.id === event.id && (
                    <tr>
                      <td colSpan={4} className="p-0 border-t border-border/10">
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="bg-bg/30 overflow-hidden"
                        >
                          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                              <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2 mb-2">
                                <Info className="w-3.5 h-3.5" />
                                Intelligent Match Profile
                              </h3>
                              <div className="p-4 bg-white rounded-lg border border-border shadow-sm space-y-3">
                                <div className="grid grid-cols-2 gap-4 border-b border-border/50 pb-3">
                                  <div>
                                    <p className="text-[9px] font-bold text-text-muted uppercase">Unlinked Signal</p>
                                    <p className="text-xs font-bold text-text-main">{activeOrphan.eventType}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold text-text-muted uppercase">Data Stream</p>
                                    <p className="text-xs font-bold text-text-main">{activeOrphan.department}</p>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[9px] font-bold text-text-muted uppercase">Deep Event Context</p>
                                  <p className="text-xs text-text-main leading-relaxed mt-1.5 font-medium">{activeOrphan.details}</p>
                                  {(activeOrphan.businessNameHint || activeOrphan.addressHint) && (
                                    <div className="mt-2 p-2 bg-bg/50 rounded text-[10px] space-y-1 italic text-text-muted border-l-2 border-accent/20">
                                      {activeOrphan.businessNameHint && <p>Name Hint: <span className="font-bold text-text-main not-italic">{activeOrphan.businessNameHint}</span></p>}
                                      {activeOrphan.addressHint && <p>Addr Hint: <span className="font-bold text-text-main not-italic">{activeOrphan.addressHint}</span></p>}
                                    </div>
                                  )}
                                </div>
                                
                                {suggestedMatches.length > 0 && (
                                  <div className="pt-3 border-t border-border mt-1">
                                    <p className="text-[9px] font-bold text-accent uppercase mb-2 flex items-center gap-1.5">
                                      <Sparkles className="w-3 h-3" /> System Recommendations
                                    </p>
                                    <div className="space-y-2">
                                      {suggestedMatches.map(m => (
                                        <button 
                                          key={m.ubid}
                                          onClick={() => setTargetUbidId(m.ubid)}
                                          className={cn(
                                            "w-full text-left p-2 rounded-lg border transition-all flex items-center justify-between group",
                                            targetUbidId === m.ubid ? "bg-accent/5 border-accent shadow-sm" : "bg-bg/50 border-transparent hover:border-accent/40"
                                          )}
                                        >
                                          <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-text-main line-clamp-1 group-hover:text-accent transition-colors">{m.canonicalName}</span>
                                            <span className="text-[9px] text-text-muted font-mono">{m.ubid}</span>
                                          </div>
                                          <div className="flex flex-col items-end whitespace-nowrap pl-2">
                                            <span className="text-[10px] font-bold text-accent">{(m.matchResult.confidence * 100).toFixed(0)}%</span>
                                            <span className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">Match</span>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-white p-5 rounded-lg border border-accent/20 shadow-lg shadow-accent/5 space-y-5 h-full">
                              <div>
                                <h3 className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2 mb-4 text-accent">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  Reviewer Decision Matrix
                                </h3>
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-text-main uppercase tracking-wider block">Link to Existing UBID Record</label>
                                    <div className="flex flex-col gap-2">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div className="relative">
                                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                          <input 
                                            type="text"
                                            placeholder="Search Registry..."
                                            value={ubidSearch}
                                            onChange={(e) => setUbidSearch(e.target.value)}
                                            className="w-full bg-white border border-border rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent font-medium shadow-sm transition-all"
                                          />
                                        </div>
                                        <div className="relative">
                                          <select 
                                            value={targetUbidId}
                                            onChange={(e) => setTargetUbidId(e.target.value)}
                                            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent font-medium shadow-sm transition-all appearance-none pr-8"
                                          >
                                            <option value="">Select Match...</option>
                                            {filteredUbids.map(u => (
                                              <option key={u.ubid} value={u.ubid}>{u.ubid} - {u.canonicalName}</option>
                                            ))}
                                          </select>
                                          <ChevronDown className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                        </div>
                                      </div>
                                      <button 
                                        disabled={!targetUbidId || isResolving}
                                        onClick={(e) => { e.stopPropagation(); handleLink(); }}
                                        className="w-full py-2.5 bg-accent text-white text-[10px] font-bold rounded-lg uppercase tracking-wider hover:opacity-90 transition-all disabled:opacity-50 shadow-sm shadow-accent/20"
                                      >
                                        {isResolving ? 'Linking...' : 'Commit Contextual Linkage'}
                                      </button>
                                    </div>
                                    <p className="text-[9px] text-text-muted italic px-1">Selected signal will be appended to the UBID's immutable activity ledger.</p>
                                  </div>

                                  <div className="relative py-1">
                                    <div className="absolute inset-0 flex items-center">
                                      <div className="w-full border-t border-border" />
                                    </div>
                                    <div className="relative flex justify-center text-[9px] uppercase font-bold">
                                      <span className="bg-white px-2 text-text-muted tracking-tight">System Projection Path</span>
                                    </div>
                                  </div>

                                  <div className="space-y-2">
                                    <button 
                                      disabled={isResolving}
                                      onClick={(e) => { e.stopPropagation(); handleCreate(); }}
                                      className="w-full py-2.5 bg-white border border-accent/30 text-accent text-[10px] font-bold rounded-lg uppercase tracking-wider hover:bg-accent/5 transition-all disabled:opacity-50"
                                    >
                                      {isResolving ? 'Processing...' : 'Project as New Industrial Identity'}
                                    </button>
                                    <p className="text-[9px] text-text-muted text-center italic px-4">Creates a new Internal UBID for this entity as it shows zero linkage to existing registry nodes.</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            )) : (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-text-muted italic text-[10px]">
                  {searchTerm ? `No unlinked signals match "${searchTerm}" in the current audit pool.` : "All identified signals successfully reconciled."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const QueryResultRow = React.memo(({ 
  ubid, 
  score, 
  searchQuery, 
  isExpanded, 
  onToggle, 
  lastSignal, 
  onViewDetails, 
  onUpdateStatus, 
  onUnlinkRecord,
  events
}: { 
  ubid: UBIDRecord, 
  score: number, 
  searchQuery: string, 
  isExpanded: boolean, 
  onToggle: () => void, 
  lastSignal: string,
  onViewDetails?: (ubid: UBIDRecord) => void,
  onUpdateStatus?: (ubidId: string, status: 'Active' | 'Dormant' | 'Closed', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void,
  events: ActivityEvent[]
}) => (
  <React.Fragment>
    <tr 
      className={cn(
        "group hover:bg-bg transition-colors cursor-pointer",
        isExpanded ? "bg-accent/5" : ""
      )}
      onClick={onToggle}
    >
      <td className="px-2 py-3 font-mono font-bold text-accent">
        <div className="flex items-center gap-2">
          <ChevronRight className={cn("w-3 h-3 transition-transform", isExpanded ? "rotate-90" : "")} />
          {ubid.ubid}
        </div>
      </td>
      <td className="px-2 py-3 font-medium text-text-main shrink-0 min-w-[120px]">{ubid.canonicalName}</td>
      <td className="px-2 py-3">
        <div className="flex flex-col gap-0.5">
          {ubid.pan && <span className="text-[9px] text-text-muted">PAN: {ubid.pan}</span>}
          {ubid.gstin && <span className="text-[9px] text-text-muted">GST: {ubid.gstin}</span>}
          {!ubid.pan && !ubid.gstin && <span className="text-[9px] text-text-muted italic">None</span>}
        </div>
      </td>
      <td className="px-2 py-3 max-w-[200px]">
        <p className="text-[9px] text-text-main truncate" title={ubid.evidence[ubid.evidence.length - 1]}>
          {ubid.evidence[ubid.evidence.length - 1] || 'Anchor Linkage'}
        </p>
      </td>
      <td className="px-2 py-3 text-text-muted">{lastSignal}</td>
      <td className="px-2 py-3 text-center">
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
          ubid.status === 'Active' ? "bg-green-100 text-status-active" :
          ubid.status === 'Dormant' ? "bg-orange-100 text-status-dormant" :
          "bg-red-100 text-status-closed"
        )}>
          {ubid.status}
        </span>
      </td>
      {searchQuery && (
        <td className="px-2 py-3">
          <span className="text-[10px] font-bold text-accent uppercase">
            {(score * 100).toFixed(0)}%
          </span>
        </td>
      )}
      <td className="px-2 py-3 text-center">
        <a 
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ubid.canonicalName} ${ubid.canonicalAddress || ''}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex p-1 text-accent hover:bg-blue-50 rounded transition-colors"
          title="View on Google Maps"
        >
          <MapPin className="w-3.5 h-3.5" />
        </a>
      </td>
      <td className="px-2 py-3 text-right">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails?.(ubid);
          }}
          className="inline-flex items-center gap-1.5 px-2 py-1 text-accent border border-accent/20 bg-accent/5 rounded hover:bg-accent hover:text-white transition-all opacity-0 group-hover:opacity-100 font-bold text-[9px] uppercase tracking-wider"
        >
          View Deep File
          <ExternalLink className="w-3 h-3" />
        </button>
      </td>
    </tr>
    {isExpanded && (
      <tr className="bg-bg/10 border-b border-border">
        <td colSpan={searchQuery ? 9 : 8} className="p-0">
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
          >
            <div className="p-4">
              <UBIDDetailContent 
                ubid={ubid} 
                events={events}
                onUpdateStatus={(status, reason) => onUpdateStatus?.(ubid.ubid, status, reason)}
                onUnlinkRecord={(recordId) => onUnlinkRecord?.(ubid.ubid, recordId)}
              />
            </div>
          </motion.div>
        </td>
      </tr>
    )}
  </React.Fragment>
));

QueryResultRow.displayName = 'QueryResultRow';

const QueryTool = React.memo(({ 
  ubids, 
  events,
  onViewDetails,
  onUpdateStatus,
  onUnlinkRecord
}: { 
  ubids: UBIDRecord[], 
  events: ActivityEvent[],
  onViewDetails?: (ubid: UBIDRecord) => void,
  onUpdateStatus?: (ubidId: string, status: 'Active' | 'Dormant' | 'Closed', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [deptFilter, setDeptFilter] = useState<string>('All');
  const [pinFilter, setPinFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [isAnyActivity, setIsAnyActivity] = useState<boolean>(false);
  const [months, setMonths] = useState<number>(18);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    }, 1500);
  };

  const ACTIVITY_TYPES = [
    'Inspection',
    'Renewal',
    'Bill Payment',
    'Compliance Filing',
    'Safety Audit',
    'License Renewal'
  ];
 
  const fuse = useMemo(() => new Fuse(ubids, {
    keys: [
      'canonicalName', 
      'ubid', 
      'pan', 
      'gstin', 
      'canonicalAddress', 
      'pinCode',
      'linkedRecords.id'
    ],
    threshold: 0.4,
    includeScore: true
  }), [ubids]);

  const filteredResults = useMemo(() => {
    let scoredResults: { item: UBIDRecord; score: number }[] = [];
    if (searchQuery) {
      scoredResults = fuse.search(searchQuery).map(result => ({
        item: result.item,
        score: 1 - (result.score || 0)
      }));
    } else {
      scoredResults = ubids.map(u => ({ item: u, score: 1 }));
    }

    return scoredResults.filter(({ item: ubid }) => {
      // Status Filter
      if (statusFilter !== 'All' && ubid.status !== statusFilter) return false;

      // Department Filter
      if (deptFilter !== 'All' && !ubid.linkedRecords.some(r => r.department === deptFilter)) return false;

      // PIN Filter
      if (pinFilter && !ubid.pinCode.includes(pinFilter)) return false;

      // Activity Filter
      const thresholdDate = subMonths(new Date(), months);
      
      if (isAnyActivity) {
        // "No activity of ANY type in the last X months"
        const hasAnyRecentActivity = events.some(e => 
          e.ubid === ubid.ubid && 
          parseISO(e.date) >= thresholdDate
        );
        if (hasAnyRecentActivity) return false;
      } else if (selectedActivities.length > 0) {
        // "No activity of selected types in the last X months"
        const hasMatchingRecentActivity = events.some(e => 
          e.ubid === ubid.ubid && 
          selectedActivities.includes(e.eventType) && 
          parseISO(e.date) >= thresholdDate
        );
        if (hasMatchingRecentActivity) return false;
      }

      return true;
    });
  }, [statusFilter, deptFilter, pinFilter, searchQuery, selectedActivities, isAnyActivity, months, fuse, ubids, events]);

  const toggleActivity = (type: string) => {
    if (isAnyActivity) return;
    setSelectedActivities(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const getLastSignal = (ubid: string) => {
    const ubidEvents = events.filter(e => e.ubid === ubid);
    if (ubidEvents.length === 0) return 'No signals';
    
    const latest = ubidEvents.sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())[0];
    return `${formatDistanceToNow(parseISO(latest.date))} ago (${latest.department})`;
  };

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-bg/50">
        <h2 className="text-sm font-bold text-text-main">Advanced Query Builder</h2>
        <p className="text-[11px] text-text-muted">Run cross-departmental queries that were previously impossible.</p>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase">Search</label>
            <input 
              type="text" 
              placeholder="Name, PAN, or GSTIN" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-1.5 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-accent" 
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase">Status</label>
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-1.5 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Dormant">Dormant</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase">Department</label>
            <select 
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full p-1.5 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Departments</option>
              <option value="Factories">Factories</option>
              <option value="Labour">Labour</option>
              <option value="KSPCB">KSPCB</option>
              <option value="Shop & Establishment">Shop & Est</option>
              <option value="BESCOM">BESCOM</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-text-muted uppercase">PIN Code</label>
            <input 
              type="text" 
              placeholder="e.g. 560058" 
              value={pinFilter}
              onChange={(e) => setPinFilter(e.target.value)}
              className="w-full p-1.5 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-accent" 
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <span className="text-[10px] font-bold text-text-muted uppercase self-center mr-2">Quick Logic:</span>
          <button 
            onClick={() => {
              setStatusFilter('Active');
              setDeptFilter('Factories');
              setPinFilter('560058');
              setMonths(18);
              setSelectedActivities(['Inspection']);
              setIsAnyActivity(false);
            }}
            className="px-2 py-1 text-[9px] font-bold bg-bg border border-border rounded hover:border-accent text-accent transition-colors"
          >
            Factories w/o Inspection (18m)
          </button>
          <button 
            onClick={() => {
              setStatusFilter('All');
              setPinFilter('560063');
              setIsAnyActivity(true);
              setMonths(12);
            }}
            className="px-2 py-1 text-[9px] font-bold bg-bg border border-border rounded hover:border-accent text-accent transition-colors"
          >
            Zero Activity Zone (12m)
          </button>
          <button 
            onClick={() => {
              setStatusFilter('Dormant');
              setDeptFilter('Labour');
              setSelectedActivities(['Compliance Filing']);
              setMonths(6);
            }}
            className="px-2 py-1 text-[9px] font-bold bg-bg border border-border rounded hover:border-accent text-accent transition-colors"
          >
            Labour Compliance Lapses
          </button>
        </div>

        <div className="p-3 bg-blue-50/50 rounded border border-blue-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-accent text-white text-[7px] font-bold px-2 py-0.5 rounded-bl uppercase tracking-tighter">
            Cross-Service Logic Engine
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span className="text-[11px] font-bold text-accent uppercase">Activity Recency Filter</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-muted font-medium">In the last</span>
              <input 
                type="number" 
                value={months}
                onChange={(e) => setMonths(parseInt(e.target.value) || 0)}
                className="w-10 p-1 text-[10px] bg-card border border-border rounded font-bold text-center" 
              />
              <span className="text-[10px] text-text-muted font-medium">months</span>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="any-activity"
                checked={isAnyActivity}
                onChange={(e) => {
                  setIsAnyActivity(e.target.checked);
                  if (e.target.checked) setSelectedActivities([]);
                }}
                className="w-3 h-3 accent-accent"
              />
              <label htmlFor="any-activity" className="text-[11px] font-medium text-text-main">
                Show businesses with <span className="font-bold text-red-600 uppercase">NO activity of any type</span>
              </label>
            </div>

            {!isAnyActivity && (
              <div className="space-y-2">
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-tight">Or select specific activity types to exclude:</p>
                <div className="flex flex-wrap gap-1.5">
                  {ACTIVITY_TYPES.map(type => (
                    <button
                      key={type}
                      onClick={() => toggleActivity(type)}
                      className={cn(
                        "px-2 py-1 rounded text-[10px] font-medium transition-all border",
                        selectedActivities.includes(type)
                          ? "bg-accent text-white border-accent shadow-sm"
                          : "bg-white text-text-muted border-border hover:border-accent/50"
                      )}
                    >
                      No {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="px-4 py-1.5 bg-accent text-white text-xs font-bold rounded hover:opacity-90 transition-opacity flex items-center gap-2">
            <Search className="w-3.5 h-3.5" /> Refresh Results
          </button>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-bold text-text-muted uppercase">Query Results ({filteredResults.length} matches)</h3>
          <button 
            onClick={handleExport}
            disabled={isExporting}
            className="text-[10px] font-bold text-accent flex items-center gap-1 hover:underline disabled:opacity-50"
          >
            {isExporting ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 animate-spin" /> Generating...
              </span>
            ) : exportSuccess ? (
              <span className="flex items-center gap-1 text-status-active">
                <CheckCircle2 className="w-3 h-3" /> Download Ready
              </span>
            ) : (
              <>
                <Download className="w-3 h-3" /> Export CSV
              </>
            )}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="bg-bg/50 border-b border-border">
                <th className="px-2 py-2 font-bold text-text-muted uppercase">UBID</th>
                <th className="px-2 py-2 font-bold text-text-muted uppercase">Business Name</th>
                <th className="px-2 py-2 font-bold text-text-muted uppercase">Identifiers</th>
                <th className="px-2 py-2 font-bold text-text-muted uppercase">Latest Evidence</th>
                <th className="px-2 py-2 font-bold text-text-muted uppercase">Last Signal</th>
                <th className="px-2 py-2 font-bold text-text-muted uppercase">Status</th>
                {searchQuery && <th className="px-2 py-2 font-bold text-text-muted uppercase">Match</th>}
                <th className="px-2 py-2 font-bold text-text-muted uppercase text-center">Map</th>
                <th className="px-2 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredResults.map(({ item: ubid, score }) => (
                <QueryResultRow 
                  key={ubid.ubid}
                  ubid={ubid}
                  score={score}
                  searchQuery={searchQuery}
                  isExpanded={expandedRow === ubid.ubid}
                  onToggle={() => setExpandedRow(expandedRow === ubid.ubid ? null : ubid.ubid)}
                  lastSignal={getLastSignal(ubid.ubid)}
                  onViewDetails={onViewDetails}
                  onUpdateStatus={onUpdateStatus}
                  onUnlinkRecord={onUnlinkRecord}
                  events={events}
                />
              ))}
              {filteredResults.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-text-muted italic">
                    No businesses match the selected criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

QueryTool.displayName = 'QueryTool';

// --- Main App ---

export default function App() {
  return (
    <SelfHealingBridge>
      <UBIDIntelligenceApp />
    </SelfHealingBridge>
  );
}

function UBIDIntelligenceApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'review' | 'explorer' | 'query' | 'system-query' | 'registry' | 'resolution' | 'audit'>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [selectedUbid, setSelectedUbid] = useState<UBIDRecord | null>(null);
  
  // Bootstrap the system using the linkage engine on raw records + mock anchors
  const [ubids, setUbids] = useState<UBIDRecord[]>(() => {
    const { sourceRecords } = generateMockData();
    const resolved = resolveUBIDs(sourceRecords);
    // Merge with high-quality mock anchors for demonstration
    return [...MOCK_UBIDS, ...resolved.filter(r => !MOCK_UBIDS.some(m => m.ubid === r.ubid))];
  });

  const [events, setEvents] = useState<ActivityEvent[]>(MOCK_EVENTS);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>(INITIAL_SUGGESTIONS);
  const [knowledge, setKnowledge] = useState<SystemKnowledge>({
    manualLinks: [],
    manualBlacklist: [],
    learnedWeights: { nameWeight: 0.65, addressWeight: 0.25, pinWeight: 0.1 }
  });

  const appOrphans = useMemo(() => findOrphanEvents(events, ubids), [events, ubids]);

  const fuse = useMemo(() => new Fuse(ubids, {
    keys: [
      'canonicalName', 
      'ubid', 
      'pan', 
      'gstin', 
      'canonicalAddress', 
      'pinCode',
      'linkedRecords.id'
    ],
    threshold: 0.4,
    includeScore: true
  }), [ubids]);

  const logAudit = useCallback((action: string, entityId: string, details: string, type: AuditEntry['type']) => {
    const entry: AuditEntry = {
      id: `AUDIT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      action,
      actor: 'Senior Reviewer (White Hawk)',
      entityId,
      details,
      type
    };
    setAuditLog(prev => [entry, ...prev]);
  }, []);

  const handleStatusOverride = useCallback((ubidId: string, status: 'Active' | 'Dormant' | 'Closed', reason: string) => {
    setUbids(prev => prev.map(u => {
      if (u.ubid === ubidId) {
        logAudit('Status Override', ubidId, `Status changed from ${u.status} to ${status}. Reason: ${reason}`, 'Governance');
        const historyEntry: StatusChange = {
          from: u.status,
          to: status,
          reason,
          timestamp: new Date().toISOString(),
          actor: 'Senior Reviewer (White Hawk)',
          type: 'Manual'
        };

        return {
          ...u,
          status,
          manualStatusOverride: {
            status,
            reason,
            timestamp: new Date().toISOString(),
            actor: 'Senior Reviewer (White Hawk)'
          },
          statusHistory: [...(u.statusHistory || []), historyEntry]
        };
      }
      return u;
    }));
  }, []);

  const handleUnlinkRecord = useCallback((ubidId: string, recordId: string) => {
    setUbids(prev => prev.map(u => {
      if (u.ubid === ubidId) {
        return {
          ...u,
          linkedRecords: u.linkedRecords.filter(r => r.id !== recordId),
          unlinkedRecordIds: [...(u.unlinkedRecordIds || []), recordId]
        };
      }
      return u;
    }));
  }, []);

  const handleMatchApproved = useCallback((suggestion: MatchSuggestion) => {
    // Persist as manual link knowledge
    setKnowledge(prev => ({
      ...prev,
      manualLinks: [...prev.manualLinks, { recordId: suggestion.recordB.id, ubid: suggestion.recordA.id }]
    }));

    // In a real system, this would trigger a merge logic
    // Here we'll simulate linking recordB into the UBID of recordA (if recordA has one)
    // or creating a new shared UBID
    const targetUbid = ubids.find(u => u.linkedRecords.some(r => r.id === suggestion.recordA.id));
    
    if (targetUbid) {
      logAudit('Manual Linkage', targetUbid.ubid, `Record ${suggestion.recordB.id} manually linked to ${targetUbid.ubid}`, 'Security');
      setUbids(prev => prev.map(u => {
        if (u.ubid === targetUbid.ubid) {
          // Add recordB to this UBID
          const alreadyLinked = u.linkedRecords.some(r => r.id === suggestion.recordB.id);
          if (alreadyLinked) return u;
          return {
            ...u,
            linkedRecords: [...u.linkedRecords, suggestion.recordB],
            confidence: Math.min(u.confidence + 0.05, 0.99),
            evidence: [...u.evidence, `Manual Match Approved: ${suggestion.reasons.join(', ')}`]
          };
        }
        return u;
      }));
    } else {
      // Create new UBID for both
      // This is a simplified simulation
      const newUbidId = `KA-MANUAL-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      logAudit('Entity Resolution', newUbidId, `Created new manual UBID cluster for records ${suggestion.recordA.id} and ${suggestion.recordB.id}`, 'Governance');
      const newUbid: UBIDRecord = {
        ubid: newUbidId,
        anchorType: 'Internal',
        canonicalName: suggestion.recordA.businessName,
        canonicalAddress: suggestion.recordA.address,
        pinCode: suggestion.recordA.pinCode,
        status: 'Active',
        statusHistory: [
          { from: 'Unknown', to: 'Active', reason: 'Manual Linkage Confirmation', timestamp: new Date().toISOString(), actor: 'Senior Reviewer (White Hawk)', type: 'Manual' }
        ],
        confidence: 0.95,
        riskScore: 20,
        evidence: [`Manual Linkage: ${suggestion.reasons.join(', ')}`],
        lastUpdated: new Date().toISOString().split('T')[0],
        linkedRecords: [suggestion.recordA, suggestion.recordB]
      };
      setUbids(prev => [...prev, newUbid]);
    }
  }, [ubids]);

  const handleMatchRejected = useCallback((suggestion: MatchSuggestion) => {
    logAudit('Linkage Block', suggestion.recordA.id, `Manually blacklisted record ${suggestion.recordB.id} from matching with this entity.`, 'Security');
    setKnowledge(prev => ({
      ...prev,
      manualBlacklist: [
        ...prev.manualBlacklist, 
        { recordIdA: suggestion.recordA.id, recordIdB: suggestion.recordB.id }
      ]
    }));
  }, []);

  const handleResolveOrphan = useCallback((event: ActivityEvent, action: 'create' | 'link', targetUbidId?: string) => {
    if (action === 'create') {
      const newUbidId = `KA-ORPHAN-${event.id.substring(0, 5)}`;
      logAudit('Orphan Resolution', newUbidId, `Projected new entity from unlinked signal ${event.eventType} (${event.id})`, 'Governance');
      
      // Create an initial source record from the orphan signal hints
      const initialRecord: SourceRecord = {
        id: `SR-${event.id}`,
        department: event.department,
        businessName: event.businessNameHint || `Unknown Entity (${event.id})`,
        address: event.addressHint || 'Address TBD',
        pinCode: event.pinCodeHint || '000000',
        ownerName: 'Derived from Signal'
      };

      const newRecord: UBIDRecord = {
        ubid: newUbidId,
        anchorType: 'Internal',
        canonicalName: initialRecord.businessName,
        canonicalAddress: initialRecord.address,
        pinCode: initialRecord.pinCode,
        status: 'Active',
        statusHistory: [
          { from: 'Unknown', to: 'Active', reason: 'New Entity Projection from Orphan Signal', timestamp: new Date().toISOString(), actor: 'Senior Reviewer (White Hawk)', type: 'Manual' }
        ],
        confidence: 0.75,
        riskScore: 30,
        evidence: [`Resolved from Orphan Event: ${event.eventType}`],
        lastUpdated: new Date().toISOString().split('T')[0],
        linkedRecords: [initialRecord]
      };
      setUbids(prev => [...prev, newRecord]);
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, ubid: newUbidId } : e));
    } else if (action === 'link' && targetUbidId) {
      logAudit('Orphan Linkage', targetUbidId, `Linked unlinked signal ${event.eventType} to existing entity.`, 'Governance');
      setUbids(prev => prev.map(u => {
        if (u.ubid === targetUbidId) {
          return {
            ...u,
            evidence: [...u.evidence, `Linked Orphan Event: ${event.eventType}`]
          };
        }
        return u;
      }));
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, ubid: targetUbidId } : e));
    }
  }, [setUbids, setEvents]);

  const globalResults = useMemo(() => {
    if (!globalSearch) return [];
    return fuse.search(globalSearch).slice(0, 5).map(r => ({
      item: r.item,
      score: 1 - (r.score || 0)
    }));
  }, [globalSearch, fuse]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'explorer', label: 'UBID Explorer', icon: Search },
    { id: 'registry', label: 'Central Registry', icon: Fingerprint },
    { id: 'review', label: 'Reviewer Queue', icon: Users },
    { id: 'resolution', label: 'Orphan Signals', icon: AlertCircle },
    { id: 'audit', label: 'Audit Ledger', icon: History },
    { id: 'system-query', label: 'System Query', icon: Zap },
    { id: 'query', label: 'System Logic', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-[200px] bg-sidebar text-sidebar-text flex flex-col fixed h-full border-r border-border/10">
        <div className="py-6">
          <div className="flex items-center gap-2.5 px-5 mb-8">
            <div className="w-8 h-8 bg-accent rounded flex items-center justify-center">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-white tracking-tight">UBID PLATFORM</h1>
            </div>
          </div>

          <nav className="space-y-0.5">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-all border-l-4",
                  activeTab === tab.id 
                    ? "bg-slate-800 text-sidebar-active border-accent" 
                    : "text-sidebar-text border-transparent hover:text-sidebar-active hover:bg-slate-800/50"
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-5 border-t border-border/10">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-slate-700 flex items-center justify-center text-[10px] font-bold text-white">
              WH
            </div>
            <div>
              <p className="text-xs font-bold text-white">White Hawk Coders</p>
              <p className="text-[10px] text-sidebar-text">Senior Reviewer</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[200px] flex flex-col h-screen overflow-hidden">
        <header className="h-[60px] bg-card border-b border-border flex items-center justify-between px-6 shrink-0">
          <div className="relative w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search by UBID, PAN, GSTIN or Business Name..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-bg border-none rounded focus:ring-1 focus:ring-accent outline-none transition-all"
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowGlobalResults(true);
              }}
              onFocus={() => setShowGlobalResults(true)}
              onBlur={() => setTimeout(() => setShowGlobalResults(false), 200)}
            />
            
            <AnimatePresence>
              {showGlobalResults && globalResults.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden"
                >
                  <div className="p-2 border-b border-border bg-bg/50">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Global Search Results</span>
                  </div>
                  <div className="divide-y divide-border">
                    {globalResults.map(({ item: u, score }) => (
                      <button 
                        key={u.ubid}
                        onClick={() => {
                          setSelectedUbid(u);
                          setActiveTab('explorer');
                          setGlobalSearch('');
                          setShowGlobalResults(false);
                        }}
                        className="w-full p-3 text-left hover:bg-bg transition-colors flex justify-between items-start"
                      >
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-xs font-bold text-text-main truncate">{u.canonicalName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-mono font-bold text-accent">{u.ubid}</span>
                            <span className={cn(
                              "text-[8px] font-bold px-1 rounded uppercase",
                              u.status === 'Active' ? "bg-green-100 text-status-active" :
                              u.status === 'Dormant' ? "bg-orange-100 text-status-dormant" :
                              "bg-red-100 text-status-closed"
                            )}>{u.status}</span>
                          </div>
                          <p className="text-[9px] text-text-muted mt-1 truncate">
                            {u.evidence[0] || 'Linked via Anchor ID'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[9px] font-bold text-accent bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            {(score * 100).toFixed(0)}% Match
                          </span>
                          <span className="text-[8px] text-text-muted font-mono">{u.pinCode}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-text-main">
              <span>Admin: Dept of Commerce</span>
              <div className="w-8 h-8 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-7xl mx-auto space-y-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'dashboard' && <Dashboard ubids={ubids} events={events} />}
                {activeTab === 'review' && (
                  <ReviewerQueue 
                    suggestions={suggestions} 
                    setSuggestions={setSuggestions}
                    onApprove={handleMatchApproved} 
                    onReject={handleMatchRejected}
                  />
                )}
                {activeTab === 'registry' && (
                  <CentralUBIDRegistry 
                    ubids={ubids} 
                    setUbids={setUbids} 
                    onUpdateStatus={handleStatusOverride}
                    onUnlinkRecord={handleUnlinkRecord}
                    onResolveOrphans={() => setActiveTab('resolution')}
                    knowledge={knowledge}
                    events={events}
                  />
                )}
                {activeTab === 'resolution' && (
                  <OrphanResolution 
                    orphans={appOrphans}
                    ubids={ubids}
                    onResolve={handleResolveOrphan}
                  />
                )}
                {activeTab === 'explorer' && (
                  <UBIDExplorer 
                    ubids={ubids}
                    events={events}
                    selectedUbid={selectedUbid} 
                    setSelectedUbid={setSelectedUbid} 
                    onUpdateStatus={handleStatusOverride}
                    onUnlinkRecord={handleUnlinkRecord}
                  />
                )}
                {activeTab === 'audit' && <AuditTrail log={auditLog} />}
                {activeTab === 'query' && (
                  <div className="space-y-5">
                    <div className="bg-card p-6 rounded-lg border border-border">
                      <h2 className="text-sm font-bold mb-4">Master Data Linkage Logic</h2>
                      <div className="space-y-4 text-xs leading-relaxed">
                        <div className="p-3 bg-bg rounded border border-border">
                          <p className="font-bold text-accent mb-1">Rule 1: UBID Identity (KA-XXXXXXXX-C)</p>
                          <p>All entities are assigned a globally unique identifier with an 8-character entropy pool (Base36, excluding O/I) and a Mod-36 checksum for reliability during manual transcription.</p>
                        </div>
                        <div className="p-3 bg-bg rounded border border-border">
                          <p className="font-bold text-accent mb-1">Rule 2: Deterministic Anchoring</p>
                          <p>UBIDs are generated deterministically based on central identifiers (GSTIN/PAN) or high-confidence business attributes, ensuring consistency across system reloads.</p>
                        </div>
                        <div className="p-3 bg-bg rounded border border-border">
                          <p className="font-bold text-accent mb-1">Rule 3: Late Anchoring</p>
                          <p>Internal UBIDs are automatically upgraded to Central UBIDs if a newer record (e.g. from Commercial Taxes) provides a PAN/GSTIN for any record in the cluster.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {activeTab === 'system-query' && (
                  <div className="space-y-5">
                    <SchemaEvolutionTool />
                    <QueryTool 
                      ubids={ubids} 
                      events={events}
                      onUpdateStatus={handleStatusOverride}
                      onUnlinkRecord={handleUnlinkRecord}
                      onViewDetails={(ubid) => {
                        setSelectedUbid(ubid);
                        setActiveTab('explorer');
                      }}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
      <GeminiChat />
    </div>
  );
}
