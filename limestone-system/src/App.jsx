import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle, TrendingUp, Bus, Calendar, ChevronRight, LogOut, AlertCircle, CheckCircle2, Wallet, X, CheckCheck, Download, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase Initialization ─────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ─── Constants & Utils ───────────────────────────────────────────────────────
const INITIAL_CONFIG = {
  supplier: { name: "Hamoney Investments Limited", address: "Plot 123, Independence Ave, Ndola", phone: "+260 971 234 567", email: "info@hamoney.com" },
  client: { name: "Limestone Resources Limited", address: "Copperbelt Road, Ndola", contact: "Operations Manager" },
  banks: [
    { id: 1, name: "Stanbic Bank", account: "904000123456", branch: "Ndola", swift: "SBICZM", active: true },
    { id: 2, name: "ZANACO", account: "5800123456789", branch: "Main", swift: "ZNCOZM", active: false }
  ]
};

const INITIAL_PO = { number: "PO-001", startDate: "2026-04-23", tripsAuthorised: 63, rate: 790, status: "IN PROGRESS" };
const PUBLIC_HOLIDAYS = ['2026-04-28', '2026-05-01'];

const getWorkingDays = (start, end) => {
  const days = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const iso = cur.toISOString().split('T')[0];
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = PUBLIC_HOLIDAYS.includes(iso);
    days.push({ iso, label: cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), dayName: cur.toLocaleDateString('en-GB', { weekday: 'short' }), isWorking: !isWeekend && !isHoliday, reason: isHoliday ? 'Public Holiday' : isWeekend ? 'Weekend' : null });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// ─── Export Helpers ──────────────────────────────────────────────────────────
const exportToPDF = (logs) => {
  const doc = new jsPDF();
  doc.setFontSize(14); doc.text('Hamoney Investments — Trip Log Report', 14, 16);
  autoTable(doc, {
    startY: 28,
    head: [['Date', 'Route', 'Shift', 'Sched', 'Actual', 'PAX', 'Status']],
    body: logs.map(l => [l.date, l.route, l.type, l.sched, l.actual, l.pax, l.status]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [16, 185, 129] },
  });
  doc.save('hamoney_trip_logs.pdf');
};

