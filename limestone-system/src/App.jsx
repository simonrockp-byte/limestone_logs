import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle, TrendingUp, Bus, Calendar, ChevronRight, LogOut, AlertCircle, CheckCircle2, Wallet, X, CheckCheck, Download, Cloud, CloudOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

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
  doc.setFontSize(14);
  doc.text('Hamoney Investments — Trip Log Report', 14, 16);
  autoTable(doc, {
    startY: 28,
    head: [['Date', 'Route', 'Shift', 'Sched', 'Actual', 'PAX', 'Status']],
    body: logs.map(l => [l.date, l.route, l.type, l.sched, l.actual, l.pax, l.status]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [16, 185, 129] },
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

  // 1. Fetch Data from Neon (via Netlify Functions)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/.netlify/functions/api');
        const data = await res.json();
        
        if (data.logs && data.logs.length > 0) {
          setLogs(data.logs);
        } else {
          // Fallback to LocalStorage if DB is empty
          const savedLogs = localStorage.getItem('limestone_logs_v2');
          if (savedLogs) setLogs(JSON.parse(savedLogs));
        }

        if (data.config) {
          setConfig(data.config);
        } else {
          const savedConfig = localStorage.getItem('limestone_config');
          if (savedConfig) setConfig(JSON.parse(savedConfig));
        }
      } catch (err) {
        console.error("Fetch failed, using LocalStorage:", err);
        const savedLogs = localStorage.getItem('limestone_logs_v2');
        if (savedLogs) setLogs(JSON.parse(savedLogs));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 2. Sync Actions to Database
  const saveLog = async (log) => {
    setSyncing(true);
    try {
      await fetch('/.netlify/functions/api', {
        method: 'POST',
        body: JSON.stringify({ type: 'log', log })
      });
    } catch (err) { console.error("Sync failed:", err); }
    setSyncing(false);
  };

  const saveConfig = async (newConfig) => {
    setSyncing(true);
    try {
      await fetch('/.netlify/functions/api', {
        method: 'POST',
        body: JSON.stringify({ type: 'config', config: newConfig })
      });
    } catch (err) { console.error("Sync failed:", err); }
    setSyncing(false);
  };

  const addTrip = (trip) => {
    const newLog = { 
      ...trip, 
      id: `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`, 
      status: trip.actual <= trip.sched ? 'On Time' : 'Late', 
      date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) 
    };
    const updatedLogs = [newLog, ...logs];
    setLogs(updatedLogs);
    setShowAddModal(false);
    saveLog(newLog); // Save to cloud
  };

  const activePO = { ...INITIAL_PO, tripsCompleted: logs.length };

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05060f] text-emerald-400">
      <Loader2 className="animate-spin mb-4" size={48} />
      <p className="text-slate-400 font-medium tracking-widest uppercase text-xs">Initializing Secure Cloud Connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="bg-glow" />
      
      <aside className="sidebar glass">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500"><Bus size={28} /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Hamoney</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[2px]">Logistics Pro</p>
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
        
        {/* Sync Indicator */}
        <div className="px-4 py-3 bg-white/5 rounded-xl flex items-center gap-3 text-xs text-slate-500 mb-6">
          {syncing ? <Loader2 size={14} className="animate-spin text-emerald-400" /> : <Cloud size={14} className="text-emerald-400" />}
          <span>{syncing ? 'Syncing to Neon...' : 'Cloud Connected'}</span>
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
            <p className="text-slate-400 text-sm">Active Session: {activePO.number}</p>
          </div>
          <div className="flex items-center gap-4">
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

// ─── Sub-Components (Dashboard, Logs, Reconciliation, Invoice, Config) ────────────────
// Note: Keeping logic same as before, just mapped to state props.

