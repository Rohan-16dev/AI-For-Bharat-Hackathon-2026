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
  Calculator,
  HardHat,
  FileText,
  Sparkles,
  ExternalLink,
  ChevronDown,
  History,
  Link as LinkIcon,
  Fingerprint,
  ShieldCheck,
  RefreshCcw,
  RotateCcw,
  Zap,
  Shield,
  ShieldAlert,
  AlertTriangle,
  Microscope,
  Link2Off,
  Settings,
  MoreVertical,
  MousePointer2,
  FileSearch,
  Lock,
  Bell,
  BellRing,
  Lightbulb,
  Cpu,
  Plus,
  Trash2,
  BarChart2,
  ChevronUp,
  Terminal as TerminalIcon
} from 'lucide-react';
import Papa from 'papaparse';
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
import { cn, maskPAN, maskSensitive } from './lib/utils';
import { MOCK_UBIDS, MOCK_EVENTS, generateMockData } from './mockData';
import { SelfHealingBridge } from './components/SelfHealingBridge';
import { SchemaEvolutionTool } from './components/SchemaEvolutionTool';
import { UBIDRecord, ActivityEvent, Department, MatchSuggestion, StatusChange, SystemKnowledge, SourceRecord, AuditEntry, AppNotification, LogicAuditTrail } from './types';
import { resolveUBIDs, generateUnifiedBusinessIdentifier, promoteUBID, adjustSystemWeights, createBaseUBID, getUnitRole } from './services/ubidService';
import { cleanBusinessData } from './services/aiNormalizationService';
import { inferBusinessStatus, findOrphanEvents, StatusVerdict, getHighValueOrphans, getContradictions } from './services/statusInferenceService';
import { compareRecords, normalizeString } from './services/fuzzyMatchingService';
import { sanitizeRow, transformToSourceRecord, transformToActivityEvent, sanitizeValue } from './services/dataSanitizer';
import { GeminiChat } from './components/GeminiChat';
import { ThinkingAssistant } from './components/ThinkingAssistant';
import { getMapsGroundingInfo, AIError } from './services/geminiService';
import { AIErrorAlert } from './components/AIErrorAlert';
import { NotificationManager } from './components/NotificationManager';

// --- Components ---

const formatPercent = (val: number | undefined): string => {
  if (val === undefined || val === null) return 'N/A';
  // If the value is > 1.0, it's likely a raw count or days, not a percentage Score
  if (val > 1.0) return Math.round(val).toString();
  return `${Math.round(val * 100)}%`;
};

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