const exportToExcel = (logs) => {
  const rows = logs.map(l => ({ Date: l.date, Route: l.route, Shift: l.type, Sched: l.sched, Actual: l.actual, PAX: l.pax, Status: l.status }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Logs');
  XLSX.writeFile(wb, 'hamoney_trip_logs.xlsx');
};

const exportInvoicePDF = (config, po, logs) => {
  const doc = new jsPDF();
  const total = logs.length * po.rate;
  doc.setFontSize(22); doc.setTextColor(16, 185, 129); doc.text('INVOICE', 140, 25);
  doc.setFontSize(12); doc.setTextColor(0); doc.text(config.supplier.name, 14, 25);
  autoTable(doc, {
    startY: 95,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: [[`Logistics Services for ${po.number}`, logs.length, `K ${po.rate}`, `K ${total.toLocaleString()}`]],
    headStyles: { fillColor: [16, 185, 129] },
  });
  doc.save(`Invoice_${po.number}.pdf`);
};

// ─── Main App Component ──────────────────────────────────────────────────────
const App = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // 1. Fetch Data from Supabase
  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setLoading(false);
        const savedLogs = localStorage.getItem('limestone_logs_v2');
        if (savedLogs) setLogs(JSON.parse(savedLogs));
        return;
      }

      try {
        const { data: logData, error: logError } = await supabase
          .from('trip_logs')
          .select('*')
          .order('iso_date', { ascending: false });

        const { data: configData, error: configError } = await supabase
          .from('system_config')
          .select('data')
          .eq('id', 'main_config')
          .single();

        if (logData && logData.length > 0) setLogs(logData);
        if (configData) setConfig(configData.data);
      } catch (err) {
        console.error("Supabase fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Sync Actions
  const saveLog = async (log) => {
    if (!supabase) return;
    setSyncing(true);
    const { error } = await supabase
      .from('trip_logs')
      .upsert({ 
        id: log.id, 
        date: log.date, 
        iso_date: log.isoDate, 
        route: log.route, 
        type: log.type, 
        sched: log.sched, 
        actual: log.actual, 
        pax: parseInt(log.pax), 
        status: log.status 
      });
    if (error) console.error("Sync error:", error);
    setSyncing(false);
  };

  const saveConfig = async (newConfig) => {
    if (!supabase) return;
    setSyncing(true);
    const { error } = await supabase
      .from('system_config')
      .upsert({ id: 'main_config', data: newConfig });
    if (error) console.error("Config sync error:", error);
    setSyncing(false);
  };

  const addTrip = (trip) => {
    const newLog = { 
      ...trip, 
      id: `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`, 
      status: trip.actual <= trip.sched ? 'On Time' : 'Late', 
      date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) 
    };
    setLogs([newLog, ...logs]);
    setShowAddModal(false);
    saveLog(newLog);
  };

  const activePO = { ...INITIAL_PO, tripsCompleted: logs.length };

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05060f] text-emerald-400">
      <Loader2 className="animate-spin mb-4" size={48} />
      <p className="text-slate-400 font-medium tracking-widest uppercase text-xs">Connecting to Supabase Cloud...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="bg-glow" />
      
      <aside className="sidebar glass">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500"><Bus size={28} /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Hamoney</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[2px]">Supabase Integrated</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'logs', label: 'Trip Logs', icon: ClipboardList },
            { id: 'pos', label: 'PO Reconciliation', icon: Wallet },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'config', label: 'Configuration', icon: Settings },
          ].map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${currentView === item.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'}`}>
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        
        <div className="px-4 py-3 bg-white/5 rounded-xl flex items-center gap-3 text-xs text-slate-500 mb-6 border border-white/5">
          {syncing ? <Loader2 size={14} className="animate-spin text-emerald-400" /> : <Cloud size={14} className={supabase ? "text-emerald-400" : "text-amber-400"} />}
          <span>{!supabase ? 'Using Local Storage' : syncing ? 'Syncing...' : 'Supabase Live'}</span>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-rose-400 transition-colors">
            <LogOut size={20} /><span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-bold text-white mb-1 uppercase tracking-tight">{currentView}</h2>
            <div className="h-6 w-px bg-white/10 mx-2" />
            <p className="text-slate-400 text-sm">{activePO.number} • {logs.length} Trips</p>
          </div>
          <div className="flex items-center gap-4">
            {!supabase && <div className="text-[10px] text-amber-500 font-bold bg-amber-500/10 px-3 py-2 rounded-lg uppercase tracking-wider border border-amber-500/20">Add Supabase Keys to Netlify</div>}
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><PlusCircle size={18} /><span>New Trip</span></button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {currentView === 'dashboard' && <DashboardView po={activePO} logs={logs} />}
            {currentView === 'logs' && <LogsView logs={logs} />}
            {currentView === 'pos' && <ReconciliationView logs={logs} po={activePO} />}
            {currentView === 'invoices' && <InvoiceView config={config} po={activePO} logs={logs} />}
            {currentView === 'config' && <ConfigView config={config} setConfig={(c) => { setConfig(c); saveConfig(c); }} />}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showAddModal && <AddTripModal onClose={() => setShowAddModal(false)} onSave={addTrip} />}
        </AnimatePresence>
      </main>
    </div>
  );
};