const DashboardView = ({ po, logs }) => {
  const percent = Math.min((po.tripsCompleted / po.tripsAuthorised) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const late = logs.filter(l => l.status === 'Late').length;

  return (
    <div className="space-y-8">
      <div className="glass glass-card flex items-center justify-between p-8">
        <div className="space-y-4 flex-1">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm tracking-widest uppercase"><TrendingUp size={16} /><span>PO Utilization</span></div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm"><span className="text-slate-400">{po.tripsCompleted} / {po.tripsAuthorised} Trips</span><span className="text-emerald-400 font-bold">{Math.round(percent)}%</span></div>
            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-emerald-500" /></div>
          </div>
        </div>
        <div className="flex gap-12 pl-12 border-l border-white/5">
          <div className="text-center"><p className="text-slate-500 text-xs uppercase mb-1">Revenue</p><p className="text-2xl font-bold text-white">K {revenue.toLocaleString()}</p></div>
          <div className="text-center"><p className="text-slate-500 text-xs uppercase mb-1">Remaining</p><p className="text-2xl font-bold text-gold">{po.tripsAuthorised - po.tripsCompleted}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Cloud Status', val: 'Connected', sub: 'Syncing with Neon DB', icon: Cloud, color: 'text-emerald-400' },
          { label: 'Completed', val: po.tripsCompleted, sub: 'All routes', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Late', val: late, sub: 'Needs Review', icon: AlertCircle, color: late > 0 ? 'text-rose-400' : 'text-slate-400' },
        ].map((kpi, i) => (
          <div key={i} className="glass glass-card">
            <div className={`p-2 w-fit rounded-lg bg-white/5 ${kpi.color} mb-4`}><kpi.icon size={20} /></div>
            <p className="text-slate-400 text-sm font-medium">{kpi.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{kpi.val}</p>
            <p className="text-xs text-slate-500 mt-2">{kpi.sub}</p>
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
            <button key={r} onClick={() => setActiveRoute(r)} className={`px-6 py-2 rounded-lg transition-all ${activeRoute === r ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}>{r}</button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-glass gap-2"><Download size={16} />Export</button>
          {showExportMenu && (
            <div className="absolute right-0 mt-2 w-48 glass rounded-xl border border-white/10 z-20 overflow-hidden shadow-2xl">
              <button onClick={() => exportToPDF(logs)} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm">Download PDF Report</button>
              <button onClick={() => exportToExcel(logs)} className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm border-t border-white/5">Download Excel Sheet</button>
            </div>
          )}
        </div>
      </div>
      <div className="glass glass-card p-0 overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Shift</th><th>Sched</th><th>Actual</th><th>PAX</th><th>Status</th></tr></thead>
          <tbody>
            {filteredLogs.map(row => (
              <tr key={row.id}>
                <td className="font-medium">{row.date}</td>
                <td><span className="px-2 py-1 rounded bg-white/5 text-[10px] font-bold text-slate-400 uppercase">{row.type}</span></td>
                <td className="text-slate-400">{row.sched}</td>
                <td className="text-white font-medium">{row.actual}</td>
                <td>{row.pax}</td>
                <td><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{row.status}</span></td>
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
  const hasLog = (isoDate, route, type) => logs.some(l => l.isoDate === isoDate && l.route === route && l.type === type);
  let runningTotal = 0;

  return (
    <div className="glass glass-card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>Date</th><th>Day</th><th className="text-center">Chifubu AM</th><th className="text-center">Chifubu PM</th><th className="text-center">Lubuto AM</th><th className="text-center">Lubuto PM</th><th className="text-right">Running Total</th></tr>
          </thead>
          <tbody>
            {allDays.map(day => {
              const tripsToday = day.isWorking ? logs.filter(l => l.isoDate === day.iso).length : 0;
              if (day.isWorking) runningTotal += tripsToday;
              return (
                <tr key={day.iso} className={!day.isWorking ? 'opacity-20' : ''}>
                  <td className="font-medium text-xs">{day.label}</td>
                  <td className="text-xs text-slate-500">{day.isWorking ? day.dayName : day.reason}</td>
                  {day.isWorking ? [['Chifubu', 'Morning'], ['Chifubu', 'Day Shift'], ['Lubuto', 'Morning'], ['Lubuto', 'Day Shift']].map(([r, t]) => (
                    <td key={`${r}-${t}`} className="text-center">{hasLog(day.iso, r, t) ? <span className="text-emerald-400">✓</span> : <span className="text-rose-500 text-[10px]">✗</span>}</td>
                  )) : <td colSpan={4} className="text-center text-[10px] text-slate-600 italic">No Trips Scheduled</td>}
                  <td className="text-right font-mono text-slate-400 text-xs">{day.isWorking ? runningTotal : '—'}</td>
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
      <div className="flex justify-end"><button onClick={() => exportInvoicePDF(config, po, logs)} className="btn btn-primary gap-2"><FileText size={18} />Download PDF Invoice</button></div>
      <div className="glass p-12 rounded-2xl bg-white/[0.02] text-slate-300 max-w-4xl mx-auto border border-white/5 shadow-2xl">
        <div className="flex justify-between mb-12">
          <div><h4 className="text-2xl font-bold text-emerald-400 mb-2 uppercase tracking-tighter">{config.supplier.name}</h4><p className="text-xs opacity-60 max-w-[200px]">{config.supplier.address}</p></div>
          <div className="text-right"><h2 className="text-5xl font-black text-white/10 mb-2 tracking-tighter">INVOICE</h2><p className="text-sm opacity-60">Date: {new Date().toLocaleDateString('en-GB')}</p></div>
        </div>
        <div className="mb-12"><p className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-3">Bill To:</p><h5 className="text-lg font-bold text-white mb-1">{config.client.name}</h5><p className="text-xs opacity-60 max-w-[250px]">{config.client.address}</p></div>
        <div className="border-y border-white/5 py-8 mb-12">
          <table className="w-full">
            <thead><tr className="text-[10px] uppercase tracking-widest text-slate-500 text-left"><th className="pb-4">Description</th><th className="pb-4 text-center">Qty</th><th className="pb-4 text-right">Amount</th></tr></thead>
            <tbody className="text-white"><tr><td className="py-4"><p className="font-bold">Logistics Services: {po.number}</p><p className="text-[10px] text-slate-500 mt-1">Total trips completed for the current billing cycle.</p></td><td className="py-4 text-center font-mono">{logs.length}</td><td className="py-4 text-right font-bold text-emerald-400">K {totalAmount.toLocaleString()}</td></tr></tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/5">
          <div className="space-y-1"><p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Bank Details:</p><p className="text-xs font-bold text-white">{activeBank.name}</p><p className="text-xs opacity-60">Account: {activeBank.account}</p><p className="text-xs opacity-60">SWIFT: {activeBank.swift}</p></div>
          <div className="text-right flex flex-col justify-end"><p className="text-xl font-bold text-white">Total Due: <span className="text-emerald-400">K {totalAmount.toLocaleString()}</span></p></div>
        </div>
      </div>
    </div>
  );
};

const ConfigView = ({ config, setConfig }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div className="glass glass-card space-y-6">
      <h4 className="text-lg font-bold flex items-center gap-2"><Settings size={20} className="text-emerald-400" />Supplier Settings</h4>
      {Object.entries(config.supplier).map(([k, v]) => (
        <div key={k}><label className="label">{k}</label><input type="text" value={v} onChange={e => setConfig({...config, supplier: {...config.supplier, [k]: e.target.value}})} className="input-field" /></div>
      ))}
    </div>
    <div className="glass glass-card space-y-6">
      <h4 className="text-lg font-bold flex items-center gap-2"><Bus size={20} className="text-emerald-400" />Client Settings</h4>
      {Object.entries(config.client).map(([k, v]) => (
        <div key={k}><label className="label">{k}</label><input type="text" value={v} onChange={e => setConfig({...config, client: {...config.client, [k]: e.target.value}})} className="input-field" /></div>
      ))}
    </div>
  </div>
);

const AddTripModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ isoDate: new Date().toISOString().split('T')[0], route: 'Chifubu', type: 'Morning', sched: '06:00', actual: '06:00', pax: 42 });
  const setShift = (s) => setFormData({...formData, type: s, sched: s === 'Morning' ? '06:00' : '16:00', actual: s === 'Morning' ? '06:00' : '16:00'});
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative glass glass-card w-full max-w-lg p-10 space-y-6">
        <h3 className="text-2xl font-bold uppercase tracking-tight">Log New Trip</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Date</label><input type="date" value={formData.isoDate} onChange={e => setFormData({...formData, isoDate: e.target.value})} className="input-field" /></div>
          <div><label className="label">Route</label><select value={formData.route} onChange={e => setFormData({...formData, route: e.target.value})} className="input-field"><option>Chifubu</option><option>Lubuto</option></select></div>
        </div>
        <div className="flex gap-2">
          {['Morning', 'Day Shift'].map(s => <button key={s} type="button" onClick={() => setShift(s)} className={`flex-1 py-3 rounded-xl border text-xs font-bold transition-all ${formData.type === s ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/5 text-slate-500'}`}>{s}</button>)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Actual Depart</label><input type="time" value={formData.actual} onChange={e => setFormData({...formData, actual: e.target.value})} className="input-field" /></div>
          <div><label className="label">PAX</label><input type="number" value={formData.pax} onChange={e => setFormData({...formData, pax: e.target.value})} className="input-field" /></div>
        </div>
        <button onClick={() => onSave(formData)} className="w-full btn btn-primary justify-center py-4 text-sm font-black uppercase tracking-widest">Confirm Log</button>
      </motion.div>
    </div>
  );
};

export default App;