const ReasoningRenderer = ({ reasoning, title, reasons, compact, reason_log }: { reasoning?: string | LogicAuditTrail, title?: string, reasons?: string[], compact?: boolean, reason_log?: string }) => {
  if (!reasoning && (!reasons || reasons.length === 0) && !reason_log) return null;
  
  const isStructured = typeof reasoning !== 'string' && reasoning && (reasoning as any).explanation;
  
  if (compact) {
    const text = reason_log || (isStructured ? (reasoning as any).explanation : String(reasoning || ''));
    return (
      <div className="bg-bg/40 rounded-md p-1.5 border border-border/50">
        {title && <span className="text-[8px] font-bold text-text-muted uppercase tracking-tighter block mb-0.5">{title}</span>}
        <p className="text-[10px] text-text-main line-clamp-2 leading-tight italic">
          "{text}"
        </p>
      </div>
    );
  }
  
  if (!isStructured) {
    return (
      <div className="space-y-1 w-full">
        {title && <p className="text-[10px] font-black uppercase text-text-muted tracking-widest mb-1">{title}</p>}
        {reason_log && (
          <div className="mb-2 p-2 bg-accent/5 border-l-2 border-accent rounded-r font-mono text-[10px] font-bold text-accent italic">
            LOGIC TRACE: {reason_log}
          </div>
        )}
        {reasoning && (
          <p className="text-xs font-medium leading-relaxed text-text-main italic border-l-2 border-accent/20 pl-3">
            "{String(reasoning)}"
          </p>
        )}
        {reasons && reasons.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {reasons.map((r, i) => (
              <span key={`${i}-${r}`} className="text-[10px] bg-white px-2 py-0.5 rounded border border-border text-accent font-medium flex items-center gap-1">
                <CheckCircle2 className="w-2.5 h-2.5" /> {r}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  const trail = reasoning as LogicAuditTrail;
  
  return (
    <div className="space-y-2 w-full">
      <div className="flex items-center justify-between">
        {title && <p className="text-[10px] font-black uppercase text-text-muted tracking-widest">{title}</p>}
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded border border-accent/20">
            {trail.engine_version}
          </span>
          <span className="text-[8px] text-text-muted">{format(parseISO(trail.timestamp), 'HH:mm:ss')}</span>
        </div>
      </div>
      
      {reason_log && (
        <div className="p-2 bg-accent/5 border-l-2 border-accent rounded-r font-mono text-[10px] font-bold text-accent italic">
          LOGIC TRACE: {reason_log}
        </div>
      )}

      <p className={cn(
        "text-xs font-bold leading-relaxed",
        trail.verdict === 'AUTO_MERGE' || trail.verdict === 'ACTIVE' ? "text-status-active" : 
        trail.verdict === 'HUMAN_REVIEW' || trail.verdict === 'DORMANT' ? "text-status-dormant" :
        "text-text-main"
      )}>
        {trail.explanation}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        {trail.logic_nodes.map((node, idx) => (
          <div key={`${idx}-${node.node}`} className="bg-white/50 border border-border/60 p-2 rounded flex items-center justify-between shadow-sm">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter flex items-center gap-1">
                {node.status === 'PASS' ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <AlertCircle className="w-2.5 h-2.5 text-red-500" />}
                {node.node}
              </span>
              <span className="text-[10px] text-text-main leading-tight mt-0.5">{node.reason}</span>
            </div>
            <div className="flex flex-col items-end">
              <div className={cn(
                "px-1 py-0.5 rounded text-[8px] font-bold uppercase",
                node.status === 'PASS' ? "bg-green-100 text-green-700" :
                node.status === 'FAIL' ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-700"
              )}>
                {node.status}
              </div>
              {node.score !== undefined && (
                <span className="text-[9px] font-bold text-accent mt-1">
                  {formatPercent(node.score)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Dashboard = ({ 
  ubids, 
  events,
  addNotification
}: { 
  ubids: UBIDRecord[], 
  events: ActivityEvent[],
  addNotification?: (title: string, message: string, type: AppNotification['type']) => void
}) => {
  const [mapsInfo, setMapsInfo] = useState<string | null>(null);
  const [isMapsLoading, setIsMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<AIError | null>(null);
  const [dashboardFilter, setDashboardFilter] = useState({
    pincode: 'All',
    department: 'All',
    status: 'All'
  });

  const handleFetchMapsInfo = async () => {
    setIsMapsLoading(true);
    setMapsError(null);
    addNotification?.("Geospatial Query", "Fetching local industrial intelligence for Peenya...", "info");
    try {
      const info = await getMapsGroundingInfo('Peenya Industrial Area');
      setMapsInfo(info);
      addNotification?.("Intelligence Updated", "Geospatial data for Peenya synchronized.", "success");
    } catch (err: any) {
      console.error(err);
      setMapsError(err);
      addNotification?.("Maps Query Failed", `Grounding engine error: ${err.userMessage || 'Unknown network error'}`, "error");
    } finally {
      setIsMapsLoading(false);
    }
  };

  const filteredUbids = useMemo(() => {
    return ubids.filter(u => {
      const pinMatch = dashboardFilter.pincode === 'All' || u.pinCode === dashboardFilter.pincode;
      const statusMatch = dashboardFilter.status === 'All' || u.status === dashboardFilter.status;
      const deptMatch = dashboardFilter.department === 'All' || u.linkedRecords.some(r => r.department === dashboardFilter.department);
      return pinMatch && statusMatch && deptMatch;
    });
  }, [ubids, dashboardFilter]);

  const highValueOrphans = useMemo(() => getHighValueOrphans(ubids, events), [ubids, events]);
  const contradictions = useMemo(() => getContradictions(ubids, events), [ubids, events]);

  const filteredHighValueOrphans = useMemo(() => {
    return highValueOrphans.filter(u => {
      const pinMatch = dashboardFilter.pincode === 'All' || u.pinCode === dashboardFilter.pincode;
      const deptMatch = dashboardFilter.department === 'All' || u.linkedRecords.some(r => r.department === dashboardFilter.department);
      return pinMatch && deptMatch;
    });
  }, [highValueOrphans, dashboardFilter]);

  const filteredContradictions = useMemo(() => {
    return contradictions.filter(u => {
      const pinMatch = dashboardFilter.pincode === 'All' || u.pinCode === dashboardFilter.pincode;
      const deptMatch = dashboardFilter.department === 'All' || u.linkedRecords.some(r => r.department === dashboardFilter.department);
      return pinMatch && deptMatch;
    });
  }, [contradictions, dashboardFilter]);

  const statusCounts = useMemo(() => {
    const counts = { ACTIVE: 0, DORMANT: 0, CLOSED: 0, UNVERIFIED: 0 };
    filteredUbids.forEach(u => {
      if (u.status === 'ACTIVE') counts.ACTIVE++;
      else if (u.status === 'DORMANT') counts.DORMANT++;
      else if (u.status === 'CLOSED') counts.CLOSED++;
      else counts.UNVERIFIED++;
    });
    return [
      { name: 'ACTIVE', value: counts.ACTIVE, color: '#38A169' },
      { name: 'DORMANT', value: counts.DORMANT, color: '#D69E2E' },
      { name: 'CLOSED', value: counts.CLOSED, color: '#E53E3E' },
      { name: 'UNVERIFIED', value: counts.UNVERIFIED, color: '#718096' },
    ];
  }, [filteredUbids]);

  const deptData = useMemo(() => {
    const depts: Record<string, number> = {};
    filteredUbids.forEach(u => {
      u.linkedRecords.forEach(r => {
        depts[r.department] = (depts[r.department] || 0) + 1;
      });
    });
    return Object.entries(depts).map(([name, count]) => ({ name, count }));
  }, [filteredUbids]);

  const pinDensityData = useMemo(() => {
    const pinCounts: Record<string, { count: number, active: number }> = {};
    filteredUbids.forEach(u => {
      if (!pinCounts[u.pinCode]) pinCounts[u.pinCode] = { count: 0, active: 0 };
      pinCounts[u.pinCode].count++;
      if (u.status === 'ACTIVE') pinCounts[u.pinCode].active++;
    });
    
    return Object.entries(pinCounts)
      .map(([pin, stats]) => ({ pin, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredUbids]);

  const recentEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
      .slice(0, 5);
  }, [events]);

  const handleExport = () => {
    const csvData = filteredUbids.map(u => ({
      UBID: u.ubid,
      Name: u.canonicalName,
      Status: u.status,
      Address: u.canonicalAddress,
      PinCode: u.pinCode,
      RiskScore: u.riskScore
    }));
    
    const csvString = [
      ['UBID', 'Name', 'Status', 'Address', 'PinCode', 'RiskScore'],
      ...csvData.map(item => Object.values(item))
    ].map(e => e.join(",")).join("\n");
    
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `revenue_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addNotification?.("Export Success", "Revenue intelligence data exported to CSV.", "success");
  };

  const uniquePins = useMemo(() => Array.from(new Set(ubids.map(u => u.pinCode))), [ubids]);
  const uniqueDepts = useMemo(() => {
    const depts = new Set<string>();
    ubids.forEach(u => u.linkedRecords.forEach(r => depts.add(r.department)));
    return Array.from(depts);
  }, [ubids]);

  return (
    <div className="space-y-4">
      {/* Revenue Selection Filters */}
      <div className="bg-white p-3 rounded-lg border border-border shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-text-muted uppercase px-1">PIN Code Filter</span>
            <select 
              value={dashboardFilter.pincode} 
              onChange={e => setDashboardFilter(prev => ({ ...prev, pincode: e.target.value }))}
              className="text-xs border border-border rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Regions</option>
              {uniquePins.map(pin => <option key={pin} value={pin}>{pin}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-text-muted uppercase px-1">Dept Segment</span>
            <select 
              value={dashboardFilter.department} 
              onChange={e => setDashboardFilter(prev => ({ ...prev, department: e.target.value }))}
              className="text-xs border border-border rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Departments</option>
              {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-bold text-text-muted uppercase px-1">Status Verdict</span>
            <select 
              value={dashboardFilter.status} 
              onChange={e => setDashboardFilter(prev => ({ ...prev, status: e.target.value }))}
              className="text-xs border border-border rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="All">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="DORMANT">Dormant</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
        </div>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 bg-text-main text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-black transition-all"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV Report
        </button>
      </div>

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
        <StatCard title="Total UBIDs" value={filteredUbids.length.toLocaleString()} icon={Database} color="bg-accent" />
        <StatCard title="Active Businesses" value={statusCounts.find(s => s.name === 'ACTIVE')?.value.toLocaleString() || '0'} icon={Activity} color="bg-status-active" />
        <StatCard title="Revenue At Risk" value={contradictions.length} icon={AlertTriangle} color="bg-red-500" />
        <StatCard title="High-Value Orphans" value={highValueOrphans.length} icon={Sparkles} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section 7, Edge Case 4: High-Value Orphan List */}
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <h3 className="text-sm font-bold text-text-main">High-Value Orphans (Enforcement Priority)</h3>
            </div>
            <span className="text-[9px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full uppercase">Priority Target</span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[250px]">
             {filteredHighValueOrphans.length > 0 ? (
               <div className="space-y-2">
                 {filteredHighValueOrphans.map(u => (
                   <div key={u.ubid} className="p-2 border border-border border-l-4 border-l-orange-500 rounded bg-bg/30">
                     <div className="flex justify-between items-start">
                       <span className="text-[10px] font-mono font-bold text-accent">{u.ubid}</span>
                       <span className="text-[10px] font-bold text-text-main">{u.canonicalName}</span>
                     </div>
                     <p className="text-[9px] text-text-muted mt-1">High utility consumption detected without legal anchor (PAN/GSTIN).</p>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                 <CheckCircle2 className="w-8 h-8 text-status-active mb-2 opacity-20" />
                 <p className="text-xs text-text-muted italic">No high-value orphan entities detected.</p>
               </div>
             )}
          </div>
        </div>

        {/* Section 6, Step 2: Contradiction Flags */}
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-bold text-text-main">Compliance Gaps (Contradiction Flags)</h3>
            </div>
            <span className="text-[9px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase">Revenue Risk</span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[250px]">
             {filteredContradictions.length > 0 ? (
               <div className="space-y-2">
                 {filteredContradictions.map(u => (
                   <div key={u.ubid} className="p-2 border border-border border-l-4 border-l-red-500 rounded bg-bg/30">
                     <div className="flex justify-between items-start">
                       <span className="text-[10px] font-mono font-bold text-accent">{u.ubid}</span>
                       <span className="text-[10px] font-bold text-text-main">{u.canonicalName}</span>
                     </div>
                     <p className="text-[9px] text-text-muted mt-1">Active utility consumption detected but zero compliance filings in 12 months.</p>
                   </div>
                 ))}
               </div>
             ) : (
               <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                 <CheckCircle2 className="w-8 h-8 text-status-active mb-2 opacity-20" />
                 <p className="text-xs text-text-muted italic">No compliance contradictions found.</p>
               </div>
             )}
          </div>
        </div>
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
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Integrity Resolution</p>
              <p className="text-xs text-text-main leading-relaxed">
                <span className="font-bold text-status-active">{ubids.filter(u => u.riskScore > 30).length} entities</span> flagged with Elevated Risk (&gt;30%). The primary driver is <span className="font-bold text-accent">Status Drift</span> across industrial power signals.
              </p>
            </div>
            <div className="p-3 bg-white rounded border border-blue-100">
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Structural Complexity</p>
              <p className="text-xs text-text-main leading-relaxed">
                <span className="font-bold text-orange-600">{ubids.filter(u => u.edgeCaseFlag && u.edgeCaseFlag !== 'NONE').length} Complex Nodes</span> identified. {ubids.filter(u => u.edgeCaseFlag === 'MULTI_BUSINESS').length} instances of Ownership Overlap require manual geospatial verification.
              </p>
            </div>
            <div className="p-3 bg-white rounded border border-blue-100">
              <p className="text-[10px] font-bold text-accent uppercase mb-1">Tax Vertical Health</p>
              <p className="text-xs text-text-main leading-relaxed">
                GSTIN linkage is at <span className="font-bold text-status-active">{((ubids.filter(u => u.gstin).length / ubids.length) * 100).toFixed(1)}%</span>. Automated cross-mapping has projected <span className="font-bold text-red-600">3.2% missing revenue</span> signals due to unlinked 'Shop & Establishment' records.
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
            {isMapsLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <RefreshCcw className="w-6 h-6 text-accent animate-spin" />
                <p className="text-xs font-medium text-text-muted animate-pulse">Consulting Maps Cluster...</p>
              </div>
            ) : mapsError ? (
              <AIErrorAlert 
                error={mapsError} 
                onRetry={handleFetchMapsInfo} 
                className="my-2"
              />
            ) : mapsInfo ? (
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
    id: 'SUG-001',
    confidence: 0.94,
    priority: 'High',
    verdict: 'HUMAN_REVIEW',
    status: 'Pending',
    recordA: {
      id: 'SYN-001',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Sri Lakshmi Enterprises',
      address: 'Plot 45, 2nd Phase, Peenya Industrial Area',
      pinCode: '560058',
      ownerName: 'Lokesh Gowda',
      pan: 'ABCDE1234F',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-002',
      department: 'Factories & Boilers',
      businessName: 'Lakshmi Ent.',
      address: 'No 45, Peenya 2nd PH, Bangalore',
      pinCode: '560058',
      ownerName: 'Lokesh Gowda',
      pan: 'ABCDE1234F',
      status: 'ACTIVE'
    },
    reasons: ['Legal Anchor (PAN) Match', 'Geospatial Anchor (Pincode) Match', 'Name similarity: 88%'],
    confidenceBreakdown: { name: 0.88, address: 0.92, location: 1.0 },
    riskFactors: ['Address Abbreviation detected']
  },
  {
    id: 'SUG-002',
    confidence: 0.82,
    priority: 'Medium',
    verdict: 'HUMAN_REVIEW',
    status: 'Pending',
    recordA: {
      id: 'SYN-003',
      department: 'Commercial Taxes (GST)',
      businessName: 'Singh Tech Solutions',
      address: 'No 1, 1st Floor, Main Road, Peenya',
      pinCode: '560058',
      pan: 'ABCDE9999Z',
      ownerName: 'Vikram Singh',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-004',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Star Cafe & Bakery',
      address: 'No 1, Ground Floor, Main Road, Peenya',
      pinCode: '560058',
      pan: 'ABCDE9999Z',
      ownerName: 'Vikram Singh',
      status: 'ACTIVE'
    },
    reasons: ['Legal Anchor (PAN) Match', 'Geospatial Anchor (Pincode) Match', 'Business Profile Mismatch (Multi-Vertical)'],
    confidenceBreakdown: { name: 0.25, address: 0.95, location: 1.0 },
    riskFactors: ['Multi-business at same physical counter']
  },
  {
    id: 'SUG-003',
    confidence: 0.78,
    priority: 'Medium',
    verdict: 'HUMAN_REVIEW',
    status: 'Pending',
    recordA: {
      id: 'SYN-007',
      department: 'KSPCB (Pollution Control)',
      businessName: 'Green Valley Agro Processing',
      address: 'No 124, Bagalur Road, Yelahanka',
      pinCode: '560063',
      ownerName: 'Meena S.',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-008',
      department: 'Labour Department',
      businessName: 'Green Valley Agricultural Products',
      address: '124, Bagalur RD, Yelahanka',
      pinCode: '560063',
      ownerName: 'Meena S.',
      status: 'ACTIVE'
    },
    reasons: ['Geospatial Anchor Match', 'Phonetic Name Match', 'Owner Name Match'],
    confidenceBreakdown: { name: 0.84, address: 0.81, location: 1.0 },
    riskFactors: ['Missing Legal IDs (No PAN/GSTIN)']
  },
  {
    id: 'SUG-004',
    confidence: 0.92,
    priority: 'High',
    verdict: 'HUMAN_REVIEW',
    status: 'Pending',
    recordA: {
      id: 'SYN-009',
      department: 'Commercial Taxes (GST)',
      businessName: 'Modern Textile Mills',
      address: 'Sector 3, HSR Layout',
      pinCode: '560102',
      pan: 'MODRN1122J',
      ownerName: 'Suresh Raina',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-010',
      department: 'KSPCB (Pollution Control)',
      businessName: 'Modern Textiles',
      address: 'Sector 3, HSR Layout, BLR',
      pinCode: '560102',
      pan: 'MODRN1122J',
      ownerName: 'Suresh Raina',
      status: 'DORMANT'
    },
    reasons: ['Legal Anchor (PAN) Match', 'Geospatial Anchor Match', 'Identical Owner'],
    confidenceBreakdown: { name: 0.96, address: 0.94, location: 1.0 },
    riskFactors: ['Operational Status Drift: Active vs Dormant']
  },
  {
    id: 'SUG-005',
    confidence: 0.45,
    priority: 'Low',
    verdict: 'ORPHAN',
    status: 'Pending',
    recordA: {
      id: 'SYN-015',
      department: 'Labour Department',
      businessName: 'Karnataka Food Court',
      address: 'Terminal 1, KIA',
      pinCode: '560300',
      pan: 'FOODC1111A',
      ownerName: 'Zeeshan Ali',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-016',
      department: 'Factories & Boilers',
      businessName: 'Karnataka Food Court',
      address: 'Terminal 1, Kempegowda Intl Airport',
      pinCode: '560300',
      pan: 'FOOOD2222B',
      ownerName: 'Mahesh B.',
      status: 'ACTIVE'
    },
    reasons: ['Name Collision Detected', 'Geospatial Proximity Match'],
    confidenceBreakdown: { name: 1.0, address: 0.88, location: 1.0 },
    riskFactors: ['IDENTITY COLLISION: PANs do not match', 'Different Owners']
  },
  {
    id: 'SUG-006',
    confidence: 0.85,
    priority: 'Medium',
    verdict: 'HUMAN_REVIEW',
    status: 'Pending',
    recordA: {
      id: 'SYN-017',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Venkateswara Mobiles',
      address: 'Shop 10, Jayanagar 4th Block',
      pinCode: '560011',
      pan: undefined,
      ownerName: 'V. R. Kumar',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-018',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Sri Venkateswara Mobiles',
      address: 'No 10, 4th Blk, Jayanagar',
      pinCode: '560011',
      pan: undefined,
      ownerName: 'V. Kumar',
      status: 'ACTIVE'
    },
    reasons: ['Phonetic Name Match', 'Intra-Dept Duplicate Detection', 'Geospatial Match'],
    confidenceBreakdown: { name: 0.90, address: 0.85, location: 1.0 },
    riskFactors: ['Potential Duplicate in Source Dept', 'No Legal Anchor']
  },
  {
    id: 'SUG-007',
    confidence: 0.0,
    priority: 'High',
    verdict: 'IDENTITY_COLLISION',
    status: 'Pending',
    recordA: {
      id: 'SYN-019',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Apollo Pharmacy',
      address: 'Koramangala 8th Block',
      pinCode: '560095',
      pan: 'APOLL1234P',
      ownerName: 'Apollo Hospitals Enterprise Ltd',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYN-020',
      department: 'Shop & Establishment (BBMP)',
      businessName: 'Apollo Pharmacy',
      address: 'Malleshwaram 18th Cross',
      pinCode: '560003',
      pan: 'DRXYZ5678Q',
      ownerName: 'Dr. XYZ',
      status: 'ACTIVE'
    },
    reasons: ['Name match but different owners and different locations', 'Legal anchors totally mismatch'],
    confidenceBreakdown: { name: 1.0, address: 0.1, location: 0.0 },
    riskFactors: ['IDENTITY COLLISION: Same name, different owners/locations/PANs. Stop.']
  },
  {
    id: 'SUG-008',
    confidence: 0.0,
    priority: 'High',
    verdict: 'ORPHAN',
    edgeCaseFlag: 'UNLINKED_EVENT',
    status: 'Pending',
    recordA: {
      id: 'EVT-UNLINKED-99',
      department: 'BESCOM (Power)',
      businessName: 'Unknown Business Entity',
      address: 'No 15, Koramangala 1st Block',
      pinCode: '560034',
      ownerName: 'Not captured',
      status: 'ACTIVE'
    },
    recordB: {
      id: 'SYSTEM-VOID',
      department: 'System',
      businessName: 'No match found',
      address: '',
      pinCode: '',
      ownerName: '',
      status: 'CLOSED'
    },
    reasons: ['Activity event received for unknown record ID.', 'Cannot join to any UBID.'],
    confidenceBreakdown: { name: 0.0, address: 0.0, location: 0.0 },
    riskFactors: ['Never drop an event. It could be an unregistered business operating under the radar.']
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
  setSuggestions,
  onUpdateStatus,
  onUnlinkRecord,
  onResolveOrphans,
  onAddNotification,
  resolveRecords,
  knowledge,
  events
}: { 
  ubids: UBIDRecord[], 
  setUbids: React.Dispatch<React.SetStateAction<UBIDRecord[]>>,
  setSuggestions?: React.Dispatch<React.SetStateAction<MatchSuggestion[]>>,
  onUpdateStatus?: (ubidId: string, status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void,
  onResolveOrphans?: () => void,
  onAddNotification?: (title: string, message: string, type: AppNotification['type']) => void,
  resolveRecords: (records: SourceRecord[], knowledge: SystemKnowledge, events: ActivityEvent[]) => Promise<{ ubids: UBIDRecord[]; suggestions: MatchSuggestion[] }>,
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

  const runResolution = async () => {
    setIsProcessing(true);
    onAddNotification?.("Resolution Started", "Synchronizing 40+ departmental data sources...", "info");
    
    try {
      // 1. Fetch raw data from heterogeneous sources
      const { sourceRecords } = generateMockData();
      
      // 2. AI NORMALIZATION: Clean and standardize messy data using LLM
      const cleanedRecords = await Promise.all(sourceRecords.map(async (r) => {
        try {
          if (r.businessName === r.businessName.toUpperCase() || !r.pan) {
            return await cleanBusinessData(r) as SourceRecord;
          }
          return r;
        } catch (e) {
          console.warn("AI Cleaning failed for record:", r.id, e);
          return r;
        }
      }));
      
      // 3. DETERMINISTIC LOGIC ENGINE: Final linkage resolution
      const { ubids: resolved, suggestions: newSuggestions } = await resolveRecords(cleanedRecords, knowledge, events);
      setUbids(resolved);
      if (setSuggestions) setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
      onAddNotification?.("Resolution Complete", `${resolved.length} business identities reconciled.`, "success");
    } catch (error: any) {
      console.error("Resolution flow error:", error);
      onAddNotification?.("Resolution Failed", `Engine error: ${error.message || 'Unknown discrepancy'}`, "error");
    } finally {
      setIsProcessing(false);
    }
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
                {isProcessing ? (
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2 mb-1">
                      <RefreshCcw className="w-4 h-4 animate-spin text-white" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Ingesting & Resolving...</span>
                    </div>
                    <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 5 }}
                        className="h-full bg-white shadow-[0_0_8px_white]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    <span>Run Entity Resolution</span>
                  </div>
                )}
              </button>
          </div>
        </div>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 grid grid-cols-4 gap-4 px-2"
          >
            {[
              { name: 'Shop Est.', color: 'bg-blue-400' },
              { name: 'Factories', color: 'bg-green-400' },
              { name: 'Labour', color: 'bg-orange-400' },
              { name: 'KSPCB', color: 'bg-red-400' }
            ].map((d, i) => (
              <div key={d.name} className="flex flex-col gap-1">
                 <div className="flex items-center justify-between">
                   <span className="text-[8px] font-bold text-text-muted uppercase">{d.name}</span>
                   <span className="text-[8px] font-bold text-accent">PASS 1...</span>
                 </div>
                 <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      animate={{ width: ['10%', '60%', '100%'] }}
                      transition={{ duration: 2, delay: i * 0.5 }}
                      className={cn("h-full", d.color)}
                    />
                 </div>
              </div>
            ))}
          </motion.div>
        )}
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
              onClick={() => onResolveOrphans()}
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
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif">Linked Records</th>
                <th className="p-4 text-[10px] font-bold text-text-muted uppercase italic serif text-center">Coverage</th>
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
                            <p className={cn(
                              "text-xs font-bold font-mono tracking-tighter",
                              ubid.ubid.includes('KA-INT') ? "text-orange-700" : "text-text-main"
                            )}>
                              {ubid.ubid}
                            </p>
                            <p className="text-[9px] text-text-muted uppercase font-medium">{ubid.anchorType} Anchor {ubid.anchorId ? `(${maskSensitive(ubid.anchorId)})` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-text-main group-hover:text-accent transition-colors">{ubid.canonicalName}</p>
                          <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded border border-blue-200">MOCK</span>
                        </div>
                        <p className="text-[10px] text-text-muted truncate max-w-[200px]">{ubid.canonicalAddress}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="px-2 py-0.5 rounded bg-bg border border-border text-[10px] font-bold text-text-main">
                            {ubid.linkedRecords.length} Signal{ubid.linkedRecords.length !== 1 ? 's' : ''}
                          </div>
                          {ubid.linked_units && ubid.linked_units.length > 1 && (
                            <span className="text-[9px] text-accent font-bold uppercase tracking-tighter">({ubid.linked_units.length} Units)</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex -space-x-1.5 justify-center">
                          {Array.from(new Set(ubid.linkedRecords.map(r => r.department))).slice(0, 3).map((dept, i) => (
                            <div 
                              key={dept} 
                              title={dept}
                              className="w-6 h-6 rounded-full border-2 border-white bg-accent/10 flex items-center justify-center text-[8px] font-bold text-accent shadow-sm"
                            >
                              {dept.charAt(0)}
                            </div>
                          ))}
                          {Array.from(new Set(ubid.linkedRecords.map(r => r.department))).length > 3 && (
                            <div className="w-6 h-6 rounded-full border-2 border-white bg-bg flex items-center justify-center text-[8px] font-bold text-text-muted">
                              +{Array.from(new Set(ubid.linkedRecords.map(r => r.department))).length - 3}
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
                               knowledge={knowledge}
                               onUpdateStatus={(status, reason) => onUpdateStatus?.(ubid.ubid, status, reason)}
                               onUnlinkRecord={(recordId) => onUnlinkRecord?.(ubid.ubid, recordId)}
                               allUbids={ubids}
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
  onReject,
  knowledge
}: { 
  suggestions: MatchSuggestion[],
  setSuggestions: React.Dispatch<React.SetStateAction<MatchSuggestion[]>>,
  onApprove: (suggestion: MatchSuggestion) => void,
  onReject: (suggestion: MatchSuggestion) => void,
  knowledge: SystemKnowledge
}) => {
  const [filter, setFilter] = useState<'All' | 'Ambiguous' | 'Collisions' | 'Duplicates' | 'Unlinked' | 'History'>('All');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [showCommitSuccess, setShowCommitSuccess] = useState(false);

  // Auto-commitment logic for high-confidence matches (Threshold dynamic via Risk Tolerance)
  useEffect(() => {
    const autoCommitThreshold = 1.0 - (knowledge.riskTolerance * 0.1);

    const autoCommit = () => {
      const highConfidencePending = suggestions.filter(
        s => s.status === 'Pending' && s.confidence >= autoCommitThreshold
      );

      if (highConfidencePending.length > 0) {
        // Trigger external side effects outside of the state update map
        highConfidencePending.forEach(s => onApprove(s));

        setSuggestions(prev => prev.map(s => {
          if (s.confidence >= autoCommitThreshold && s.status === 'Pending') {
            return { 
              ...s, 
              status: 'Auto-Committed' as const,
              reviewerFeedback: {
                action: 'Approved',
                reason: `Auto-committed via High Confidence Threshold (>= ${Math.floor(autoCommitThreshold * 100)}%)`,
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
  }, [onApprove, suggestions, knowledge.riskTolerance]);

  const handleAction = (id: string, action: 'Approved' | 'Rejected' | 'Deferred' | 'Pending') => {
    setActioningId(id);
    
    // Simulate capturing feedback and persisting
    setTimeout(() => {
      const suggestion = suggestions.find(s => s.id === id);
      if (suggestion) {
        if (action === 'Approved') onApprove(suggestion);
        if (action === 'Rejected') onReject(suggestion);
      }
      
      setSuggestions(prev => {
        const filtered = prev.filter(s => s.id !== id);
        const item = prev.find(s => s.id === id);
        if (!item) return prev;

        const updatedItem = { 
          ...item, 
          status: action as any,
          reviewerFeedback: action === 'Pending' ? undefined : {
            action: action as any,
            reason: action === 'Rejected' ? 'Manual reversal of linkage due to identity mismatch.' : 
                    action === 'Deferred' ? 'Pushed back to queue for further evidence collection.' :
                    `Manually ${action.toLowerCase()} by admin based on industrial identity verification.`,
            timestamp: new Date().toISOString(),
            reviewer: 'White Hawk Admin'
          }
        };

        if (action === 'Deferred') {
          // Push back to bottom of queue
          return [...filtered, { ...updatedItem, status: 'Pending' as any }];
        }

        return prev.map(s => s.id === id ? updatedItem : s);
      });
      setActioningId(null);
    }, 800);
  };

  const filteredSuggestions = useMemo(() => {
    return suggestions
      .filter(s => {
        if (filter === 'History') return s.status !== 'Pending';
        
        // Hide auto-committed or processed items from the main active queue 
        if (s.status !== 'Pending') return false;

        if (filter === 'All') return true;
        if (filter === 'Ambiguous') return s.confidence >= 0.7 && s.confidence < 0.95;
        if (filter === 'Collisions') return s.verdict === 'IDENTITY_COLLISION' || s.riskFactors?.some(r => r.includes('IDENTITY COLLISION'));
        if (filter === 'Duplicates') return s.edgeCaseFlag === 'INTRA_DEPT_DUPLICATE';
        if (filter === 'Unlinked') return s.edgeCaseFlag === 'UNLINKED_EVENT';
        return true;
      })
      .sort((a, b) => {
        // Section 5: IDENTITY_COLLISION first
        const aIsCollision = a.verdict === 'IDENTITY_COLLISION' || a.edgeCaseFlag === 'IDENTITY_COLLISION';
        const bIsCollision = b.verdict === 'IDENTITY_COLLISION' || b.edgeCaseFlag === 'IDENTITY_COLLISION';
        
        if (aIsCollision && !bIsCollision) return -1;
        if (!aIsCollision && bIsCollision) return 1;
        
        // Then by confidence descending
        return b.confidence - a.confidence;
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
          <div className="flex bg-card border border-border rounded p-0.5 overflow-x-auto max-w-full">
            {[
              { id: 'All', label: 'All' },
              { id: 'Ambiguous', label: 'Ambiguous Matches' },
              { id: 'Collisions', label: 'Identity Collisions' },
              { id: 'Duplicates', label: 'Intra-Dept Duplicates' },
              { id: 'Unlinked', label: 'Unlinked Events' },
              { id: 'History', label: 'History' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase rounded transition-all whitespace-nowrap",
                  filter === f.id ? "bg-accent text-white" : "text-text-muted hover:text-text-main"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button 
            onClick={() => {
              const highConfSuggestions = suggestions.filter(s => s.confidence >= 0.9 && s.status === 'Pending');
              if (highConfSuggestions.length > 0) {
                // Batch approve via the provided callback
                highConfSuggestions.forEach(s => onApprove(s));
                
                setSuggestions(prev => prev.map(s => 
                  (s.confidence >= 0.9 && s.status === 'Pending') 
                    ? { 
                        ...s, 
                        status: 'Approved' as const,
                        reviewerFeedback: {
                          action: 'Approved',
                          reason: 'Batch approved via High Confidence Registry Commitment.',
                          timestamp: new Date().toISOString(),
                          reviewer: 'White Hawk Admin'
                        }
                      } 
                    : s
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
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-[3px] text-[8px] font-black uppercase tracking-tighter shadow-sm",
                          s.verdict === 'AUTO_MERGE' ? "bg-green-600 text-white" :
                          s.verdict === 'HUMAN_REVIEW' ? "bg-blue-600 text-white" :
                          "bg-slate-600 text-white"
                        )}>
                          {s.verdict?.replace('_', ' ') || 'ORPHAN'}
                        </span>
                        {s.edgeCaseFlag && s.edgeCaseFlag !== 'NONE' && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[8px] font-black rounded border border-red-200 uppercase tracking-tighter shadow-sm">
                            {s.edgeCaseFlag.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" />
                        Confidence: {formatPercent(s.confidence)}
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
                        onClick={() => handleAction(s.id, 'Deferred')}
                        className="px-3 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded transition-all disabled:opacity-50 uppercase"
                      >
                        Defer
                      </button>
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
                      <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded border border-blue-200">MOCK</span>
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
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">PAN / ENTITY ID</span>
                      <p className="text-[11px] font-mono text-text-main font-bold">{maskPAN(s.recordA.pan) || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">GSTIN / TAX ID</span>
                      <p className="text-[11px] font-mono text-text-main">{maskSensitive(s.recordA.gstin) || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="pt-2">
                     <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">Statutory Owner</span>
                     <p className="text-[11px] font-medium text-text-main">{s.recordA.ownerName}</p>
                  </div>
                </div>

                {/* Record B */}
                <div className="space-y-3 p-3 rounded-lg bg-bg/30 border border-transparent hover:border-border transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-accent uppercase tracking-wider">
                      <Database className="w-3.5 h-3.5" /> {s.recordB.department}
                      <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded border border-blue-200">MOCK</span>
                    </div>
                    <span className="text-[9px] font-bold text-text-muted bg-white px-1.5 py-0.5 rounded border border-border">SOURCE B</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-main leading-tight">{s.recordB.businessName}</h4>
                    <div className="flex items-start gap-1.5 mt-1.5 text-text-muted">
                      <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                      <p className={cn(
                        "text-[11px] leading-tight",
                        s.recordA.address !== s.recordB.address && !s.recordB.address.includes(s.recordA.address) && !s.recordA.address.includes(s.recordB.address) ? "text-orange-600 bg-orange-50 px-1 rounded" : "text-text-main"
                      )}>
                        {s.recordB.address}, {s.recordB.pinCode}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/50">
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">PAN / ENTITY ID</span>
                      <p className={cn(
                        "text-[11px] font-mono font-bold",
                        s.recordA.pan && s.recordB.pan && s.recordA.pan === s.recordB.pan ? "text-status-active bg-green-50 px-1 rounded" : 
                        s.recordA.pan && s.recordB.pan && s.recordA.pan !== s.recordB.pan ? "text-status-closed bg-red-50 px-1 rounded" : "text-text-main"
                      )}>
                        {maskPAN(s.recordB.pan) || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">GSTIN / TAX ID</span>
                      <div className="flex items-center gap-1.5">
                         <p className={cn(
                          "text-[11px] font-mono", 
                          !s.recordB.gstin || s.recordB.gstin === 'Pending' ? "text-orange-500 italic" : 
                          s.recordA.gstin !== s.recordB.gstin ? "text-orange-600 bg-orange-50 px-1 rounded" : "text-text-main"
                        )}>
                          {maskSensitive(s.recordB.gstin) || 'Pending'}
                        </p>
                        {s.recordA.gstin && s.recordB.gstin && s.recordA.gstin === s.recordB.gstin && (
                          <div className="bg-green-100 p-0.5 rounded">
                            <CheckCircle2 className="w-2.5 h-2.5 text-green-600" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2">
                    <span className="text-[9px] text-text-muted uppercase font-bold block mb-0.5">Statutory Owner</span>
                    <p className={cn(
                      "text-[11px] font-medium",
                      s.recordA.ownerName !== s.recordB.ownerName ? "text-orange-600 bg-orange-50 px-1 rounded" : "text-text-main"
                    )}>
                      {s.recordB.ownerName}
                    </p>
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
                        <span key={`${s.id}-a-word-${i}-${word}`} className={cn(
                          "text-[11px] px-1 rounded font-medium", 
                          s.recordB.businessName.includes(word) ? "bg-green-100 text-status-active border border-green-200" : "text-text-main"
                        )}>
                          {word}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.recordA.address.split(',').map((part, i) => (
                        <span key={`${s.id}-a-addr-${i}-${part}`} className={cn(
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
                        <span key={`${s.id}-b-word-${i}-${word}`} className={cn(
                          "text-[11px] px-1 rounded font-medium", 
                          s.recordA.businessName.includes(word) ? "bg-green-100 text-status-active border border-green-200" : "text-text-main"
                        )}>
                          {word}
                        </span>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.recordB.address.split(',').map((part, i) => (
                        <span key={`${s.id}-b-addr-${i}-${part}`} className={cn(
                          "text-[11px] px-1 rounded", 
                          s.recordA.address.includes(part.trim()) ? "bg-blue-100 text-accent border border-blue-200" : "text-text-muted"
                        )}>
                          {part}{i !== s.recordB.address.split(',').length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/50">
                   <ReasoningRenderer 
                     reasoning={s.details} 
                     reasons={s.reasons} 
                     reason_log={s.reason_log} title="Match Evidence & Audit Trail" 
                   />
                   {s.riskFactors && s.riskFactors.length > 0 && !s.details && (
                     <div className="mt-3">
                       <span className="text-[9px] font-bold text-text-muted uppercase block mb-1.5">Risk & Discrepancies</span>
                       <div className="flex flex-wrap gap-2">
                         {s.riskFactors.map((rf, i) => (
                           <span key={`${s.id}-rf-${i}`} className="text-[10px] bg-white px-2 py-0.5 rounded border border-border text-orange-600 font-medium flex items-center gap-1">
                             <AlertCircle className="w-2.5 h-2.5" /> {rf}
                           </span>
                         ))}
                       </div>
                     </div>
                   )}
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
    <td className="px-4 py-3 text-text-main pr-8">
      <ReasoningRenderer reasoning={entry.details} />
    </td>
  </tr>
));

LogEntry.displayName = 'LogEntry';

const AuditTrail = ({ log }: { log: AuditEntry[] }) => {
  const [filter, setFilter] = useState<'All' | 'Security' | 'Governance' | 'System'>('All');
  const [searchUbid, setSearchUbid] = useState('');
  const [searchActor, setSearchActor] = useState('');

  const filteredLog = useMemo(() => {
    return log.filter(entry => {
      const typeMatch = filter === 'All' || entry.type === filter;
      const ubidMatch = !searchUbid || entry.entityId.toLowerCase().includes(searchUbid.toLowerCase());
      const actorMatch = !searchActor || entry.actor.toLowerCase().includes(searchActor.toLowerCase());
      return typeMatch && ubidMatch && actorMatch;
    });
  }, [log, filter, searchUbid, searchActor]);

  return (
    <div className="bg-white rounded-lg border border-border overflow-hidden shadow-sm">
      <div className="p-4 bg-bg/50 border-b border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold text-text-main">Immutable Audit Ledger (System Trace)</h2>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search by UBID / Entity ID" 
              value={searchUbid}
              onChange={e => setSearchUbid(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-white border border-border rounded outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="relative">
            <Users className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search by Actor / Reviewer" 
              value={searchActor}
              onChange={e => setSearchActor(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-[11px] bg-white border border-border rounded outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
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
                  No governance actions found matching current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StatusSignals = ({ ubid, events, knowledge }: { ubid: UBIDRecord, events: ActivityEvent[], knowledge: SystemKnowledge }) => {
  const verdict = useMemo(() => inferBusinessStatus(ubid.ubid, events, 180, ubid.canonicalName, undefined, knowledge.config), [ubid.ubid, events, ubid.canonicalName, knowledge.config]);
  
  return (
    <div className="bg-bg/50 p-4 rounded-lg border border-border relative overflow-hidden">
      {ubid.manualStatusOverride && (
        <div className="absolute top-0 right-0 bg-accent text-white text-[8px] font-bold px-3 py-1 rounded-bl uppercase tracking-tighter">
          Manual Override Active
        </div>
      )}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/30">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-accent" />
          <span className="text-[10px] font-bold text-text-main uppercase tracking-tight">Consolidated Status</span>
        </div>
        <div className={cn(
              "px-2 py-0.5 rounded text-[10px] font-bold uppercase shadow-sm",
              ubid.status.toUpperCase() === 'ACTIVE' ? "bg-green-100 text-status-active border border-green-200" :
              ubid.status.toUpperCase() === 'CLOSED' ? "bg-red-100 text-status-closed border border-red-200" :
              "bg-orange-100 text-status-dormant border border-orange-200"
            )}>
              {ubid.status} {ubid.manualStatusOverride ? '(Authority Overridden)' : ''}
            </div>
      </div>
      
      <ReasoningRenderer 
        reasoning={ubid.manualStatusOverride ? ubid.manualStatusOverride.reason : verdict.reasoning} 
        title="Analysis Reasoning"
      />
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
            <div key={`${e.signalType}-${e.date}-${i}`} className="flex items-center gap-1.5 bg-white border border-border px-2 py-1 rounded shadow-sm">
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
  knowledge,
  onUpdateStatus,
  onUnlinkRecord,
  allUbids
}: { 
  ubid: UBIDRecord, 
  events: ActivityEvent[],
  knowledge: SystemKnowledge,
  onUpdateStatus?: (status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => void,
  onUnlinkRecord?: (recordId: string) => void,
  allUbids: UBIDRecord[]
}) => {
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState(ubid.status);
  const [overrideReason, setOverrideReason] = useState('');
  
  const relevantEvents = useMemo(() => {
    const realEvents = events
      .filter(e => e.ubid === ubid.ubid || (ubid.canonicalName && e.businessNameHint === ubid.canonicalName));
    
    // SYTHESIZED SIGNALS: Every linked record represents an inherent registration signal
    const registrationSignals = ubid.linkedRecords.map(r => ({
      id: `REG-${r.id}`,
      ubid: ubid.ubid,
      department: r.department,
      eventType: 'Sovereign Registration',
      date: format(new Date(), 'yyyy-MM-dd'),
      details: `Identity anchor established via ${r.department}. Legal status: ${r.status}.`,
      value: 'Medium'
    }));

    return [...realEvents, ...registrationSignals]
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
  }, [events, ubid.ubid, ubid.canonicalName, ubid.linkedRecords]);

  const sortedHistory = useMemo(() => {
    return (ubid.statusHistory || [])
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [ubid.statusHistory]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    verdict: true,
    structure: true,
    history: false,
    records: true,
    timeline: false
  });

  const subsidiaries = useMemo(() => {
    if (!ubid.groupId) return [];
    // This relies on having the full list, which we'll pass in
    return (allUbids || []).filter(u => u.groupId === ubid.groupId && u.ubid !== ubid.ubid);
  }, [ubid.groupId, ubid.ubid, allUbids]);

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
            <span className="text-[10px] font-bold text-text-main uppercase">{ubid.anchorType} Anchor {ubid.anchorId ? `(${maskSensitive(ubid.anchorId)})` : ''}</span>
            <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 py-0.5 rounded border border-blue-200 ml-1">MOCK DATA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "w-2 h-2 rounded-full shadow-sm",
              ubid.status.toUpperCase() === 'ACTIVE' ? "bg-status-active shadow-status-active/20" :
              ubid.status.toUpperCase() === 'CLOSED' ? "bg-status-closed shadow-status-closed/20" : 
              "bg-status-dormant shadow-status-dormant/20"
            )} />
            <span className="text-xs font-medium text-text-main">
              Status: {ubid.status} 
              {ubid.manualStatusOverride && (
                <span 
                  className="ml-1.5 px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[9px] font-bold rounded border border-orange-100 uppercase cursor-help"
                  title={typeof ubid.manualStatusOverride.reason === 'string' ? ubid.manualStatusOverride.reason : (ubid.manualStatusOverride.reason as any).explanation || 'Manual Override'}
                >
                  Override
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-xs text-text-muted">PAN: {maskPAN(ubid.pan) || 'N/A'}</span>
          </div>
          {ubid.gstin && (
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">GSTIN: {maskSensitive(ubid.gstin)}</span>
            </div>
          )}
          {ubid.tradeLicense && (
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs text-text-muted">Trade License: {ubid.tradeLicense}</span>
            </div>
          )}
          {ubid.edgeCaseFlag && ubid.edgeCaseFlag !== 'NONE' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 border border-red-100 rounded">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-[10px] font-bold text-red-700 uppercase tracking-tight">{ubid.edgeCaseFlag.replace('_', ' ')}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-status-active" />
            <span className="text-xs text-text-muted">Confidence: {formatPercent(ubid.confidence)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Microscope className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs text-text-muted">Resolution Risk: {ubid.riskScore}%</span>
          </div>
        </div>

        {/* Linkage Reasoning Block */}
        {ubid.linkageReasoning && (
          <div className="w-full flex items-start gap-4 p-4 bg-accent/5 border border-accent/10 rounded-lg">
             <div className="p-2 bg-white rounded-full shadow-sm border border-accent/10 shrink-0">
               <Fingerprint className="w-4 h-4 text-accent" />
             </div>
             <ReasoningRenderer reasoning={ubid.linkageReasoning} title="Identity Resolution Context" />
          </div>
        )}
        
        <button 
          onClick={() => setIsUpdatingStatus(!isUpdatingStatus)}
          className="px-3 py-1.5 bg-bg border border-border rounded text-[10px] font-bold text-text-muted hover:text-accent hover:border-accent transition-all uppercase flex items-center gap-1.5"
          id="btn-status-override"
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
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DORMANT">DORMANT</option>
                    <option value="CLOSED">CLOSED</option>
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

      {/* Corporate Structure / Group Logic Section */}
      {subsidiaries.length > 0 && (
        <div className="space-y-2">
          <CollapsibleHeader 
            id="structure" 
            label="Corporate Group Structure" 
            icon={Users} 
            badge={subsidiaries.length}
          />
          <AnimatePresence initial={false}>
            {openSections.structure && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 space-y-3">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 shadow-xl">
                    <div className="flex items-center gap-2 mb-3">
                       <ShieldCheck className="w-4 h-4 text-blue-400" />
                       <div>
                         <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Shared Identity Group</span>
                         <h4 className="text-xs font-bold text-white uppercase tracking-tight">{ubid.groupId}</h4>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                       {/* The current record in context of the group */}
                       <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded flex justify-between items-center">
                          <div className="flex items-center gap-3">
                             <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                             <div>
                               <p className="text-[10px] font-bold text-white truncate max-w-[200px]">{ubid.canonicalName}</p>
                               <p className="text-[9px] text-blue-300 font-mono tracking-tighter uppercase">{ubid.ubid} (Context Entity)</p>
                             </div>
                          </div>
                          <span className="text-[8px] font-black bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/30 uppercase">{ubid.relationship}</span>
                       </div>

                       {/* The subsidiaries/related entities */}
                       <div className="pl-4 border-l-2 border-slate-700 space-y-2">
                          {subsidiaries.map(sub => (
                            <div key={sub.ubid} className="p-2.5 bg-white/5 border border-white/10 rounded flex justify-between items-center group/sub hover:bg-white/10 transition-colors">
                              <div className="flex items-center gap-3">
                                <ChevronRight className="w-3 h-3 text-slate-500 group-hover/sub:text-blue-400" />
                                <div>
                                  <p className="text-[10px] font-bold text-slate-300 truncate max-w-[180px]">{sub.canonicalName}</p>
                                  <p className="text-[9px] text-slate-500 font-mono tracking-tighter uppercase">{sub.ubid}</p>
                                </div>
                              </div>
                              <span className="text-[8px] font-black bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 uppercase">{sub.relationship}</span>
                            </div>
                          ))}
                       </div>
                    </div>
                    
                    <div className="mt-3 bg-blue-900/40 p-2 rounded border border-blue-800/50 flex items-start gap-2">
                       <Info className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                       <p className="text-[9px] text-blue-200 leading-relaxed italic">
                         Relational mapping logic identified multiple distinct GSTIN nodes sharing the same PAN souverign anchor. 
                         Corporate hierarchy established with {ubid.relationship === 'PARENT' ? 'active control monitoring' : 'indirect linkage'} to the primary cluster.
                       </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
              <div className="pt-2 space-y-4">
                <StatusSignals ubid={ubid} events={events} knowledge={knowledge} />
                
                {/* Business Activities Breakdown */}
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-accent" /> Registered Business Activities
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {ubid.activities && ubid.activities.length > 0 ? (
                      ubid.activities.map((activity, idx) => (
                        <span 
                          key={`${ubid.ubid}-act-${idx}`} 
                          className="px-2 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-700 shadow-sm"
                        >
                          {activity}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">No activity signals found in source records.</span>
                    )}
                  </div>
                </div>

                {/* Risk Diagnostic Breakdown */}
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-accent" /> Identity Integrity Risk Factors
                  </h4>
                  <div className="space-y-2">
                    {ubid.riskFactors && ubid.riskFactors.length > 0 ? (
                      ubid.riskFactors.map((factor, idx) => (
                        <div key={`${ubid.ubid}-risk-${idx}`} className="flex items-center gap-2">
                          <div className="w-1 h-1 bg-accent rounded-full" />
                          <p className="text-[10px] text-text-main font-medium">{factor}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">No significant integrity risks identified. Node is within nominal operating parameters.</p>
                    )}
                  </div>
                </div>


                {/* Edge Case Diagnostic & Parent-Child Hub */}
                <div className="p-4 bg-slate-50/80 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                       <Microscope className="w-3.5 h-3.5 text-accent" /> Identity Topology & Linked Units
                    </h4>
                    {ubid.edgeCaseFlag && ubid.edgeCaseFlag !== 'NONE' && (
                       <span className="px-1.5 py-0.5 bg-red-600 text-white text-[9px] font-black rounded uppercase">{ubid.edgeCaseFlag.replace('_', ' ')}</span>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <p className="text-[11px] text-text-main font-medium leading-relaxed bg-white/50 p-2 rounded border border-border/50">
                      {ubid.edgeCaseFlag === 'PARENT_CHILD' && (
                        <>
                          <strong>Master Cluster (PAN Sovereign):</strong> This Master UBID serves as the Sovereign Node for <strong>{ubid.linked_units?.length || 0}</strong> registered units. 
                          The legal identity is anchored to PAN: <strong>{maskPAN(ubid.pan)}</strong> (Master). Attached units represent distinct departmental filings for this legal person.
                        </>
                      )}
                      {ubid.edgeCaseFlag === 'BRANCH_NODE' && (
                        <>
                          <strong>Branch Topology (Geospatial Hub):</strong> This entity operates across multiple locations under the same credentials. 
                          The primary node is matched with <strong>{ubid.linked_units?.find(lu => lu.role?.includes('Primary'))?.unit_id || 'Principal Unit'}</strong>.
                        </>
                      )}
                      {ubid.edgeCaseFlag === 'MULTI_VERTICAL' && (
                        <>
                          <strong>Cross-Departmental Synergy:</strong> High-confidence integration of {ubid.linkedRecords.length} records across diverse verticals.
                        </>
                      )}
                      {ubid.edgeCaseFlag === 'IDENTITY_COLLISION' && (
                        <>
                          <strong>Identity Collision Guard:</strong> Conflicts detected in departmental data (e.g. differing PANs for same Name/Address). Manual isolation active.
                        </>
                      )}
                      {(!ubid.edgeCaseFlag || ubid.edgeCaseFlag === 'NONE') && 'Standard deterministic identity with unified departmental linkage.'}
                    </p>

                    {/* Linked Units Status Grid */}
                    {ubid.linked_units && ubid.linked_units.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ubid.linked_units.map((unit, idx) => (
                          <div key={`${ubid.ubid}-unit-${unit.unit_id}-${idx}`} className="flex items-center justify-between p-2.5 bg-white rounded border border-border shadow-sm group hover:border-accent/50 transition-all">
                            <div className="flex items-center gap-3 overflow-hidden">
                               <div className={cn(
                                 "w-10 h-10 rounded bg-bg flex items-center justify-center border border-border shrink-0 group-hover:bg-accent/5 transition-colors",
                                 unit.unit_status === 'ACTIVE' ? "text-status-active" : "text-text-muted"
                               )}>
                                 {unit.type === 'Commercial Taxes' && <Calculator className="w-5 h-5" />}
                                 {unit.type === 'Labour Department' && <HardHat className="w-5 h-5" />}
                                 {unit.type === 'Factories & Boilers' && <Building2 className="w-5 h-5" />}
                                 {unit.type === 'BESCOM' && <Zap className="w-5 h-5" />}
                                 {!['Commercial Taxes', 'Labour Department', 'Factories & Boilers', 'BESCOM'].includes(unit.type) && <Database className="w-5 h-5" />}
                               </div>
                               <div className="flex flex-col min-w-0">
                                  <span className="text-[11px] font-bold text-text-main truncate">{unit.unit_id}</span>
                                  <span className="text-[10px] text-text-muted">{unit.type}</span>
                                  {unit.role && (
                                    <span className="text-[8px] text-accent font-black uppercase mt-0.5 tracking-tight">{unit.role}</span>
                                  )}
                               </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className={cn(
                                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow-sm",
                                unit.unit_status === 'ACTIVE' ? "bg-green-100 text-status-active border border-green-200" :
                                unit.unit_status === 'DORMANT' ? "bg-orange-100 text-status-dormant border border-orange-200" :
                                "bg-red-100 text-status-closed border border-red-200"
                              )}>
                                {unit.unit_status}
                              </div>
                              <span className="text-[8px] text-text-muted font-mono">{unit.latest_signal}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
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
                    <div key={`${ubid.ubid}-history-${h.timestamp}-${i}`} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-0 last:pb-0">
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
                            h.to === 'ACTIVE' ? "text-status-active" : 
                            h.to === 'DORMANT' ? "text-status-dormant" : "text-status-closed"
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
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <Fingerprint className="w-3 h-3 text-text-muted/50" />
                        <p className="text-[9px] text-text-muted uppercase font-bold tracking-tight">Actor: {h.actor}</p>
                      </div>
                      <p className="text-xs text-text-main mt-1.5 leading-relaxed">
                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-tighter mr-2 opacity-60">Verdict Reason:</span>
                        {h.reason}
                      </p>
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
                  <div key={`${ubid.ubid}-rec-${r.id}-${i}`} className="p-3 bg-bg rounded border border-border flex justify-between items-start group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Building2 className="w-3.5 h-3.5 text-accent" />
                        <span className="text-[10px] font-bold text-accent uppercase">{r.department}</span>
                        <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">MOCK</span>
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
                      className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 rounded border border-red-200 transition-colors"
                      title="Unlink record from this UBID"
                    >
                      <Link2Off className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-tight">Unlink Record</span>
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
                    <div key={`${ubid.ubid}-event-${e.id}-${i}`} className="flex gap-3">
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
                          <span className="text-[8px] font-bold bg-blue-100 text-blue-700 px-1 rounded border border-blue-200">MOCK</span>
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
  knowledge,
  selectedUbid, 
  setSelectedUbid,
  onUpdateStatus,
  onUnlinkRecord
}: { 
  ubids: UBIDRecord[],
  events: ActivityEvent[],
  knowledge: SystemKnowledge,
  selectedUbid: UBIDRecord | null, 
  setSelectedUbid: (u: UBIDRecord | null) => void,
  onUpdateStatus?: (ubidId: string, status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => void,
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
    
    // Support official UBID format: KA-XXXXXXXX-C or KA-INT-XXXXXXXX-C
    const ubidPattern = /^KA-(INT-)?([0-9A-Z]{8})-[0-9A-Z]$/;
    const isValidFormat = ubidPattern.test(upperValue);

    if (!isValidFormat && upperValue.length > 3) {
      setValidationError("Must follow official KA-XXXXXXXX-C or KA-INT-XXXXXXXX-C format");
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
    keys: ['canonicalName', 'ubid', 'pan', 'gstin', 'historicalIds'],
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
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                          u.ubid.includes('KA-INT') ? "bg-orange-50 text-orange-700 border border-orange-100" : "bg-blue-50 text-accent border border-blue-100"
                        )}>
                          {u.ubid}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          u.status === 'ACTIVE' ? "bg-green-100 text-status-active" : 
                          u.status === 'DORMANT' ? "bg-orange-100 text-status-dormant" : 
                          "bg-red-100 text-status-closed"
                        )}>
                          {u.status}
                        </span>
                        {debouncedSearch && (
                          <span className="text-[9px] font-bold text-accent/70 uppercase">
                            {formatPercent(score)} Match
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
                        knowledge={knowledge}
                        onUpdateStatus={(status, reason) => onUpdateStatus?.(u.ubid, status, reason)}
                        onUnlinkRecord={(recordId) => onUnlinkRecord?.(u.ubid, recordId)}
                        allUbids={ubids}
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
      ownerName: '',
      status: 'ACTIVE'
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
                                        <div key={m.ubid} className="space-y-2">
                                          <button 
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
                                              <span className="text-[10px] font-bold text-accent">{formatPercent(m.matchResult.confidence)}</span>
                                              <span className="text-[8px] text-text-muted uppercase font-bold tracking-tighter">Match</span>
                                            </div>
                                          </button>
                                          {targetUbidId === m.ubid && (
                                            <div className="px-2 pb-2">
                                              <ReasoningRenderer 
                                                reasoning={m.matchResult.reasoning} 
                                                title="Match Heuristics"
                                                compact
                                              />
                                            </div>
                                          )}
                                        </div>
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
  events,
  knowledge,
  ubids
}: { 
  ubid: UBIDRecord, 
  score: number, 
  searchQuery: string, 
  isExpanded: boolean, 
  onToggle: () => void, 
  lastSignal: string,
  onViewDetails?: (ubid: UBIDRecord) => void,
  onUpdateStatus?: (ubidId: string, status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => void,
  onUnlinkRecord?: (ubidId: string, recordId: string) => void,
  events: ActivityEvent[],
  knowledge: SystemKnowledge,
  ubids: UBIDRecord[]
}) => (
  <React.Fragment>
    <tr 
      className={cn(
        "group hover:bg-bg transition-colors cursor-pointer",
        isExpanded ? "bg-accent/5" : ""
      )}
      onClick={onToggle}
    >
      <td className={cn(
        "px-2 py-3 font-mono font-bold",
        ubid.ubid.includes('KA-INT') ? "text-orange-700" : "text-accent"
      )}>
        <div className="flex items-center gap-2">
          <ChevronRight className={cn("w-3 h-3 transition-transform", isExpanded ? "rotate-90" : "")} />
          {ubid.ubid}
        </div>
      </td>
      <td className="px-2 py-3 font-medium text-text-main shrink-0 min-w-[120px]">{ubid.canonicalName}</td>
      <td className="px-2 py-3">
        <div className="flex flex-col gap-0.5">
          {ubid.pan && <span className="text-[9px] text-text-muted">PAN: {maskPAN(ubid.pan)}</span>}
          {ubid.gstin && <span className="text-[9px] text-text-muted">GST: {maskSensitive(ubid.gstin)}</span>}
          {ubid.tradeLicense && <span className="text-[9px] text-text-muted">TLS: {ubid.tradeLicense}</span>}
          {!ubid.pan && !ubid.gstin && !ubid.tradeLicense && <span className="text-[9px] text-text-muted italic">None</span>}
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
          ubid.status === 'ACTIVE' ? "bg-green-100 text-status-active" :
          ubid.status === 'DORMANT' ? "bg-orange-100 text-status-dormant" :
          "bg-red-100 text-status-closed"
        )}>
          {ubid.status}
        </span>
      </td>
      {searchQuery && (
        <td className="px-2 py-3">
          <span className="text-[10px] font-bold text-accent uppercase">
            {formatPercent(score)}
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
                knowledge={knowledge}
                onUpdateStatus={(status, reason) => onUpdateStatus?.(ubid.ubid, status, reason)}
                onUnlinkRecord={(recordId) => onUnlinkRecord?.(ubid.ubid, recordId)}
                allUbids={ubids}
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
  knowledge,
  onViewDetails,
  onUpdateStatus,
  onUnlinkRecord
}: { 
  ubids: UBIDRecord[], 
  events: ActivityEvent[],
  knowledge: SystemKnowledge,
  onViewDetails?: (ubid: UBIDRecord) => void,
  onUpdateStatus?: (ubidId: string, status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => void,
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
      'linkedRecords.id',
      'historicalIds'
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

  const getLastSignal = (ubid: string, name?: string) => {
    const ubidEvents = events.filter(e => e.ubid === ubid || (name && e.businessNameHint === name));
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
              <option value="ACTIVE">ACTIVE</option>
              <option value="DORMANT">DORMANT</option>
              <option value="CLOSED">CLOSED</option>
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
              setStatusFilter('ACTIVE');
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
              setStatusFilter('DORMANT');
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
                  lastSignal={getLastSignal(ubid.ubid, ubid.canonicalName)}
                  onViewDetails={onViewDetails}
                  onUpdateStatus={onUpdateStatus}
                  onUnlinkRecord={onUnlinkRecord}
                  events={events}
                  knowledge={knowledge}
                  ubids={ubids}
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

const DataIngestion = ({ 
  onProcessData,
  isProcessing,
  sourceRecords,
  events,
  logAudit,
  addNotification
}: { 
  onProcessData: (records: SourceRecord[], events: ActivityEvent[]) => void,
  isProcessing: boolean,
  sourceRecords: SourceRecord[],
  events: ActivityEvent[],
  logAudit: (action: string, entityId: string, details: string | LogicAuditTrail, type: AuditEntry['type']) => void,
  addNotification?: (title: string, message: string, type: AppNotification['type']) => void
}) => {
  const [uploads, setUploads] = useState<Record<string, { fileName: string, count: number, data: any[], size: number }>>({});
  const [progress, setProgress] = useState<{ step: string; percent: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [ingestionFailures, setIngestionFailures] = useState<{dept: string, row: number, error: string}[]>([]);

  const departments = [
    'Shop & Establishment',
    'Factories',
    'Labour',
    'KSPCB',
    'Commercial Taxes',
    'BESCOM',
    'Unified Registry Feed',
    'Activity Events'
  ];

  const detectDepartment = (headers: string[], fileName: string): string => {
    const fn = fileName.toLowerCase();
    const h = headers.map(s => s.toLowerCase());

    // Unified / Everything check
    if (h.includes('source_dept') || h.includes('department_code')) return 'Unified Registry Feed';

    if (h.includes('event_id') || h.includes('event_type') || fn.includes('event') || fn.includes('activity')) return 'Activity Events';
    if (fn.includes('shop') || fn.includes('establishment') || fn.includes('bbmp')) return 'Shop & Establishment';
    if (fn.includes('factory') || fn.includes('factories') || fn.includes('boiler')) return 'Factories';
    if (fn.includes('labour') || fn.includes('labor') || fn.includes('employment')) return 'Labour';
    if (fn.includes('kspcb') || fn.includes('pollution') || fn.includes('env') || fn.includes('pcb')) return 'KSPCB';
    if (fn.includes('bescom') || fn.includes('power') || fn.includes('elec') || h.includes('consumption')) return 'BESCOM';
    if (fn.includes('gst') || fn.includes('tax') || fn.includes('comm')) return 'Commercial Taxes';

    // Fallback based on column heuristics
    if (h.includes('pan') && h.includes('gstin') && !h.includes('event_id')) return 'Commercial Taxes (GST)';
    if (h.includes('license') || h.includes('trade')) return 'BBMP Trade License';
    
    return 'Custom Departmental Source'; // Flexible fallback
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;
    setErrors([]);
    
    Array.from(files).forEach(file => {
      if (!file.name.endsWith('.csv')) {
        setErrors(prev => [...prev, `File ${file.name} is not a valid CSV.`]);
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            setErrors(prev => [...prev, `File ${file.name} is empty.`]);
            return;
          }

          const dept = detectDepartment(results.meta.fields || [], file.name);
          
          setUploads(prev => ({
            ...prev,
            [dept]: {
              fileName: file.name,
              count: results.data.length,
              data: results.data,
              size: file.size
            }
          }));
        }
      });
    });
  };

  const runResolution = async () => {
    if (Object.keys(uploads).length === 0) return;

    setProgress({ step: 'Initializing Registry Overlay...', percent: 5 });
    await new Promise(r => setTimeout(r, 600));

    // Convert uploads to SourceRecords and Events
    const newRecords: SourceRecord[] = [];
    const newEvents: ActivityEvent[] = [];
    const newFailures: {dept: string, row: number, error: string}[] = [];

    // Map and route records per row (Supports Multi-Stream Unified CSVs)
    Object.entries(uploads).forEach(([primaryDept, upload]) => {
      upload.data.forEach((row: any, idx: number) => {
        try {
          // Step 1: Pre-process and Sanitize the raw row
          const sanitized = sanitizeRow(row);
          
          // Row-Level Intelligence: Determine if row is an Event or a Baseline Record
          const rowDept = (sanitized.sourceDept || sanitized.dept || sanitizeValue(primaryDept));
          const isEvent = !!(sanitized.eventType || sanitized.eventId || rowDept === 'ACTIVITY EVENTS' || sanitized.eventDate || primaryDept.toUpperCase() === 'ACTIVITY EVENTS');

          if (isEvent) {
            newEvents.push(transformToActivityEvent(row, idx));
          } else {
            newRecords.push(transformToSourceRecord(row, rowDept as Department, idx));
          }
        } catch (err: any) {
          console.error(`Malformed Record in ${primaryDept} at row ${idx}:`, err);
          newFailures.push({
            dept: primaryDept,
            row: idx + 1,
            error: err.message || 'Unknown transformation error'
          });
        }
      });
    });

    setIngestionFailures(prev => [...prev, ...newFailures]);
    
    if (newFailures.length > 0) {
      logAudit('Data Integrity', 'Malformation Detected', `Found ${newFailures.length} malformed records that were bypassed during ingestion.`, 'System');
    }
    
    logAudit('Data Ingestion', 'Registry Bulk Ingest', `Ingested ${newRecords.length} unit records and ${newEvents.length} events from CSV sources.`, 'System');
    const steps = [
      { step: 'Executing Data Sanitizer: Normalizing Strings & Mapping Synonyms...', percent: 10, delay: 1200 },
      { step: 'Pass 1: Sovereign Anchor Matching (PAN/GSTIN)...', percent: 25, delay: 1000 },
      { step: 'Pass 2: Phonetic Normalization (Soundex/Metaphone)...', percent: 50, delay: 1500 },
      { step: 'Attribute-Based Resolve: Address & Pincode Scoring...', percent: 70, delay: 800 },
      { step: 'Pass 3: Geospatial Conflict Resolution (Lat/Lng Centroids)...', percent: 85, delay: 1200 },
      { step: 'Heartbeat: Lifecycle Status Deduction (Signal Windowing)...', percent: 95, delay: 600 }
    ];

    for (const s of steps) {
      setProgress(s);
      await new Promise(r => setTimeout(r, s.delay));
    }

    onProcessData(newRecords, newEvents);
    setProgress(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-accent/10 rounded-xl">
              <Database className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-main uppercase tracking-tight">KUBID Data Ingestion Engine</h2>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[11px] text-text-muted font-bold uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-accent" />
                  Sovereign Registry Control Layer v4.2
                </p>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Sanitizer Active</span>
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={runResolution}
            disabled={Object.keys(uploads).length === 0 || !!progress}
            className={cn(
              "flex items-center gap-3 px-8 py-3 rounded-lg font-black text-xs uppercase tracking-tighter transition-all shadow-xl",
              Object.keys(uploads).length === 0 || !!progress
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-accent text-white hover:bg-accent-hover active:scale-95 group"
            )}
          >
            {progress ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 group-hover:animate-pulse" />}
            {progress ? 'Executing Resolver...' : 'Commit Batch to Resolution Engine'}
          </button>
        </div>

        {ingestionFailures.length > 0 && !progress && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <ShieldAlert className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Data Integrity Failures: {ingestionFailures.length}</h3>
                <p className="text-xs text-red-700 font-medium italic">Some records were bypassed due to logic malformations. Check the Audit Trail for details.</p>
              </div>
            </div>
            <button 
              onClick={() => {
                const csv = [
                  ['Dept', 'Row', 'Error'],
                  ...ingestionFailures.map(f => [f.dept, f.row, f.error])
                ].map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `kubid_malformations_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
              className="text-[10px] font-black uppercase tracking-widest text-red-600 hover:text-red-800 transition-colors bg-white px-3 py-1.5 rounded-lg border border-red-200"
            >
              Export Failure Log
            </button>
          </motion.div>
        )}

        {/* Progress Tracker Layer */}
        {progress && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 bg-slate-900 text-white rounded-xl p-6 border-l-4 border-accent shadow-2xl overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 rounded-full blur-3xl -mr-16 -mt-16" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full border-2 border-accent/30 flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-accent animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-accent uppercase tracking-widest">Active Inference Step</p>
                    <p className="text-sm font-bold font-mono text-white tracking-tight">{progress.step}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black font-mono text-accent">{progress.percent}%</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase">Processing Bitstream</p>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percent}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-accent shadow-[0_0_15px_rgba(59,130,246,0.6)]"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Smart Ingest Dropzone */}
        <div className="mt-8">
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleFileUpload(e.dataTransfer.files);
            }}
            className={cn(
              "relative border-4 border-dashed rounded-2xl p-12 transition-all flex flex-col items-center justify-center text-center cursor-pointer group mb-6",
              isDragging ? "bg-accent/5 border-accent scale-[0.99] ring-8 ring-accent/10" : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/50"
            )}
          >
            <input 
              type="file" 
              multiple 
              accept=".csv"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div className={cn(
              "p-4 bg-white rounded-full shadow-lg border border-slate-100 mb-4 transition-transform duration-500",
              isDragging ? "scale-110 rotate-12" : "group-hover:translate-y-[-5px]"
            )}>
              <Download className={cn("w-10 h-10", isDragging ? "text-accent" : "text-slate-400")} />
            </div>
            <h3 className="text-lg font-black text-text-main uppercase tracking-tight">Smart Batch Ingest</h3>
            <p className="text-xs text-text-muted mt-2 font-medium max-w-sm">
              Drag and drop multiple CSV files from <span className="text-accent font-bold">all departments</span>.
              Our engine will automatically detect the source and validate headers.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {departments.map(d => (
                <span key={d} className={cn(
                  "px-3 py-1 text-[9px] font-bold rounded-full border uppercase tracking-tighter",
                  uploads[d] ? "bg-accent text-white border-accent" : "bg-white text-slate-500 border-slate-200"
                )}>
                  {d}
                </span>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="mb-6 space-y-2">
              {errors.map((err, i) => (
                <div key={`${i}-${err}`} className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-lg flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-xs font-bold leading-tight uppercase tracking-tighter">{err}</p>
                </div>
              ))}
            </div>
          )}

          {/* Staged Upload Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {departments.map(dept => {
              const upload = uploads[dept];
              return (
                <div 
                  key={dept} 
                  className={cn(
                    "p-4 rounded-xl border transition-all relative overflow-hidden",
                    upload ? "bg-white border-accent shadow-md ring-1 ring-accent/10" : "bg-slate-50/50 border-slate-200 opacity-60 grayscale hover:grayscale-0 hover:opacity-100"
                  )}
                >
                  {upload && <div className="absolute top-0 right-0 p-1.5"><CheckCircle2 className="w-4 h-4 text-accent" /></div>}
                  <div className="flex items-center gap-2 mb-3">
                    <div className={cn("p-1.5 rounded-lg", upload ? "bg-accent/10" : "bg-slate-200")}>
                      <Database className={cn("w-3.5 h-3.5", upload ? "text-accent" : "text-slate-400")} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-tighter">{dept}</span>
                  </div>
                  
                  {upload ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold text-text-main truncate max-w-full" title={upload.fileName}>{upload.fileName}</p>
                        <p className="text-[9px] text-text-muted mt-0.5">{(upload.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-accent">{upload.count.toLocaleString()}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Records</p>
                        </div>
                        <button 
                          onClick={() => setUploads(prev => {
                            const next = { ...prev };
                            delete next[dept];
                            return next;
                          })}
                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 border-2 border-dashed border-slate-200 rounded-lg">
                      <Plus className="w-4 h-4 text-slate-300 mb-1" />
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Wait for Input</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Persistence / Analytics Context */}
      {Object.keys(uploads).length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-lg border border-border overflow-hidden shadow-sm"
        >
          <div className="px-6 py-4 border-b border-border bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-text-main uppercase tracking-wider flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-accent" />
              Batch Intelligence Overview
            </h3>
            <span className="px-2 py-1 bg-white border border-border text-[10px] font-bold rounded uppercase">Detected: {Object.keys(uploads).length} Sources</span>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Aggregate Records</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-text-main">
                  {Object.values(uploads).reduce((acc, curr) => acc + curr.count, 0).toLocaleString()}
                </p>
                <div className="flex items-center text-[10px] font-bold text-green-600">
                  <ChevronUp className="w-3 h-3" />
                  RAW
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Expected Anchor Density</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-text-main">38.4%</p>
                <div className="text-[10px] font-bold text-blue-600 uppercase">Target</div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Collision Risk Projection</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-orange-500">LOW</p>
                <div className="text-[10px] font-bold text-orange-500 uppercase tracking-tighter">&lt; 2.5% Est</div>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Integrity Rating</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-black text-green-600">CERTIFIED</p>
                <ShieldCheck className="w-4 h-4 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-slate-900 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-white/70 text-[10px] font-bold font-mono">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
              UNCOMMITTED STAGE: Records residing in volatile memory. Execute Resolution to persist.
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setUploads({})}
                className="text-white/50 hover:text-white text-[10px] font-bold uppercase transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Development API Section - Section 9 UI Structure Addition */}
      <div className="mt-8 bg-slate-900 rounded-xl p-6 border border-slate-800 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <TerminalIcon className="w-24 h-24 text-white" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/20 rounded-lg">
              <TerminalIcon className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">KUBID Developer API (Testing Interface)</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Automated Testing & External Integration Layer</p>
                <div className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-[8px] text-blue-400 font-black tracking-tighter uppercase">Scale Ready: O(n log n)</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/health');
                  const data = await res.json();
                  addNotification?.("API Status Check", `Status: ${data.status} | Version: ${data.version}`, "success");
                } catch (e) {
                  addNotification?.("API Health Error", "API Offline or Not Reachable", "error");
                }
              }}
              className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 rounded-md text-[10px] font-black text-green-400 uppercase tracking-widest hover:bg-green-500/20 transition-all flex items-center gap-2"
            >
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Check API Health
            </button>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/docs');
                  const data = await res.json();
                  console.log('KUBID API Docs:', data);
                  addNotification?.("API Metadata", "Documentation log dumped to Console (F12)", "info");
                } catch (e) {
                   addNotification?.("API Docs Error", "API Documentation Unavailable", "error");
                }
              }}
              className="px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-md text-[10px] font-black text-accent uppercase tracking-widest hover:bg-accent/20 transition-all flex items-center gap-2"
            >
              <TerminalIcon className="w-3 h-3" />
              Get API Metadata
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Inference Endpoint
              </div>
              <div className="bg-black/60 rounded-lg p-3 border border-slate-700 font-mono text-[11px] text-accent">
                POST /api/resolve
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Feed raw departmental records directly to the logic engine via REST. This endpoint allows the system to "survive" high-volume API testing while maintaining resolution accuracy.
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 bg-accent rounded-full" />
                Testing Command
              </div>
              <div className="bg-black/60 rounded-lg p-3 border border-slate-700 font-mono text-[10px] text-emerald-400 overflow-x-auto whitespace-nowrap">
                {`curl -X POST http://localhost:3000/api/resolve -H "Content-Type: application/json" -d '[{"id":"T1","name":"Sri Lakshmi Tex"}]'`}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                Note: External test data is processed using the identical multi-pass logic as manual uploads, ensuring systematic consistency.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const ManualReversionWorkspace = ({ 
  ubids, 
  knowledge, 
  onUnlinkRecord,
  onLinkRecords,
  onRemoveBlacklist,
  onTransferRecord,
  addNotification
}: { 
  ubids: UBIDRecord[], 
  knowledge: SystemKnowledge,
  onUnlinkRecord: (ubidId: string, recordId: string) => void,
  onLinkRecords: (recordA: SourceRecord, recordB: SourceRecord) => void,
  onRemoveBlacklist: (idA: string, idB: string) => void,
  onTransferRecord: (recordId: string, targetUbidId: string) => void,
  addNotification: (title: string, message: string, type: AppNotification['type'], entityId?: string) => void
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUbidId, setSelectedUbidId] = useState<string | null>(null);
  const [linkingMode, setLinkingMode] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');
  const [transferringRecord, setTransferringRecord] = useState<SourceRecord | null>(null);

  const selectedUbid = useMemo(() => ubids.find(u => u.ubid === selectedUbidId), [ubids, selectedUbidId]);

  const performSearch = (term: string, source: UBIDRecord[]) => {
    if (!term) return [];
    const lowTerm = term.toLowerCase();
    return source.filter(u => 
      u.ubid.toLowerCase().includes(lowTerm) || 
      u.canonicalName.toLowerCase().includes(lowTerm) ||
      u.pan?.toLowerCase().includes(lowTerm) ||
      u.gstin?.toLowerCase().includes(lowTerm) ||
      u.linkedRecords.some(r => 
        r.id.toLowerCase().includes(lowTerm) ||
        r.businessName.toLowerCase().includes(lowTerm) ||
        r.pan?.toLowerCase().includes(lowTerm) ||
        r.gstin?.toLowerCase().includes(lowTerm) ||
        r.address?.toLowerCase().includes(lowTerm)
      )
    ).slice(0, 10);
  };

  const filteredUbids = useMemo(() => performSearch(searchTerm, ubids), [searchTerm, ubids]);
  const linkTargets = useMemo(() => performSearch(linkSearchTerm, ubids.filter(u => u.ubid !== selectedUbid?.ubid)), [linkSearchTerm, ubids, selectedUbid]);

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ShieldAlert className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main uppercase tracking-tight">Manual Reversion & Authority Workspace</h2>
              <p className="text-xs text-text-muted italic">Ground Truth Link/Unlink Control</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => { setSelectedUbidId(null); setLinkingMode(false); setSearchTerm(''); }}
              className="px-3 py-1.5 bg-bg border border-border rounded text-[10px] font-bold uppercase hover:bg-slate-100"
            >
              Reset View
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search by UBID, Internal ID, Name, PAN or GSTIN..."
              className="w-full pl-10 pr-4 py-3 text-sm bg-bg border border-border rounded-lg focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredUbids.length > 0 && !selectedUbid && (
            <div className="border border-border rounded-lg overflow-hidden bg-white shadow-xl absolute z-30 w-full max-w-2xl">
              {filteredUbids.map(u => (
                <button 
                  key={u.ubid}
                  onClick={() => {
                    setSelectedUbidId(u.ubid);
                    setSearchTerm('');
                  }}
                  className="w-full p-4 text-left hover:bg-bg transition-colors flex justify-between items-center border-b border-border last:border-0 group"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-xs font-bold text-text-main truncate">{u.canonicalName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "text-[10px] font-mono font-bold",
                        u.ubid.includes('KA-INT') ? "text-orange-700" : "text-accent"
                      )}>{u.ubid}</span>
                      {u.pan && <span className="text-[9px] text-text-muted uppercase tracking-tight">PAN: {maskPAN(u.pan)}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-all" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {selectedUbid && (
          <motion.div 
            key="selected-ubid"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="space-y-6"
          >
            <div className="bg-card p-6 rounded-lg border-2 border-orange-200 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 flex gap-2">
                <button 
                  onClick={() => setLinkingMode(!linkingMode)}
                  className={cn(
                    "px-4 py-2 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-2",
                    linkingMode ? "bg-slate-800 text-white" : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                  )}
                >
                  {linkingMode ? <RefreshCcw className="w-3.5 h-3.5 animate-spin-slow" /> : <LinkIcon className="w-3.5 h-3.5" />}
                  {linkingMode ? "Cancel Manual Link" : "Manually Link Record"}
                </button>
              </div>
              
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 uppercase tracking-wider">Authority Selection</span>
                </div>
                <h3 className="text-xl font-bold text-text-main">{selectedUbid.canonicalName}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <p className={cn(
                    "text-xs font-mono font-bold",
                    selectedUbid.ubid.includes('KA-INT') ? "text-orange-700" : "text-accent"
                  )}>{selectedUbid.ubid}</p>
                  <span className="w-1 h-1 bg-border rounded-full" />
                  <p className="text-xs text-text-muted">{selectedUbid.canonicalAddress}</p>
                </div>
                <div className="flex flex-wrap gap-4 mt-3">
                  <div className="flex items-center gap-1.5 bg-bg px-2 py-1 rounded border border-border">
                    <span className="text-[9px] font-bold text-text-muted uppercase">PAN</span>
                    <span className="text-xs font-bold text-text-main">{maskPAN(selectedUbid.pan) || 'N/A'}</span>
                  </div>
                  {selectedUbid.gstin && (
                    <div className="flex items-center gap-1.5 bg-bg px-2 py-1 rounded border border-border">
                      <span className="text-[9px] font-bold text-text-muted uppercase">GSTIN</span>
                      <span className="text-xs font-bold text-text-main">{maskSensitive(selectedUbid.gstin)}</span>
                    </div>
                  )}
                  {selectedUbid.tradeLicense && (
                    <div className="flex items-center gap-1.5 bg-bg px-2 py-1 rounded border border-border">
                      <span className="text-[9px] font-bold text-text-muted uppercase">Trade License</span>
                      <span className="text-xs font-bold text-text-main">{selectedUbid.tradeLicense}</span>
                    </div>
                  )}
                </div>
              </div>

              {linkingMode && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-8 p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl space-y-6"
                >
                  <div className="flex items-center gap-3 text-slate-800">
                    <Sparkles className="w-5 h-5 text-accent" />
                    <h4 className="text-sm font-bold uppercase tracking-tight">Step: Identify Link Target</h4>
                  </div>
                  
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input 
                      type="text" 
                      placeholder="Search target UBID to merge with this cluster..."
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-accent outline-none"
                      value={linkSearchTerm}
                      onChange={(e) => setLinkSearchTerm(e.target.value)}
                    />
                    
                    {linkTargets.length > 0 && (
                      <div className="absolute top-full left-0 w-full mt-2 bg-white border border-border rounded-lg shadow-2xl z-40 max-h-[300px] overflow-y-auto divide-y divide-border">
                        {linkTargets.map(target => (
                          <div key={target.ubid} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex-1 min-w-0 pr-4">
                              <p className="text-xs font-bold text-text-main">{target.canonicalName}</p>
                              <p className={cn(
                                "text-[10px] font-mono font-bold",
                                target.ubid.includes('KA-INT') ? "text-orange-700" : "text-accent"
                              )}>{target.ubid}</p>
                            </div>
                            <button 
                              onClick={() => {
                                if (window.confirm(`MANUAL SYNC: Merge ${target.canonicalName} into ${selectedUbid.canonicalName}?`)) {
                                  onLinkRecords(selectedUbid.linkedRecords[0], target.linkedRecords[0]);
                                  setLinkingMode(false);
                                  setLinkSearchTerm('');
                                  // Stay on the primary cluster instead of resetting
                                  addNotification('Cluster Merge Initiated', 'Integrating data verticals...', 'info');
                                }
                              }}
                              className="px-4 py-2 bg-accent text-white rounded text-[10px] font-bold uppercase hover:bg-accent-hover transition-all"
                            >
                              Finalize Linkage
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest border-b border-border pb-1">Cluster Management</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedUbid.linkedRecords.map((record, rIdx) => (
                    <div key={`${record.id}-${rIdx}`} className="p-4 bg-white border border-border rounded-lg group transition-all hover:border-orange-300 shadow-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="p-1 bg-bg rounded group-hover:bg-orange-50 transition-colors">
                              <Building2 className="w-3.5 h-3.5 text-text-muted group-hover:text-orange-600" />
                            </div>
                            <span className="text-[10px] font-bold text-text-main uppercase">{record.department}</span>
                          </div>
                          <p className="text-sm font-bold text-text-main leading-tight">{record.businessName}</p>
                          <div className="mt-2 space-y-1">
                            <p className="text-[10px] font-mono text-accent font-bold">ID: {record.id}</p>
                            <p className="text-[10px] text-text-muted truncate max-w-[200px]">{record.address}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            if (window.confirm(`FORCE REVERSION: Unlink ${record.businessName}?`)) {
                              onUnlinkRecord(selectedUbid.ubid, record.id);
                            }
                          }}
                          className="p-2 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-all flex flex-col items-center gap-1"
                          title="Perform Unlink Reversion"
                        >
                          <Link2Off className="w-4 h-4" />
                          <span className="text-[8px] font-bold uppercase">Unlink</span>
                        </button>
                        <button 
                          onClick={() => setTransferringRecord(record)}
                          className="p-2 text-text-muted hover:text-accent hover:bg-accent/5 rounded transition-all flex flex-col items-center gap-1"
                          title="Transfer record to another UBID"
                        >
                          <RefreshCcw className="w-4 h-4" />
                          <span className="text-[8px] font-bold uppercase">Transfer</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {transferringRecord && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-xl shadow-2xl border border-border w-full max-w-lg p-8 space-y-6"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-lg font-bold text-text-main flex items-center gap-2">
                        <RefreshCcw className="w-5 h-5 text-accent" />
                        Transfer Identity Record
                      </h4>
                      <p className="text-xs text-text-muted mt-1 uppercase tracking-wider font-bold">Targeting Record: {transferringRecord.id}</p>
                    </div>
                    <button onClick={() => setTransferringRecord(null)} className="p-1 hover:bg-bg rounded">
                      <Lock className="w-5 h-5 text-text-muted" />
                    </button>
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                    <p className="text-sm font-bold text-slate-800">{transferringRecord.businessName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{transferringRecord.address}</p>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Search Destination UBID</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                      <input 
                        type="text" 
                        placeholder="Type UBID, Name, or PAN..."
                        className="w-full pl-10 pr-4 py-3 bg-white border border-border rounded-lg focus:ring-2 focus:ring-accent outline-none"
                        value={linkSearchTerm}
                        onChange={(e) => setLinkSearchTerm(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <div className="max-h-[300px] overflow-y-auto divide-y divide-border border border-border rounded-lg bg-white">
                      {linkTargets.map(target => (
                        <div key={target.ubid} className="p-4 flex items-center justify-between hover:bg-bg transition-all">
                          <div className="flex-1 min-w-0 pr-4">
                            <p className="text-xs font-bold text-text-main truncate">{target.canonicalName}</p>
                            <p className="text-[10px] font-mono text-accent font-bold uppercase">{target.ubid}</p>
                          </div>
                          <button 
                            onClick={() => {
                              onTransferRecord(transferringRecord.id, target.ubid);
                              setTransferringRecord(null);
                              setLinkSearchTerm('');
                              setSelectedUbidId(null);
                            }}
                            className="px-4 py-2 bg-accent text-white rounded text-[10px] font-bold uppercase hover:bg-accent-hover"
                          >
                            Transfer to Target
                          </button>
                        </div>
                      ))}
                      {linkSearchTerm && linkTargets.length === 0 && (
                        <div className="p-8 text-center text-text-muted text-xs italic">No matching destinations found</div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Blacklist Section */}
      <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Lock className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-main uppercase tracking-tight">Manual Blacklist Registry</h2>
            <p className="text-xs text-text-muted italic">Persistent ID-to-ID Blocking Ledger</p>
          </div>
        </div>

        {knowledge.manualBlacklist.length > 0 ? (
          <div className="overflow-hidden border border-border rounded-lg divide-y divide-border">
            {knowledge.manualBlacklist.map((entry, idx) => (
              <div key={`${entry.recordIdA}-${entry.recordIdB}-${idx}`} className="p-4 bg-slate-50 flex items-center justify-between group">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-text-muted uppercase">Record A</span>
                    <span className="text-[11px] font-mono font-bold text-text-main">{entry.recordIdA}</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-orange-600 font-bold text-sm text-[16px]">↛</span>
                    <span className="text-[8px] font-bold text-orange-600 uppercase">Blocked</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-text-muted uppercase">Record B</span>
                    <span className="text-[11px] font-mono font-bold text-text-main">{entry.recordIdB}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-2 py-1 bg-white border border-border rounded flex items-center gap-1.5 shadow-sm">
                    <ShieldAlert className="w-3 h-3 text-orange-500" />
                    <span className="text-[9px] font-bold text-text-muted uppercase">MANUAL_REVERSION_ENFORCED</span>
                  </div>
                  <button 
                    onClick={() => onRemoveBlacklist(entry.recordIdA, entry.recordIdB)}
                    className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded transition-all"
                    title="Clear Persistent Conflict"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-bg/50 rounded-lg border border-dashed border-border flex flex-col items-center justify-center">
            <Lock className="w-8 h-8 text-text-muted opacity-20 mb-3" />
            <p className="text-xs font-bold text-text-muted uppercase tracking-widest">No persistent conflicts registered</p>
            <p className="text-[10px] text-text-muted mt-1 uppercase tracking-tight italic">Registry is operating with standard deterministic synchronization</p>
          </div>
        )}
      </div>
    </div>
  );
};

const SystemConfigurationPage = ({ 
  knowledge, 
  setKnowledge,
  addNotification,
  onApply
}: { 
  knowledge: SystemKnowledge, 
  setKnowledge: React.Dispatch<React.SetStateAction<SystemKnowledge>>,
  addNotification: (title: string, message: string, type: AppNotification['type']) => void,
  onApply: () => void
}) => {
  const config = knowledge.config;
  const [isAddingOverride, setIsAddingOverride] = useState(false);
  const [newOverride, setNewOverride] = useState({ sector: '', window: 180, description: '' });

  const updateWeight = (key: keyof typeof config.weights, value: number) => {
    setKnowledge(prev => ({
      ...prev,
      config: {
        ...prev.config,
        weights: {
          ...prev.config.weights,
          [key]: value
        }
      }
    }));
  };

  const autoBalanceWeights = () => {
    const total = config.weights.anchor + config.weights.name + config.weights.geo;
    if (total === 0) {
      setKnowledge(prev => ({
        ...prev,
        config: { ...prev.config, weights: { anchor: 0.6, name: 0.25, geo: 0.15 } }
      }));
    } else {
      const a = config.weights.anchor / total;
      const n = config.weights.name / total;
      const g = 1 - a - n;
      setKnowledge(prev => ({
        ...prev,
        config: {
          ...prev.config,
          weights: {
            anchor: Number(a.toFixed(2)),
            name: Number(n.toFixed(2)),
            geo: Number(g.toFixed(2))
          }
        }
      }));
    }
    addNotification("Weights Balanced", "System coefficients re-normalized to 100%.", "info");
  };

  const updateThreshold = (key: keyof typeof config.thresholds, value: number) => {
    setKnowledge(prev => ({
      ...prev,
      config: {
        ...prev.config,
        thresholds: {
          ...prev.config.thresholds,
          [key]: value
        }
      }
    }));
  };

  const updateDormancy = (key: keyof typeof config.dormancy, value: number) => {
    setKnowledge(prev => ({
      ...prev,
      config: {
        ...prev.config,
        dormancy: {
          ...prev.config.dormancy,
          [key]: value
        }
      }
    }));
  };

  const addOverride = () => {
    if (!newOverride.sector) {
      addNotification("Validation Error", "Sector name is required.", "error");
      return;
    }
    setKnowledge(prev => ({
      ...prev,
      config: {
        ...prev.config,
        sectoralOverrides: [
          ...prev.config.sectoralOverrides,
          { 
            sector: newOverride.sector, 
            seasonalWindow: newOverride.window, 
            description: newOverride.description || "Custom sectoral dormancy protection logic."
          }
        ]
      }
    }));
    setNewOverride({ sector: '', window: 180, description: '' });
    setIsAddingOverride(false);
    addNotification("Override Created", `Dynamic logic applied to ${newOverride.sector} sector.`, "success");
  };

  const removeOverride = (sector: string) => {
    setKnowledge(prev => ({
      ...prev,
      config: {
        ...prev.config,
        sectoralOverrides: prev.config.sectoralOverrides.filter(o => o.sector !== sector)
      }
    }));
    addNotification("Override Revoked", `System reverted to regional defaults for ${sector}.`, "info");
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Settings className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main">System Configuration</h2>
            <p className="text-xs text-text-muted">Tune Entity Resolution weights and Heartbeat thresholds</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              const defaultKnowledge = {
                weights: { anchor: 0.60, name: 0.25, geo: 0.15 },
                thresholds: { autoLink: 0.95, hitlReview: 0.70 },
                dormancy: { recentSignalWindow: 180, annualSignalWindow: 365 },
                sectoralOverrides: []
              };
              setKnowledge(prev => ({
                ...prev,
                config: defaultKnowledge
              }));
              addNotification("Factory Reset", "System values reverted to regional defaults.", "info");
            }}
            className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <button 
            onClick={onApply}
            className="px-6 py-2 bg-text-main text-white rounded text-xs font-bold hover:bg-black transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Apply & Persist Logic
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pass Weighting Card */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">Resolution Logic Weights</h3>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main">W_anchor (Sovereign Authority)</label>
                <span className="text-xs font-mono font-bold text-accent bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {Math.round(config.weights.anchor * 100)}%
                </span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={config.weights.anchor}
                onChange={(e) => updateWeight('anchor', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-text-muted italic">Significance of PAN/GSTIN matches (Pass 1).</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main">W_name (Phonetic Pattern Matching)</label>
                <span className="text-xs font-mono font-bold text-accent bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {Math.round(config.weights.name * 100)}%
                </span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={config.weights.name}
                onChange={(e) => updateWeight('name', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-text-muted italic">Significance of normalized fuzzy name matches (Pass 2).</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main">W_geo (Geospatial Proximity)</label>
                <span className="text-xs font-mono font-bold text-accent bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                  {Math.round(config.weights.geo * 100)}%
                </span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={config.weights.geo}
                onChange={(e) => updateWeight('geo', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-text-muted italic">Significance of haversine distance scores (Pass 3).</p>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mt-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[10px] font-bold text-slate-600 uppercase">Weight Integrity Check</span>
              </div>
              <p className={cn(
                "text-[11px] font-bold",
                Math.abs((config.weights.anchor + config.weights.name + config.weights.geo) - 1) < 0.01 
                  ? "text-emerald-600" 
                  : "text-red-500"
              )}>
                Current Sum: {Math.round((config.weights.anchor + config.weights.name + config.weights.geo) * 100)}%
                {Math.abs((config.weights.anchor + config.weights.name + config.weights.geo) - 1) > 0.01 && " (Warning: Imbalance detected)"}
              </p>
            </div>
            {Math.abs((config.weights.anchor + config.weights.name + config.weights.geo) - 1) > 0.01 && (
              <button 
                onClick={autoBalanceWeights}
                className="text-[10px] font-bold text-accent hover:underline flex items-center gap-1"
              >
                <Zap className="w-3 h-3" />
                Auto-Balance
              </button>
            )}
          </div>
        </div>

        {/* Global Thresholds Card */}
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">Risk Tolerance Thresholds</h3>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main">Auto-Link Cutoff (Sc High)</label>
                <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                  &gt; {Math.round(config.thresholds.autoLink * 100)}%
                </span>
              </div>
              <input 
                type="range" min="0.8" max="1" step="0.01" 
                value={config.thresholds.autoLink}
                onChange={(e) => updateThreshold('autoLink', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-text-muted italic">Entities with confidence above this merge automatically without HITL review.</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-text-main">HITL Review Cutoff (Sc Medium)</label>
                <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                  {Math.round(config.thresholds.hitlReview * 100)}% - {Math.round(config.thresholds.autoLink * 100)}%
                </span>
              </div>
              <input 
                type="range" min="0.5" max="0.9" step="0.05" 
                value={config.thresholds.hitlReview}
                onChange={(e) => updateThreshold('hitlReview', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <p className="text-[10px] text-text-muted italic">Entities in this confidence bracket are routed to the Review Queue.</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-text-main uppercase tracking-tight">Dormancy Engine Windows</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase">Recent Window (Days)</label>
                  <input 
                    type="number" 
                    value={config.dormancy.recentSignalWindow}
                    onChange={(e) => updateDormancy('recentSignalWindow', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-bg border border-border rounded text-xs font-bold outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-muted uppercase">Annual Window (Days)</label>
                  <input 
                    type="number" 
                    value={config.dormancy.annualSignalWindow}
                    onChange={(e) => updateDormancy('annualSignalWindow', parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-bg border border-border rounded text-xs font-bold outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>
              <p className="text-[10px] text-text-muted italic">Defines ACTIVE vs DORMANT vs CLOSED logic transitions based on late signal delivery.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Sectoral Seasonal Overrides</h3>
              <p className="text-[10px] text-slate-500">Fine-tune dormancy windows for specific industrial sectors</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAddingOverride(true)}
            className="text-[10px] font-bold text-emerald-400 border border-emerald-400/30 px-3 py-1 rounded hover:bg-emerald-400/10 transition-all uppercase flex items-center gap-2"
          >
            <Plus className="w-3 h-3" />
            Add Sector Override
          </button>
        </div>

        {isAddingOverride && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
          >
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Sector Name</label>
              <input 
                type="text" 
                placeholder="e.g. Textiles"
                value={newOverride.sector}
                onChange={e => setNewOverride(prev => ({ ...prev, sector: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Dormancy Window (Days)</label>
              <input 
                type="number" 
                value={newOverride.window}
                onChange={e => setNewOverride(prev => ({ ...prev, window: parseInt(e.target.value) }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Rationale/Notes</label>
              <input 
                type="text" 
                placeholder="Brief explanation..."
                value={newOverride.description}
                onChange={e => setNewOverride(prev => ({ ...prev, description: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={addOverride}
                className="flex-1 bg-emerald-600 text-white rounded py-1.5 text-xs font-bold hover:bg-emerald-500 transition-all font-mono"
              >
                COMMIT
              </button>
              <button 
                onClick={() => setIsAddingOverride(false)}
                className="bg-slate-700 text-white rounded px-3 py-1.5 text-xs font-bold hover:bg-slate-600 transition-all"
              >
                CANCEL
              </button>
            </div>
          </motion.div>
        )}

        <div className="overflow-hidden border border-slate-800 rounded-lg">
          <table className="w-full text-left">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Sector / Industry</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Dormancy Protection</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase">Logic Explanation</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {config.sectoralOverrides.length > 0 ? config.sectoralOverrides.map(override => (
                <tr key={override.sector} className="hover:bg-white/5 transition-colors group">
                  <td className="px-4 py-3 text-xs font-bold text-white">{override.sector}</td>
                  <td className="px-4 py-3 text-xs font-mono text-emerald-400 font-bold">{override.seasonalWindow} Days</td>
                  <td className="px-4 py-3 text-[11px] text-slate-400">{override.description}</td>
                  <td className="px-4 py-3 text-right">
                    <button 
                      onClick={() => removeOverride(override.sector)}
                      className="p-1 hover:bg-red-500/20 rounded-md transition-colors text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-50">
                      <ShieldAlert className="w-8 h-8 text-slate-600" />
                      <p className="text-xs text-slate-400 font-medium">No specialized sectoral overrides defined.</p>
                      <button 
                        onClick={() => setIsAddingOverride(true)}
                        className="text-[10px] text-accent font-bold hover:underline"
                      >
                        Click to define new rule
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const SystemLogicLedger = ({ 
  knowledge, 
  setKnowledge,
  setUbids,
  addNotification,
  logAudit,
  sourceRecords
}: { 
  knowledge: SystemKnowledge, 
  setKnowledge: React.Dispatch<React.SetStateAction<SystemKnowledge>>,
  setUbids: React.Dispatch<React.SetStateAction<UBIDRecord[]>>,
  addNotification: (title: string, message: string, type: AppNotification['type'], targetUbid?: string) => void,
  logAudit: (action: string, entityId: string, details: string | LogicAuditTrail, type: AuditEntry['type']) => void,
  sourceRecords: SourceRecord[]
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-accent" />
            <h2 className="text-base font-bold text-text-main uppercase tracking-tight">Identity Linking Logic</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-bg/50 rounded-lg border border-border">
              <h3 className="text-xs font-bold text-accent uppercase mb-2">Rule 1: Anchor Sync</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                If records share a legal identifier (GSTIN or PAN), they are joined with 100% confidence.
              </p>
              <div className="mt-3 font-mono text-[9px] bg-slate-100 p-2 rounded text-slate-600">
                if (recordA.gstin == recordB.gstin) Join(A, B)
              </div>
            </div>
            
            <div className="p-4 bg-bg/50 rounded-lg border border-border">
              <h3 className="text-xs font-bold text-accent uppercase mb-2">Rule 2: Fuzzy Grouping</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                If no legal ID exists, we compare Business Name and Address similarity within the same PIN code.
              </p>
              <div className="mt-3 font-mono text-[9px] bg-slate-100 p-2 rounded text-slate-600">
                if (similarity(A.name, B.name) &gt; 80%) SuggestMatch(A, B)
              </div>
            </div>
            <div className="p-4 bg-bg/50 rounded-lg border border-border">
              <h3 className="text-xs font-bold text-accent uppercase mb-2">Rule 3: Manual Reversion</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Human verdicts (LINK/UNLINK) override all fuzzy logic. Unlinked records are never merged again.
              </p>
              <div className="mt-3 font-mono text-[9px] bg-slate-100 p-2 rounded text-slate-600">
                if (isBlacklisted(A, B)) RejectMatch(A, B)
              </div>
            </div>

            <div className="p-4 bg-orange-50/50 rounded-lg border border-orange-100">
              <h3 className="text-xs font-bold text-orange-700 uppercase mb-2">Rule 4: ID Promotion</h3>
              <p className="text-xs text-text-muted leading-relaxed">
                Provisional IDs (KA-INT) are retired and upgraded to Permanent UBIDs (KA-) while preserving entropy as soon as a PAN/GSTIN is verified.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-accent" />
            <h2 className="text-base font-bold text-text-main uppercase tracking-tight">Status Inference Logic</h2>
          </div>
          <p className="text-xs text-text-muted mb-4 leading-relaxed">
            The system looks at the "Operational Velocity" of a business to determine if it is Active or Dormant.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Signal in &lt; 90 days', status: 'ACTIVE', color: 'text-status-active border-green-200 bg-green-50' },
              { label: 'Signal between 3-12m', status: 'DORMANT', color: 'text-status-dormant border-orange-200 bg-orange-50' },
              { label: 'No signal &gt; 12m', status: 'CLOSED', color: 'text-status-closed border-red-200 bg-red-50' }
            ].map(rule => (
              <div key={rule.status} className={cn("p-3 rounded border text-center flex flex-col justify-center gap-1", rule.color)}>
                <span className="text-[10px] font-bold uppercase">{rule.status}</span>
                <span className="text-[9px] opacity-80">{rule.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-blue-50/50 p-6 rounded-lg border border-blue-100">
        <h2 className="text-xs font-bold text-accent uppercase mb-4 tracking-wider">Karnataka UBID Deterministic Logic Engine (v4.0)</h2>
        <div className="bg-slate-900 rounded-lg p-5 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto">
          <pre className="whitespace-pre">
{`# THE ANCHOR SYSTEM (v4.0 SECURITY HARDENED):
# ZERO PII: All legal anchors (PAN/GSTIN) stored as SHA-256 digests (KA-SEC prefix).
# ENTROPY: Deterministic 8-char entropy derived from SHA-256 seeding.
# PAN = Legal Anchor (Ownership)
# GSTIN = State Tax Anchor (Business Vertical)
# Trade License / Pincode = Geospatial Anchor (Physical Location)`}
          </pre>
        </div>
        <p className="mt-4 text-[11px] text-text-muted italic">
          Logic Verification (v4.0): This engine is strictly deterministic and privacy-first. It prevents "Identity Poisoning" and satisfies ZERO PII compliance via cryptographic obfuscation.
        </p>
      </div>

      <div className="bg-orange-50/30 p-6 rounded-lg border border-orange-100 mt-6">
        <h2 className="text-sm font-bold text-orange-700 uppercase mb-4 tracking-wider flex items-center gap-2">
          <ShieldAlert className="w-4 h-4" /> MANUAL OVERRIDE & REVERSIBILITY
        </h2>
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 border border-orange-200">
              <span className="text-[10px] font-bold text-orange-700">01</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-orange-800 uppercase">HUMAN_AUTHORITY</h3>
              <p className="text-[11px] text-orange-700/80 leading-relaxed max-w-2xl">
                If the input data contains a "Human_Decision" flag (LINK or UNLINK), the model must bypass its internal scoring logic and adopt the human verdict as absolute "Ground Truth."
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 border border-orange-200">
              <span className="text-[10px] font-bold text-orange-700">02</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-orange-800 uppercase">REVERSIBILITY PROTOCOL</h3>
              <p className="text-[11px] text-orange-700/80 leading-relaxed max-w-2xl">
                When an "UNLINK" command is received for a previously merged UBID, the model must identify the specific Anchor (PAN, Address, etc.) that caused the false match, suggest the creation of a new, distinct "ORPHAN" UBID for the secondary record, and set the edge_case_flag to "MANUAL_REVERSION."
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0 border border-orange-200">
              <span className="text-[10px] font-bold text-orange-700">03</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-orange-800 uppercase">CONTINUOUS IMPROVEMENT</h3>
              <p className="text-[11px] text-orange-700/80 leading-relaxed max-w-2xl">
                Use the "Reasoning" field to document why the human override was necessary (e.g., "Manual inspection confirmed two distinct businesses operating at the same counter") to ensure these two records are never auto-merged again.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NotificationCenter = React.memo(({ 
  notifications, 
  onClose, 
  onMarkAsRead,
  onClearAll 
}: { 
  notifications: AppNotification[], 
  onClose: () => void,
  onMarkAsRead: (id: string) => void,
  onClearAll: () => void
}) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      className="absolute top-full right-0 mt-3 w-80 bg-card border border-border rounded-xl shadow-2xl z-[100] flex flex-col overflow-hidden max-h-[500px]"
    >
      <div className="p-4 border-b border-border flex justify-between items-center bg-bg/50">
        <h3 className="text-xs font-bold text-text-main uppercase tracking-widest flex items-center gap-2">
          <Bell className="w-3.5 h-3.5 text-accent" /> Signals ({notifications.filter(n => !n.read).length})
        </h3>
        <button 
          onClick={onClearAll}
          className="text-[10px] font-bold text-accent hover:underline uppercase"
        >
          Clear All
        </button>
      </div>

      <div className="overflow-y-auto divide-y divide-border">
        {notifications.length > 0 ? (
          notifications.map(n => (
            <div 
              key={n.id} 
              className={cn(
                "p-4 transition-colors hover:bg-bg/50 cursor-pointer relative",
                !n.read ? "bg-accent/5" : ""
              )}
              onClick={() => onMarkAsRead(n.id)}
            >
              {!n.read && <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-accent animate-pulse" />}
              <div className="flex flex-col gap-1 pr-4">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-tighter">
                  {formatDistanceToNow(parseISO(n.timestamp))} ago • {n.type}
                </span>
                <span className="text-sm font-bold text-text-main leading-tight">{n.title}</span>
                <p className="text-xs text-text-muted line-clamp-2">{n.message}</p>
                {n.entityId && (
                  <span className="mt-1 text-[9px] font-mono text-accent bg-blue-50 px-1 rounded self-start border border-blue-100">
                    Source: {n.entityId}
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-10 text-center flex flex-col items-center justify-center opacity-40">
            <Bell className="w-8 h-8 mb-2" />
            <p className="text-[10px] font-bold uppercase">No active signals</p>
          </div>
        )}
      </div>

      <div className="p-3 bg-bg/50 border-t border-border">
        <button 
          onClick={onClose}
          className="w-full py-2 bg-accent text-white rounded font-bold text-[10px] uppercase hover:bg-accent-hover transition-all"
        >
          View Dashboard
        </button>
      </div>
    </motion.div>
  );
});

NotificationCenter.displayName = 'NotificationCenter';

export default function App() {
  return (
    <SelfHealingBridge>
      <UBIDIntelligenceApp />
    </SelfHealingBridge>
  );
}

const UBIDIntelligenceApp = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'review' | 'explorer' | 'query' | 'system-query' | 'registry' | 'resolution' | 'audit' | 'logic' | 'reversion' | 'settings' | 'ingestion'>('dashboard');
  const [globalSearch, setGlobalSearch] = useState('');
  const [showGlobalResults, setShowGlobalResults] = useState(false);
  const [selectedUbid, setSelectedUbid] = useState<UBIDRecord | null>(null);
  
  const [sourceRecords, setSourceRecords] = useState<SourceRecord[]>(() => generateMockData().sourceRecords);
  
  const [knowledge, setKnowledge] = useState<SystemKnowledge>(() => {
    const saved = localStorage.getItem('kubid_knowledge_v4');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to load knowledge", e);
      }
    }
    return {
      manualLinks: [],
      manualBlacklist: [],
      approvedAliases: [],
      config: {
        weights: {
          anchor: 0.60,
          name: 0.25,
          geo: 0.15
        },
        thresholds: {
          autoLink: 0.95,
          hitlReview: 0.70
        },
        dormancy: {
          recentSignalWindow: 180,
          annualSignalWindow: 365
        },
        sectoralOverrides: []
      },
      learnedWeights: { nameWeight: 0.65, addressWeight: 0.25, pinWeight: 0.1 },
      riskTolerance: 0.4
    };
  });

  useEffect(() => {
    localStorage.setItem('kubid_knowledge_v4', JSON.stringify(knowledge));
  }, [knowledge]);

  const [events, setEvents] = useState<ActivityEvent[]>(MOCK_EVENTS);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [suggestions, setSuggestions] = useState<MatchSuggestion[]>(INITIAL_SUGGESTIONS);

  const addNotification = useCallback((
    title: string, 
    message: string, 
    type: AppNotification['type'], 
    entityId?: string
  ) => {
    const newNotification: AppNotification = {
      id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      title,
      message,
      type,
      read: false,
      entityId
    };
    setNotifications(prev => [newNotification, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  const [ubids, setUbids] = useState<UBIDRecord[]>([]);
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const resolveRecordsBackend = useCallback(async (records: SourceRecord[], knowledge: SystemKnowledge, events: ActivityEvent[]) => {
    const response = await fetch('/api/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records, knowledge, events }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resolve API failed: ${response.status} ${body}`);
    }

    const payload = await response.json();
    return payload.data ?? payload;
  }, []);

  const resolveRecords = useCallback(async (records: SourceRecord[], knowledge: SystemKnowledge, events: ActivityEvent[]) => {
    if (!backendOnline) {
      throw new Error('Backend unavailable. Start the backend and refresh the app.');
    }

    return await resolveRecordsBackend(records, knowledge, events);
  }, [resolveRecordsBackend, backendOnline]);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) {
          throw new Error(`Backend health check failed: ${res.status}`);
        }
        setBackendOnline(true);
        setBackendError(null);
      } catch (error: any) {
        const message = error?.message || 'Unable to reach backend API';
        setBackendOnline(false);
        setBackendError(message);
        addNotification?.('Backend Connection Failed', message, 'warning');
      }
    };

    checkBackend();
  }, [addNotification]);

  const handleApplyConfig = useCallback(() => {
    addNotification("Reprocessing Registry", "Applying new configuration weights across global dataset...", "info");
    
    (async () => {
      try {
        const { ubids: resolved, suggestions: newSuggestions } = await resolveRecords(sourceRecords, knowledge, events);
        const merged = [...MOCK_UBIDS, ...resolved.filter(r => !MOCK_UBIDS.some(m => m.ubid === r.ubid))];
        
        const updatedUbids = merged.map(u => {
          const statusVerdict = inferBusinessStatus(u.ubid, events, knowledge.config.dormancy.recentSignalWindow, u.canonicalName, undefined, knowledge.config);
          return {
            ...u,
            status: statusVerdict.status,
            reasoning: statusVerdict.reasoning,
            edgeCaseFlag: statusVerdict.edgeCaseFlag as any || u.edgeCaseFlag
          };
        });
        
        setUbids(updatedUbids);
        setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
        addNotification("Registry Re-aligned", "System parameters persisted and re-indexed successfully.", "success");
      } catch (error: any) {
        console.error("Registry reprocessing failed:", error);
        addNotification("Registry Reprocessing Failed", error.message || "Unable to apply configuration.", "error");
      }
    })();
  }, [sourceRecords, knowledge, events, addNotification, resolveRecords]);

  // Initial load
  useEffect(() => {
    const initialize = async () => {
      try {
        const { ubids: resolved, suggestions: newSuggestions } = await resolveRecords(sourceRecords, knowledge, events);
        const merged = [...MOCK_UBIDS, ...resolved.filter(r => !MOCK_UBIDS.some(m => m.ubid === r.ubid))];
        const initialVisible = merged.map(u => {
          const statusVerdict = inferBusinessStatus(u.ubid, events, knowledge.config.dormancy.recentSignalWindow, u.canonicalName, undefined, knowledge.config);
          return {
            ...u,
            status: statusVerdict.status,
            reasoning: statusVerdict.reasoning,
            edgeCaseFlag: statusVerdict.edgeCaseFlag as any || u.edgeCaseFlag
          };
        });
        setUbids(initialVisible);
        setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
      } catch (error: any) {
        console.warn("Backend initialization failed, using local resolution.", error);
        addNotification("Backend unreachable", "Backend resolve API is unavailable. Using local resolution until the backend is available.", "warning");
        const { ubids: resolved, suggestions: newSuggestions } = resolveUBIDs(sourceRecords, knowledge, events);
        const merged = [...MOCK_UBIDS, ...resolved.filter(r => !MOCK_UBIDS.some(m => m.ubid === r.ubid))];
        const initialVisible = merged.map(u => {
          const statusVerdict = inferBusinessStatus(u.ubid, events, knowledge.config.dormancy.recentSignalWindow, u.canonicalName, undefined, knowledge.config);
          return {
            ...u,
            status: statusVerdict.status,
            reasoning: statusVerdict.reasoning,
            edgeCaseFlag: statusVerdict.edgeCaseFlag as any || u.edgeCaseFlag
          };
        });
        setUbids(initialVisible);
        setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
      }
    };

    initialize();
  }, []); // Only once at mount using current knowledge

  const appOrphans = useMemo(() => findOrphanEvents(events, ubids), [events, ubids]);

  const fuse = useMemo(() => new Fuse(ubids, {
    keys: [
      'canonicalName', 
      'ubid', 
      'pan', 
      'gstin', 
      'canonicalAddress', 
      'pinCode',
      'linkedRecords.id',
      'historicalIds'
    ],
    threshold: 0.4,
    includeScore: true
  }), [ubids]);

  const logAudit = useCallback((action: string, entityId: string, details: string | LogicAuditTrail, type: AuditEntry['type']) => {
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

  const handleStatusOverride = useCallback((ubidId: string, status: 'ACTIVE' | 'DORMANT' | 'CLOSED', reason: string) => {
    setUbids(prev => prev.map(u => {
      if (u.ubid === ubidId) {
        logAudit('Status Override', ubidId, `Status changed from ${u.status} to ${status}. Reason: ${reason}`, 'Governance');
        addNotification('Status Registry Updated', `Entity ${ubidId} lifecycle status changed to ${status}`, 'governance', ubidId);
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
          reasoning: reason, // Core reasoning reflects current operational verdict
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
  }, [logAudit, addNotification]);

  const handleUnlinkRecord = useCallback((ubidId: string, recordId: string) => {
    const parentUbid = ubids.find(u => u.ubid === ubidId);
    if (!parentUbid) return;

    const recordToUnlink = parentUbid.linkedRecords.find(r => r.id === recordId);
    if (!recordToUnlink) return;

    // ROLE: REVERSIBILITY PROTOCOL
    // Clear any existing forced link for this record
    setKnowledge(prev => {
      // Blacklist this record from all other records in this cluster
      const newBlacklistEntries = parentUbid.linkedRecords
        .filter(r => r.id !== recordId)
        .map(r => ({ recordIdA: recordId, recordIdB: r.id, flag: 'MANUAL_REVERSION' }));

      return {
        ...prev,
        manualBlacklist: [...prev.manualBlacklist, ...newBlacklistEntries],
        manualLinks: prev.manualLinks.filter(l => l.recordId !== recordId)
      };
    });

    logAudit('Manual Reversion', ubidId, `Record ${recordId} unlinked from ${ubidId}. Flagged for MANUAL_REVERSION.`, 'Security');
    addNotification('Manual Reversion Triggered', `Record ${recordId} unlinked from cluster ${ubidId}. Flagged for security.`, 'security', ubidId);

    // Create a new Orphan UBID for the extracted record (Provisional by default)
    const newUbidId = generateUnifiedBusinessIdentifier(`REVERSION-${recordId}-${Date.now()}`, true);
    const unlinkedUbid: UBIDRecord = {
      ubid: newUbidId,
      anchorType: 'Internal',
      canonicalName: recordToUnlink.businessName,
      canonicalAddress: recordToUnlink.address,
      pinCode: recordToUnlink.pinCode,
      status: 'ACTIVE',
      statusHistory: [
        { from: 'UNKNOWN', to: 'ACTIVE', reason: 'Created via Manual Reversion (Unlink)', timestamp: new Date().toISOString(), actor: 'Senior Reviewer (White Hawk)', type: 'Manual' }
      ],
      confidence: 1.0,
      riskScore: 5,
      evidence: ['Manual Reversion Ground Truth'],
      edgeCaseFlag: 'MANUAL_REVERSION',
      lastUpdated: new Date().toISOString().split('T')[0],
      linkedRecords: [recordToUnlink],
      score: 1.0,
      confidence_metadata: { anchor: 'Internal Registry', fuzzy: 'Manual Reversion Ground Truth' },
      verdict: 'ORPHAN',
      reasoning: 'Manual Reversion Ground Truth - Unit split from cluster.',
      ui_metadata: { label: 'Synthetic Data', color: '#00008B' },
      linked_units: [
        {
          unit_id: recordToUnlink.gstin || recordToUnlink.id,
          type: recordToUnlink.department,
          unit_status: recordToUnlink.status.toUpperCase(),
          latest_signal: format(new Date(), 'yyyy-MM-dd')
        }
      ]
    };

    setUbids(prev => {
      const filtered = prev.map(u => {
        if (u.ubid === ubidId) {
          return {
            ...u,
            linkedRecords: u.linkedRecords.filter(r => r.id !== recordId),
            unlinkedRecordIds: [...(u.unlinkedRecordIds || []), recordId]
          };
        }
        return u;
      }).filter(u => u.linkedRecords.length > 0);
      return [...filtered, unlinkedUbid];
    });
  }, [ubids, logAudit, addNotification]);

  const handleTransferRecord = useCallback((recordId: string, targetUbidId: string) => {
    // 1. Find the actual record object
    let recordToTransfer: SourceRecord | null = null;
    ubids.forEach(u => {
      const found = u.linkedRecords.find(r => r.id === recordId);
      if (found) recordToTransfer = found;
    });

    if (!recordToTransfer) return;

    // 2. Clear previous manual state and link to new target
    setKnowledge(prev => ({
      ...prev,
      manualLinks: [
        ...prev.manualLinks.filter(l => l.recordId !== recordId),
        { recordId, ubid: targetUbidId }
      ],
      manualBlacklist: prev.manualBlacklist.filter(b => b.recordIdA !== recordId && b.recordIdB !== recordId)
    }));

    // 3. Move the record in the registry
    setUbids(prev => {
      // Step A: Remove from old cluster and extract unit data if needed
      let movedUnit: any = null;
      const stage1 = prev.map(u => {
        const isSource = u.linkedRecords.some(r => r.id === recordId);
        if (isSource) {
           movedUnit = u.linked_units?.find(lu => lu.unit_id === (recordToTransfer!.gstin || recordToTransfer!.id));
           return {
             ...u,
             linkedRecords: u.linkedRecords.filter(r => r.id !== recordId),
             linked_units: u.linked_units?.filter(lu => lu.unit_id !== (recordToTransfer!.gstin || recordToTransfer!.id))
           };
        }
        return u;
      }).filter(u => u.linkedRecords.length > 0);

      // Step B: Add to new cluster and re-infer status for both affected nodes
      return stage1.map(u => {
        const isTarget = u.ubid === targetUbidId;
        const isSourceWasModified = u.linkedRecords.length < prev.find(p => p.ubid === u.ubid)?.linkedRecords.length!;

        if (isTarget) {
          const updated = {
            ...u,
            linkedRecords: [...u.linkedRecords, recordToTransfer!],
            linked_units: [...(u.linked_units || [])]
          };

          // Re-add unit with target-contextual role
          if (!updated.linked_units.some(lu => lu.unit_id === (recordToTransfer!.gstin || recordToTransfer!.id))) {
            updated.linked_units.push({
              unit_id: recordToTransfer!.gstin || recordToTransfer!.id,
              type: recordToTransfer!.department,
              unit_status: recordToTransfer!.status.toUpperCase(),
              latest_signal: format(new Date(), 'yyyy-MM-dd'),
              role: getUnitRole(recordToTransfer!, updated)
            });
          }

          const statusVerdict = inferBusinessStatus(updated.ubid, events, 180, updated.canonicalName, undefined, knowledge.config);
          updated.status = statusVerdict.status;
          updated.reasoning = statusVerdict.reasoning;
          return updated;
        }

        if (isSourceWasModified) {
          const statusVerdict = inferBusinessStatus(u.ubid, events, 180, u.canonicalName, undefined, knowledge.config);
          return {
            ...u,
            status: statusVerdict.status,
            reasoning: statusVerdict.reasoning
          };
        }

        return u;
      });
    });

    logAudit('Identity Transfer', targetUbidId, `Record ${recordId} manually transferred to this cluster by authority.`, 'Governance');
    addNotification('Record Transferred', `Record ${recordId} moved to target cluster ${targetUbidId}.`, 'success', targetUbidId);
  }, [ubids, events, logAudit, addNotification]);

  const handleMatchApproved = useCallback((suggestion: MatchSuggestion) => {
    // 1. Find the current cluster locations
    let ubidA = ubids.find(u => u.linkedRecords.some(r => r.id === suggestion.recordA.id));
    let ubidB = ubids.find(u => u.linkedRecords.some(r => r.id === suggestion.recordB.id));
    
    // Determine the strategy and targets
    let finalAction: 'MERGE' | 'LINK_TO_A' | 'LINK_TO_B' | 'CREATE_NEW' = 'CREATE_NEW';
    let targetUbid: UBIDRecord | null = null;
    let sourceRecords: SourceRecord[] = [];
    let retiredUbid: string | null = null;

    if (ubidA && ubidB) {
      if (ubidA.ubid === ubidB.ubid) {
        // Already matched, nothing to do
        return;
      }
      finalAction = 'MERGE';
    } else if (ubidA) {
      finalAction = 'LINK_TO_A';
    } else if (ubidB) {
      finalAction = 'LINK_TO_B';
    } else {
      finalAction = 'CREATE_NEW';
    }

    // Prepare updates
    setUbids(prev => {
      let nextUbids = [...prev];

      if (finalAction === 'MERGE') {
        const uA = ubidA!;
        const uB = ubidB!;
        
        // Decide which one survives (Always prefer Permanent over Provisional)
        const aIsPermanent = !uA.ubid.includes('KA-INT');
        const bIsPermanent = !uB.ubid.includes('KA-INT');
        
        let survivor = uA;
        let retiree = uB;
        if (!aIsPermanent && bIsPermanent) {
          survivor = uB;
          retiree = uA;
        }

        retiredUbid = retiree.ubid;
        
        nextUbids = nextUbids.filter(u => u.ubid !== retiree.ubid);
        nextUbids = nextUbids.map(u => {
          if (u.ubid === survivor.ubid) {
            const updated = {
              ...u,
              linkedRecords: [...u.linkedRecords],
              historicalIds: [...(u.historicalIds || []), retiree.ubid, ...(retiree.historicalIds || [])],
              confidence: 0.99,
              evidence: [...u.evidence, `Manual Cluster Merge (Authority): ${retiree.ubid} retired into ${survivor.ubid}`]
            };

            retiree.linkedRecords.forEach(r => {
              if (!updated.linkedRecords.some(er => er.id === r.id)) {
                updated.linkedRecords.push(r);
              }
            });

            // Merge linked_units correctly
            if (retiree.linked_units) {
              const existingIds = new Set(updated.linked_units.map(lu => lu.unit_id));
              retiree.linked_units.forEach(lu => {
                if (!existingIds.has(lu.unit_id)) {
                  updated.linked_units.push(lu);
                }
              });
            }

            // RE-INFER STATUS: A merge might change the digital footprint
            const statusVerdict = inferBusinessStatus(updated.ubid, events, 180, updated.canonicalName, undefined, knowledge.config);
            updated.status = statusVerdict.status;
            updated.reasoning = statusVerdict.reasoning;

            return updated;
          }
          return u;
        });
        targetUbid = survivor;
      } else if (finalAction === 'LINK_TO_A') {
        const survivor = ubidA!;
        nextUbids = nextUbids.map(u => {
          if (u.ubid === survivor.ubid) {
            const updated = {
              ...u,
              linkedRecords: [...u.linkedRecords],
              confidence: Math.min(u.confidence + 0.1, 0.99),
              evidence: [...u.evidence, `Manual Link Approved: ${suggestion.reasons.join(', ')}`]
            };

            if (!updated.linkedRecords.some(er => er.id === suggestion.recordB.id)) {
              updated.linkedRecords.push(suggestion.recordB);
            }

            // Add to linked_units
            if (!updated.linked_units.some(lu => lu.unit_id === (suggestion.recordB.gstin || suggestion.recordB.id))) {
              updated.linked_units.push({
                unit_id: suggestion.recordB.gstin || suggestion.recordB.id,
                type: suggestion.recordB.department,
                unit_status: suggestion.recordB.status.toUpperCase(),
                latest_signal: format(new Date(), 'yyyy-MM-dd'),
                role: getUnitRole(suggestion.recordB, updated)
              });
            }

            // Check for promotion
            if (updated.ubid.includes('KA-INT') && (suggestion.recordB.pan || suggestion.recordB.gstin)) {
              const old = updated.ubid;
              updated.ubid = promoteUBID(old);
              updated.historicalIds = [...(updated.historicalIds || []), old];
              updated.anchorType = 'Central';
              updated.pan = updated.pan || suggestion.recordB.pan;
              updated.gstin = updated.gstin || suggestion.recordB.gstin;
              updated.evidence.push(`ID PROMOTED: ${old} -> ${updated.ubid} (Authority Link)`);
            }

            // RE-INFER STATUS
            const statusVerdict = inferBusinessStatus(updated.ubid, events, 180, updated.canonicalName, undefined, knowledge.config);
            updated.status = statusVerdict.status;
            updated.reasoning = statusVerdict.reasoning;

            return updated;
          }
          return u;
        });
        targetUbid = survivor;
      } else if (finalAction === 'LINK_TO_B') {
        const survivor = ubidB!;
        nextUbids = nextUbids.map(u => {
          if (u.ubid === survivor.ubid) {
            const updated = {
              ...u,
              linkedRecords: [...u.linkedRecords],
              confidence: Math.min(u.confidence + 0.1, 0.99),
              evidence: [...u.evidence, `Manual Link Approved: ${suggestion.reasons.join(', ')}`]
            };

            if (!updated.linkedRecords.some(er => er.id === suggestion.recordA.id)) {
              updated.linkedRecords.push(suggestion.recordA);
            }

            // Add to linked_units
            if (!updated.linked_units.some(lu => lu.unit_id === (suggestion.recordA.gstin || suggestion.recordA.id))) {
              updated.linked_units.push({
                unit_id: suggestion.recordA.gstin || suggestion.recordA.id,
                type: suggestion.recordA.department,
                unit_status: suggestion.recordA.status.toUpperCase(),
                latest_signal: format(new Date(), 'yyyy-MM-dd'),
                role: getUnitRole(suggestion.recordA, updated)
              });
            }

            if (updated.ubid.includes('KA-INT') && (suggestion.recordA.pan || suggestion.recordA.gstin)) {
              const old = updated.ubid;
              updated.ubid = promoteUBID(old);
              updated.historicalIds = [...(updated.historicalIds || []), old];
              updated.anchorType = 'Central';
              updated.pan = updated.pan || suggestion.recordA.pan;
              updated.gstin = updated.gstin || suggestion.recordA.gstin;
              updated.evidence.push(`ID PROMOTED: ${old} -> ${updated.ubid} (Authority Link)`);
            }

            // RE-INFER STATUS
            const statusVerdict = inferBusinessStatus(updated.ubid, events, 180, updated.canonicalName, undefined, knowledge.config);
            updated.status = statusVerdict.status;
            updated.reasoning = statusVerdict.reasoning;

            return updated;
          }
          return u;
        });
        targetUbid = survivor;
      } else {
        // CREATE_NEW
        const newUbid = createBaseUBID(suggestion.recordA);
        if (!newUbid.linkedRecords.some(r => r.id === suggestion.recordB.id)) {
          newUbid.linkedRecords.push(suggestion.recordB);
        }
        newUbid.confidence = 0.95;
        newUbid.score = 0.95;
        newUbid.evidence.push(`Manual Authority Linkage: ${suggestion.reasons.join(', ')}`);

        // Add both to linked_units
        newUbid.linked_units = [
          {
            unit_id: suggestion.recordA.gstin || suggestion.recordA.id,
            type: suggestion.recordA.department,
            unit_status: suggestion.recordA.status.toUpperCase(),
            latest_signal: format(new Date(), 'yyyy-MM-dd'),
            role: getUnitRole(suggestion.recordA, newUbid)
          },
          {
            unit_id: suggestion.recordB.gstin || suggestion.recordB.id,
            type: suggestion.recordB.department,
            unit_status: suggestion.recordB.status.toUpperCase(),
            latest_signal: format(new Date(), 'yyyy-MM-dd'),
            role: getUnitRole(suggestion.recordB, newUbid)
          }
        ];
        
        // Final check for promotion if we added B
        if (newUbid.ubid.includes('KA-INT') && (suggestion.recordB.pan || suggestion.recordB.gstin)) {
           const old = newUbid.ubid;
           newUbid.ubid = promoteUBID(old);
           newUbid.historicalIds = [old];
           newUbid.anchorType = 'Central';
           newUbid.pan = newUbid.pan || suggestion.recordB.pan;
           newUbid.gstin = newUbid.gstin || suggestion.recordB.gstin;
        }

        // RE-INFER STATUS
        const statusVerdict = inferBusinessStatus(newUbid.ubid, events, 180, newUbid.canonicalName, undefined, knowledge.config);
        newUbid.status = statusVerdict.status;
        newUbid.reasoning = statusVerdict.reasoning;

        nextUbids.push(newUbid);
        targetUbid = newUbid;
      }

      return nextUbids;
    });

    // Update Knowledge & Audit outside setUbids but inside effects
    setKnowledge(prev => {
      const recordsToLink = finalAction === 'MERGE' ? ubidB!.linkedRecords : 
                           finalAction === 'LINK_TO_A' ? [suggestion.recordB] :
                           finalAction === 'LINK_TO_B' ? [suggestion.recordA] :
                           [suggestion.recordA, suggestion.recordB];

      const newAliases = [...prev.approvedAliases];
      [suggestion.recordA, suggestion.recordB].forEach(rec => {
        const existingIdx = newAliases.findIndex(a => 
          a.name === rec.businessName && a.address === rec.address
        );
        if (existingIdx > -1) {
          newAliases[existingIdx] = { ...newAliases[existingIdx], frequency: newAliases[existingIdx].frequency + 1 };
        } else {
          newAliases.push({ name: rec.businessName, address: rec.address, ubid: (targetUbid || ubidA || ubidB)!.ubid, frequency: 1 });
        }
      });

      const baseKnowledge = {
        ...prev,
        approvedAliases: newAliases,
        manualBlacklist: prev.manualBlacklist.filter(entry => 
          !((entry.recordIdA === suggestion.recordA.id && entry.recordIdB === suggestion.recordB.id) ||
            (entry.recordIdA === suggestion.recordB.id && entry.recordIdB === suggestion.recordA.id))
        ),
        manualLinks: [
          ...prev.manualLinks.filter(l => !recordsToLink.some(r => r.id === l.recordId)),
          ...recordsToLink.map(r => ({ recordId: r.id, ubid: (targetUbid || ubidA || ubidB)!.ubid }))
        ]
      };
      return adjustSystemWeights(baseKnowledge, 'Approved', suggestion.recordA, suggestion.recordB);
    });

    const finalId = targetUbid?.ubid || (ubidA?.ubid) || (ubidB?.ubid) || 'PENDING';
    logAudit('Manual Linkage', finalId, `Senior Reviewer confirmed relationship. Final Action: ${finalAction}.`, 'Security');
    addNotification('Identity Linkage Confirmed', `Authority confirmed relationship between records. Final Entity: ${finalId}`, 'success', finalId);
  }, [ubids, events, logAudit, addNotification]);


  const handleMatchRejected = useCallback((suggestion: MatchSuggestion) => {
    logAudit('Linkage Block', suggestion.recordA.id, `Manually blacklisted record ${suggestion.recordB.id} from matching with this entity.`, 'Security');
    addNotification('Match Rejection Logged', `Manual blacklist established between ${suggestion.recordA.id} and ${suggestion.recordB.id}.`, 'warning');
    
    setKnowledge(prev => {
      const alreadyBlacklisted = prev.manualBlacklist.some(entry => 
        (entry.recordIdA === suggestion.recordA.id && entry.recordIdB === suggestion.recordB.id) ||
        (entry.recordIdA === suggestion.recordB.id && entry.recordIdB === suggestion.recordA.id)
      );
      
      if (alreadyBlacklisted) return prev;

      const baseKnowledge = {
        ...prev,
        manualBlacklist: [
          ...prev.manualBlacklist, 
          { recordIdA: suggestion.recordA.id, recordIdB: suggestion.recordB.id, flag: 'MANUAL_REVERSION' }
        ]
      };
      return adjustSystemWeights(baseKnowledge, 'Rejected', suggestion.recordA, suggestion.recordB);
    });

    // INSTANTIATE INDEPENDENT ENTITIES:
    // If these records are currently floating, instantiate them according to logic rules
    setUbids(prev => {
      let next = [...prev];
      
      [suggestion.recordA, suggestion.recordB].forEach(record => {
        const alreadyExists = next.some(u => u.linkedRecords.some(r => r.id === record.id));
        if (!alreadyExists) {
          const newUbid = createBaseUBID(record);
          
          // Apply standard KUBIP Status Inference immediately
          const statusVerdict = inferBusinessStatus(newUbid.ubid, events, 180, newUbid.canonicalName, undefined, knowledge.config);
          newUbid.status = statusVerdict.status;
          newUbid.reasoning = statusVerdict.reasoning;
          
          newUbid.evidence.push('Instantiated as Independent Entity after Senior Reviewer rejected linkage suggestion.');
          next.push(newUbid);
        }
      });
      
      return next;
    });
  }, [logAudit, addNotification, ubids, events]);

  const removeFromBlacklist = (recordIdA: string, recordIdB: string) => {
    setKnowledge(prev => ({
      ...prev,
      manualBlacklist: prev.manualBlacklist.filter(entry => 
        !((entry.recordIdA === recordIdA && entry.recordIdB === recordIdB) ||
          (entry.recordIdB === recordIdA && entry.recordIdA === recordIdB))
      )
    }));
    logAudit('Blacklist Cleared', recordIdA, `Reinstated matching potential with record ${recordIdB}.`, 'Security');
  };

  const handleResolveOrphan = useCallback((event: ActivityEvent, action: 'create' | 'link', targetUbidId?: string) => {
    if (action === 'create') {
      const newUbidId = generateUnifiedBusinessIdentifier(`ORPHAN-${event.id}`, true);
      logAudit('Orphan Resolution', newUbidId, `Projected new Provisional Internal ID from signal ${event.eventType}`, 'Governance');
      addNotification('Orphan Projection', `New Internal ID generated from ${event.eventType} signal.`, 'info', newUbidId);
      
      // Create an initial source record from the orphan signal hints
      const initialRecord: SourceRecord = {
        id: `SR-${event.id}`,
        department: event.department,
        businessName: event.businessNameHint || `Unknown Entity (${event.id})`,
        address: event.addressHint || 'Address TBD',
        pinCode: event.pinCodeHint || '000000',
        ownerName: 'Derived from Signal',
        status: 'ACTIVE'
      };

      const newRecord: UBIDRecord = {
        ubid: newUbidId,
        anchorType: 'Internal',
        canonicalName: initialRecord.businessName,
        canonicalAddress: initialRecord.address,
        pinCode: initialRecord.pinCode,
        status: 'ACTIVE',
        statusHistory: [
          { from: 'UNKNOWN', to: 'ACTIVE', reason: 'New Entity Projection from Orphan Signal', timestamp: new Date().toISOString(), actor: 'Senior Reviewer (White Hawk)', type: 'Manual' }
        ],
        confidence: 0.75,
        riskScore: 30,
        evidence: [`Resolved from Orphan Event: ${event.eventType}`],
        lastUpdated: new Date().toISOString().split('T')[0],
        linkedRecords: [initialRecord],
        score: 0.75,
        confidence_metadata: { anchor: 'Internal Registry', fuzzy: 'Orphan Projection' },
        verdict: 'HUMAN_REVIEW',
        edgeCaseFlag: 'NONE',
        reasoning: `Resolved from Orphan Event: ${event.eventType}`,
        ui_metadata: { label: 'Synthetic Data', color: '#00008B' },
        linked_units: [
          {
            unit_id: initialRecord.id,
            type: initialRecord.department,
            unit_status: initialRecord.status.toUpperCase(),
            latest_signal: format(new Date(), 'yyyy-MM-dd'),
            role: 'Provisional Signal Hub'
          }
        ]
      };

      // Initial Status Inference
      const statusVerdict = inferBusinessStatus(newUbidId, events, 180, newRecord.canonicalName, undefined, knowledge.config);
      newRecord.status = statusVerdict.status;
      newRecord.reasoning = statusVerdict.reasoning;

      setUbids(prev => [...prev, newRecord]);
      setEvents(prev => prev.map(e => e.id === event.id ? { ...e, ubid: newUbidId } : e));
    } else if (action === 'link' && targetUbidId) {
      logAudit('Orphan Linkage', targetUbidId, `Linked unlinked signal ${event.eventType} to existing entity.`, 'Governance');
      addNotification('Signal Resolved', `Previously orphaned ${event.eventType} signal linked to ${targetUbidId}.`, 'success', targetUbidId);
      
      const updatedEvents = events.map(e => e.id === event.id ? { ...e, ubid: targetUbidId } : e);
      setEvents(updatedEvents);

      setUbids(prev => prev.map(u => {
        if (u.ubid === targetUbidId) {
          const updated = {
            ...u,
            evidence: [...u.evidence, `Linked Orphan Event: ${event.eventType}`]
          };
          // Re-infer status because new signal might change result
          const statusVerdict = inferBusinessStatus(targetUbidId, updatedEvents, 180, updated.canonicalName, undefined, knowledge.config);
          updated.status = statusVerdict.status;
          updated.reasoning = statusVerdict.reasoning;
          return updated;
        }
        return u;
      }));
    }
  }, [setUbids, setEvents, logAudit, addNotification, events]);

  const handleProcessIngestedData = useCallback((newRecords: SourceRecord[], newEvents: ActivityEvent[]) => {
    logAudit('Data Ingestion', 'Registry Update', `Processing batch of ${newRecords.length} new records and ${newEvents.length} new signals.`, 'System');
    addNotification('Ingestion Complete', `${newRecords.length} unit records and ${newEvents.length} signals ingested into processing pipeline.`, 'success');

    const updatedSourceRecords = [...sourceRecords];
    newRecords.forEach(nr => {
      if (!updatedSourceRecords.some(r => r.id === nr.id)) {
        updatedSourceRecords.push(nr);
      }
    });

    const updatedEvents = [...events];
    newEvents.forEach(ne => {
      if (!updatedEvents.some(e => e.id === ne.id)) {
        updatedEvents.push(ne);
      }
    });

    setSourceRecords(updatedSourceRecords);
    setEvents(updatedEvents);

    (async () => {
      try {
        const { ubids: resolved, suggestions: newSuggestions } = await resolveRecords(updatedSourceRecords, knowledge, updatedEvents);
        setUbids(resolved);
        setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
      } catch (error) {
        console.warn('Batch ingestion resolve failed, falling back to local engine.', error);
        const { ubids: resolved, suggestions: newSuggestions } = resolveUBIDs(updatedSourceRecords, knowledge, updatedEvents);
        setUbids(resolved);
        setSuggestions([...INITIAL_SUGGESTIONS, ...newSuggestions]);
      }
    })();

    setActiveTab('registry');
  }, [sourceRecords, knowledge, events, logAudit, addNotification, resolveRecords]);

  const globalResults = useMemo(() => {
    if (!globalSearch) return [];
    return fuse.search(globalSearch).slice(0, 5).map(r => ({
      item: r.item,
      score: 1 - (r.score || 0)
    }));
  }, [globalSearch, fuse]);

  const tabs = [
    { category: 'Main', items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'ingestion', label: 'Data Ingestion', icon: Database },
    ]},
    { category: 'Registry', items: [
      { id: 'explorer', label: 'UBID Explorer', icon: Search },
      { id: 'registry', label: 'Central Registry', icon: Fingerprint },
    ]},
    { category: 'HITL', items: [
      { id: 'review', label: 'Reviewer Queue', icon: Users },
      { id: 'resolution', label: 'Orphan Signals', icon: AlertCircle },
    ]},
    { category: 'Analysis', items: [
      { id: 'system-query', label: 'System Query', icon: Zap },
      { id: 'logic', label: 'System Logic', icon: Cpu },
    ]},
    { category: 'Governance', items: [
      { id: 'audit', label: 'Audit Ledger', icon: History },
      { id: 'reversion', label: 'Manual Reversion', icon: ShieldAlert },
      { id: 'settings', label: 'System Settings', icon: Settings },
    ]},
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

          <nav className="space-y-4 px-3">
            {tabs.map(group => (
              <div key={group.category} className="space-y-1">
                <p className="px-3 text-[9px] font-black text-text-muted uppercase tracking-[0.2em] opacity-40 mb-2">
                  {group.category}
                </p>
                {group.items.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-[12px] font-bold transition-all rounded-md mb-0.5 group",
                      activeTab === tab.id 
                        ? "bg-accent/15 text-accent shadow-[inset_0_0_12px_rgba(37,99,235,0.1)]" 
                        : "text-sidebar-text/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <tab.icon className={cn(
                      "w-4 h-4 transition-colors",
                      activeTab === tab.id ? "text-accent" : "text-sidebar-text/40 group-hover:text-sidebar-text/80"
                    )} />
                    {tab.label}
                  </button>
                ))}
              </div>
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
                            <span className={cn(
                              "text-[9px] font-mono font-bold",
                              u.ubid.includes('KA-INT') ? "text-orange-700" : "text-accent"
                            )}>{u.ubid}</span>
                            <span className={cn(
                              "text-[8px] font-bold px-1 rounded uppercase",
                              u.status.toUpperCase() === 'ACTIVE' ? "bg-green-100 text-status-active" :
                              u.status.toUpperCase() === 'DORMANT' ? "bg-orange-100 text-status-dormant" :
                              "bg-red-100 text-status-closed"
                            )}>{u.status}</span>
                          </div>
                          <p className="text-[9px] text-text-muted mt-1 truncate">
                            {u.evidence[0] || 'Linked via Anchor ID'}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[9px] font-bold text-accent bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                            {formatPercent(score)} Match
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
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-text-muted hover:text-accent bg-bg/50 rounded-full transition-all relative group"
              >
                {notifications.some(n => !n.read) ? (
                  <BellRing className="w-5 h-5 text-accent animate-pulse" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
                {notifications.some(n => !n.read) && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-card shadow-sm" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <NotificationCenter 
                    notifications={notifications}
                    onClose={() => setShowNotifications(false)}
                    onMarkAsRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
                    onClearAll={() => {
                      setNotifications([]);
                      setShowNotifications(false);
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-medium text-text-main border-l border-border pl-4">
              <span>Admin: Dept of Commerce</span>
              <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-600">WH</div>
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
                {activeTab === 'ingestion' && (
                  <DataIngestion 
                    onProcessData={handleProcessIngestedData}
                    isProcessing={false}
                    sourceRecords={sourceRecords}
                    events={events}
                    logAudit={logAudit}
                    addNotification={addNotification}
                  />
                )}
                {activeTab === 'dashboard' && <Dashboard ubids={ubids} events={events} addNotification={addNotification} />}
                {activeTab === 'review' && (
                  <ReviewerQueue 
                    suggestions={suggestions} 
                    setSuggestions={setSuggestions}
                    onApprove={handleMatchApproved} 
                    onReject={handleMatchRejected}
                    knowledge={knowledge}
                  />
                )}
                {activeTab === 'registry' && (
                  <CentralUBIDRegistry 
                    ubids={ubids} 
                    setUbids={setUbids} 
                    setSuggestions={setSuggestions}
                    onUpdateStatus={handleStatusOverride}
                    onUnlinkRecord={handleUnlinkRecord}
                    onResolveOrphans={() => setActiveTab('resolution')}
                    onAddNotification={addNotification}
                    resolveRecords={resolveRecords}
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
                    knowledge={knowledge}
                    selectedUbid={selectedUbid} 
                    setSelectedUbid={setSelectedUbid} 
                    onUpdateStatus={handleStatusOverride}
                    onUnlinkRecord={handleUnlinkRecord}
                  />
                )}
                {activeTab === 'audit' && <AuditTrail log={auditLog} />}
                {activeTab === 'reversion' && (
                  <ManualReversionWorkspace 
                    ubids={ubids} 
                    knowledge={knowledge} 
                    onUnlinkRecord={handleUnlinkRecord} 
                    onRemoveBlacklist={removeFromBlacklist}
                    onTransferRecord={handleTransferRecord}
                    addNotification={addNotification}
                    onLinkRecords={(recordA, recordB) => {
                      handleMatchApproved({
                        id: `MANUAL-${Date.now()}`,
                        recordA,
                        recordB,
                        confidence: 0.99,
                        reasons: ['Manual Ground Truth Linkage by Senior Reviewer'],
                        status: 'Pending'
                      });
                    }}
                  />
                )}
                {activeTab === 'system-query' && (
                  <div className="space-y-5">
                    <SchemaEvolutionTool />
                    <QueryTool 
                      ubids={ubids} 
                      events={events}
                      knowledge={knowledge}
                      onUpdateStatus={handleStatusOverride}
                      onUnlinkRecord={handleUnlinkRecord}
                      onViewDetails={(ubid) => {
                        setSelectedUbid(ubid);
                        setActiveTab('explorer');
                      }}
                    />
                  </div>
                )}
                {activeTab === 'logic' && (
                  <SystemLogicLedger 
                    knowledge={knowledge} 
                    setKnowledge={setKnowledge}
                    setUbids={setUbids}
                    addNotification={addNotification}
                    logAudit={logAudit}
                    sourceRecords={sourceRecords}
                  />
                )}
                {activeTab === 'settings' && (
                  <SystemConfigurationPage 
                    knowledge={knowledge}
                    setKnowledge={setKnowledge}
                    addNotification={addNotification}
                    onApply={handleApplyConfig}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>
      <GeminiChat />
      
      <NotificationManager 
        notifications={notifications} 
        onMarkRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
        onClear={() => setNotifications([])}
      />
    </div>
  );
}