// ─── Sub-Components ──────────────────────────────────────────────────────────
const DashboardView = ({ po, logs }) => {
  const percent = Math.min((po.tripsCompleted / po.tripsAuthorised) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const late = logs.filter(l => l.status === 'Late').length;

  return (
    <div className="space-y-8">
      <div className="glass glass-card flex items-center justify-between p-8 border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -mr-32 -mt-32" />
        <div className="space-y-4 flex-1 relative z-10">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs tracking-widest uppercase"><TrendingUp size={16} /><span>Revenue Overview</span></div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-400">{po.tripsCompleted} / {po.tripsAuthorised} Trips</span><span className="text-emerald-400 font-bold">{Math.round(percent)}%</span></div>
            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400" /></div>
          </div>
        </div>
        <div className="flex gap-12 pl-12 border-l border-white/5 relative z-10">
          <div className="text-center"><p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Total Earned</p><p className="text-3xl font-black text-white">K {revenue.toLocaleString()}</p></div>
          <div className="text-center"><p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Unused</p><p className="text-3xl font-black text-amber-500">{po.tripsAuthorised - po.tripsCompleted}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Cloud Database', val: 'Supabase', sub: 'Real-time Sync', icon: Cloud, color: 'text-emerald-400' },
          { label: 'Logistics Score', val: '98%', sub: 'On-time performance', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Late Trips', val: late, sub: 'Requires Review', icon: AlertCircle, color: late > 0 ? 'text-rose-400' : 'text-slate-400' },
        ].map((kpi, i) => (
          <div key={i} className="glass glass-card border border-white/5 p-6 hover:bg-white/[0.03] transition-colors">
            <div className={`p-2 w-fit rounded-lg bg-white/5 ${kpi.color} mb-4`}><kpi.icon size={20} /></div>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{kpi.label}</p>
            <p className="text-3xl font-black text-white mt-1">{kpi.val}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const LogsView = ({ logs }) => {
  const [activeRoute, setActiveRoute] = useState('Chifubu');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const filteredLogs = logs.filter(l => l.route === activeRoute);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4 p-1 bg-white/5 w-fit rounded-xl border border-white/5">
          {['Chifubu', 'Lubuto'].map(r => (
            <button key={r} onClick={() => setActiveRoute(r)} className={`px-8 py-2 rounded-lg transition-all text-sm font-bold ${activeRoute === r ? 'bg-white/10 text-emerald-400 shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}>{r}</button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-glass gap-2 border-white/10"><Download size={16} /><span>Export Logs</span></button>
          {showExportMenu && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 mt-2 w-56 glass rounded-xl border border-white/10 z-20 overflow-hidden shadow-2xl">
              <button onClick={() => { exportToPDF(logs); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold text-slate-300">📄 Export PDF Report</button>
              <button onClick={() => { exportToExcel(logs); setShowExportMenu(false); }} className="w-full text-left px-4 py-3 hover:bg-white/5 text-xs font-bold text-slate-300 border-t border-white/5">📊 Export Excel Sheet</button>
            </motion.div>
          )}
        </div>
      </div>
      <div className="glass glass-card p-0 overflow-hidden border border-white/5">
        <table className="data-table">
          <thead><tr className="bg-white/2 text-[10px] uppercase tracking-widest text-slate-500"><th className="py-4">Date</th><th>Shift</th><th>Sched</th><th>Actual</th><th>PAX</th><th className="text-right">Status</th></tr></thead>
          <tbody>
            {filteredLogs.map(row => (
              <tr key={row.id} className="hover:bg-white/[0.01] transition-colors border-t border-white/5">
                <td className="font-bold text-slate-300">{row.date}</td>
                <td><span className="px-2 py-1 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-500 uppercase tracking-tighter">{row.type}</span></td>
                <td className="text-slate-500 font-mono text-xs">{row.sched}</td>
                <td className="text-white font-black font-mono text-xs">{row.actual}</td>
                <td className="font-bold text-slate-400">{row.pax}</td>
                <td className="text-right"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/20 text-amber-500 border border-amber-500/20'}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ReconciliationView = ({ logs, po }) => {
  const allDays = getWorkingDays('2026-04-23', '2026-05-11');
  const hasLog = (isoDate, route, type) => logs.some(l => l.iso_date === isoDate && l.route === route && l.type === type);
  let runningTotal = 0;

  return (
    <div className="glass glass-card p-0 overflow-hidden border border-white/5">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr className="bg-white/2 text-[10px] uppercase tracking-widest text-slate-500">
              <th className="py-4">Date</th><th>Day</th><th className="text-center">Chifubu AM</th><th className="text-center">Chifubu PM</th><th className="text-center">Lubuto AM</th><th className="text-center">Lubuto PM</th><th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {allDays.map(day => {
              const tripsToday = day.isWorking ? logs.filter(l => l.iso_date === day.iso).length : 0;
              if (day.isWorking) runningTotal += tripsToday;
              return (
                <tr key={day.iso} className={`border-t border-white/5 ${!day.isWorking ? 'opacity-20' : 'hover:bg-white/[0.01]'}`}>
                  <td className="font-bold text-xs text-slate-300">{day.label}</td>
                  <td className="text-[10px] text-slate-500 font-bold">{day.isWorking ? day.dayName : day.reason}</td>
                  {day.isWorking ? [['Chifubu', 'Morning'], ['Chifubu', 'Day Shift'], ['Lubuto', 'Morning'], ['Lubuto', 'Day Shift']].map(([r, t]) => (
                    <td key={`${r}-${t}`} className="text-center font-bold text-lg">{hasLog(day.iso, r, t) ? <span className="text-emerald-500">✓</span> : <span className="text-rose-500 opacity-20">✗</span>}</td>
                  )) : <td colSpan={4} className="text-center text-[10px] text-slate-600 italic font-medium tracking-widest">NO SERVICE</td>}
                  <td className="text-right font-mono text-emerald-400 font-bold text-xs">{day.isWorking ? runningTotal : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const InvoiceView = ({ config, po, logs }) => {
  const totalAmount = logs.length * po.rate;
  const activeBank = config.banks.find(b => b.active) || config.banks[0];

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><button onClick={() => exportInvoicePDF(config, po, logs)} className="btn btn-primary gap-2 px-8 py-4 shadow-emerald-500/20 shadow-2xl"><FileText size={18} /><span>Generate PDF Invoice</span></button></div>
      <div className="glass p-16 rounded-3xl bg-white/[0.01] text-slate-300 max-w-5xl mx-auto border border-white/5 shadow-2xl">
        <div className="flex justify-between mb-16">
          <div><h4 className="text-3xl font-black text-emerald-400 mb-2 uppercase tracking-tighter">{config.supplier.name}</h4><p className="text-xs opacity-40 max-w-[200px] leading-relaxed">{config.supplier.address}</p></div>
          <div className="text-right"><h2 className="text-7xl font-black text-white/5 mb-[-20px] tracking-tighter">INVOICE</h2><p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Date: {new Date().toLocaleDateString('en-GB')}</p></div>
        </div>
        <div className="mb-16"><p className="text-[10px] uppercase tracking-[4px] text-emerald-500 font-black mb-4">CLIENT DETAILS</p><h5 className="text-2xl font-black text-white mb-2">{config.client.name}</h5><p className="text-xs opacity-40 max-w-[250px] leading-relaxed">{config.client.address}</p></div>
        <div className="border-y border-white/5 py-12 mb-16">
          <table className="w-full">
            <thead><tr className="text-[10px] uppercase tracking-widest text-slate-500 text-left"><th className="pb-6">Description</th><th className="pb-6 text-center">Qty</th><th className="pb-6 text-right">Amount</th></tr></thead>
            <tbody className="text-white"><tr><td className="py-4"><p className="text-lg font-black tracking-tight text-white/90">Logistics Services: {po.number}</p><p className="text-xs text-slate-600 mt-2 font-medium">Provision of transport services for staff commuting as per agreement.</p></td><td className="py-4 text-center font-mono text-xl">{logs.length}</td><td className="py-4 text-right font-black text-2xl text-emerald-400 font-mono">K {totalAmount.toLocaleString()}</td></tr></tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-12 pt-8 border-t border-white/5">
          <div className="space-y-2"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-4">BANKING INFO</p><p className="text-sm font-black text-white">{activeBank.name}</p><p className="text-xs opacity-40 font-mono">ACC: {activeBank.account}</p><p className="text-xs opacity-40 font-mono text-emerald-500/50">SWIFT: {activeBank.swift}</p></div>
          <div className="text-right flex flex-col justify-end"><p className="text-4xl font-black text-white tracking-tighter">TOTAL DUE: <span className="text-emerald-400">K {totalAmount.toLocaleString()}</span></p></div>
        </div>
      </div>
    </div>
  );
};

const ConfigView = ({ config, setConfig }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div className="glass glass-card space-y-8 p-10 border border-white/5">
      <h4 className="text-xl font-black flex items-center gap-2 text-white"><Settings size={22} className="text-emerald-400" />SUPPLIER INFO</h4>
      {Object.entries(config.supplier).map(([k, v]) => (
        <div key={k}><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">{k}</label><input type="text" value={v} onChange={e => setConfig({...config, supplier: {...config.supplier, [k]: e.target.value}})} className="input-field py-4" /></div>
      ))}
    </div>
    <div className="glass glass-card space-y-8 p-10 border border-white/5">
      <h4 className="text-xl font-black flex items-center gap-2 text-white"><Bus size={22} className="text-emerald-400" />CLIENT INFO</h4>
      {Object.entries(config.client).map(([k, v]) => (
        <div key={k}><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">{k}</label><input type="text" value={v} onChange={e => setConfig({...config, client: {...config.client, [k]: e.target.value}})} className="input-field py-4" /></div>
      ))}
    </div>
  </div>
);

const AddTripModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ isoDate: new Date().toISOString().split('T')[0], route: 'Chifubu', type: 'Morning', sched: '06:00', actual: '06:00', pax: 42 });
  const setShift = (s) => setFormData({...formData, type: s, sched: s === 'Morning' ? '06:00' : '16:00', actual: s === 'Morning' ? '06:00' : '16:00'});
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative glass glass-card w-full max-w-xl p-12 space-y-8 border border-white/10 shadow-[0_0_50px_rgba(16,185,129,0.1)]">
        <h3 className="text-3xl font-black uppercase tracking-tighter text-white">Log New Activity</h3>
        <div className="grid grid-cols-2 gap-6">
          <div><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">Service Date</label><input type="date" value={formData.isoDate} onChange={e => setFormData({...formData, isoDate: e.target.value})} className="input-field" /></div>
          <div><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">Transit Route</label><select value={formData.route} onChange={e => setFormData({...formData, route: e.target.value})} className="input-field"><option>Chifubu</option><option>Lubuto</option></select></div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-3 block">Operation Shift</label>
          <div className="flex gap-4">
            {['Morning', 'Day Shift'].map(s => <button key={s} type="button" onClick={() => setShift(s)} className={`flex-1 py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${formData.type === s ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]' : 'border-white/5 text-slate-500 hover:bg-white/5'}`}>{s}</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">Actual Time</label><input type="time" value={formData.actual} onChange={e => setFormData({...formData, actual: e.target.value})} className="input-field" /></div>
          <div><label className="text-[10px] uppercase tracking-[3px] text-slate-500 font-black mb-2 block">Passenger Count</label><input type="number" value={formData.pax} onChange={e => setFormData({...formData, pax: e.target.value})} className="input-field" /></div>
        </div>
        <button onClick={() => onSave(formData)} className="w-full btn btn-primary justify-center py-5 text-xs font-black uppercase tracking-[4px] shadow-emerald-500/20 shadow-2xl">Validate & Store Trip</button>
      </motion.div>
    </div>
  );
};

export default App;
