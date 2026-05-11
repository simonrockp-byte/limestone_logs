import React, { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle, TrendingUp, Bus, LogOut, AlertCircle, CheckCircle2, Wallet, X, CheckCheck, Download, Cloud, Loader2, Save, Trash2, Edit2, CreditCard, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ─── Constants ───────────────────────────────────────────────────────────────
const INITIAL_CONFIG = {
  supplier: { name: 'Hamoney Investments Limited', address: 'Plot 123, Independence Ave, Ndola', phone: '+260 971 234 567', email: 'info@hamoney.com' },
  client: { name: 'Limestone Resources Limited', address: 'Copperbelt Road, Ndola', contact: 'Operations Manager' },
  banks: [
    { id: 1, name: 'Stanbic Bank', account: '904000123456', branch: 'Ndola', swift: 'SBICZM', active: true },
    { id: 2, name: 'ZANACO', account: '5800123456789', branch: 'Main', swift: 'ZNCOZM', active: false },
  ],
};

const DEFAULT_PO = { id: 'po-001', number: 'PO-001', start_date: '2026-04-23', trips_authorised: 63, rate: 790, status: 'IN PROGRESS' };
const PUBLIC_HOLIDAYS = ['2026-04-28', '2026-05-01'];

// ─── Utils ───────────────────────────────────────────────────────────────────
const getWorkingDays = (start, end) => {
  const days = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    const iso = cur.toISOString().split('T')[0];
    const dow = cur.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isHoliday = PUBLIC_HOLIDAYS.includes(iso);
    days.push({
      iso,
      label: cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      dayName: cur.toLocaleDateString('en-GB', { weekday: 'short' }),
      isWorking: !isWeekend && !isHoliday,
      reason: isHoliday ? 'Public Holiday' : isWeekend ? 'Weekend' : null,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// ─── Toast ───────────────────────────────────────────────────────────────────
const Toast = ({ toasts }) => (
  <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
    <AnimatePresence>
      {toasts.map(t => (
        <motion.div key={t.id} initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} transition={{ duration: 0.2 }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold shadow-2xl border ${t.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : t.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-white/5 border-white/10 text-slate-300'}`}>
          {t.type === 'success' ? <CheckCheck size={14} /> : t.type === 'error' ? <AlertCircle size={14} /> : <Cloud size={14} />}
          {t.message}
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel} />
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative glass glass-card max-w-sm w-full p-8 border border-white/10 text-center">
      <AlertCircle size={32} className="text-rose-400 mx-auto mb-4" />
      <p className="text-white font-bold mb-6 text-sm">{message}</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="btn btn-glass flex-1 text-xs font-bold">Cancel</button>
        <button onClick={onConfirm} className="btn flex-1 text-xs font-bold bg-rose-500/80 text-white hover:bg-rose-500 border-none">Delete</button>
      </div>
    </motion.div>
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────
const App = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [logs, setLogs] = useState([]);
  const [pos, setPos] = useState([DEFAULT_PO]);
  const [activePoId, setActivePoId] = useState(DEFAULT_PO.id);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPoModal, setShowPoModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) { setLoading(false); return; }
      const [poResult, logResult, configResult] = await Promise.allSettled([
        supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('trip_logs').select('*').order('iso_date', { ascending: false }),
        supabase.from('system_config').select('data').eq('id', 'main_config').single(),
      ]);
      const poData = poResult.status === 'fulfilled' ? poResult.value.data : null;
      const logData = logResult.status === 'fulfilled' ? logResult.value.data : null;
      const configData = configResult.status === 'fulfilled' ? configResult.value.data : null;

      if (poData?.length) { setPos(poData); setActivePoId(poData[0].id); }
      if (logData?.length) setLogs(logData);
      if (configData?.data) setConfig(configData.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const saveLog = async (log) => {
    if (!supabase) return;
    setSyncing(true);
    const { error } = await supabase.from('trip_logs').upsert({
      id: log.id, date: log.date, iso_date: log.isoDate || log.iso_date,
      route: log.route, type: log.type, sched: log.sched,
      actual: log.actual, pax: parseInt(log.pax), status: log.status,
      po_id: log.po_id || activePoId,
    });
    if (error) toast('Sync failed', 'error');
    setSyncing(false);
  };

  const deleteLog = (id) => {
    setConfirm({
      message: 'Delete this trip log? This cannot be undone.',
      onConfirm: async () => {
        setConfirm(null);
        setSyncing(true);
        if (supabase) {
          const { error } = await supabase.from('trip_logs').delete().eq('id', id);
          if (error) { toast('Delete failed', 'error'); setSyncing(false); return; }
        }
        setLogs(prev => prev.filter(l => l.id !== id));
        toast('Trip log deleted');
        setSyncing(false);
      },
      onCancel: () => setConfirm(null),
    });
  };

  const addTrip = (trip) => {
    const newLog = {
      ...trip,
      id: trip.id || `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`,
      status: trip.actual <= trip.sched ? 'On Time' : 'Late',
      date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      po_id: activePoId,
    };
    if (editingLog) {
      setLogs(prev => prev.map(l => l.id === editingLog.id ? newLog : l));
      setEditingLog(null);
      toast('Trip updated');
    } else {
      setLogs(prev => [newLog, ...prev]);
      toast('Trip logged');
    }
    setShowAddModal(false);
    saveLog(newLog);
  };

  const saveConfig = async (newConfig) => {
    setConfig(newConfig);
    if (!supabase) { toast('Saved locally (no cloud)', 'info'); return; }
    setSyncing(true);
    const { error } = await supabase.from('system_config').upsert({ id: 'main_config', data: newConfig });
    setSyncing(false);
    if (error) toast('Config save failed', 'error');
    else toast('Configuration saved');
  };

  const addPo = async (newPo) => {
    if (!supabase) { toast('Supabase required for PO creation', 'error'); return; }
    setSyncing(true);
    const po = { ...newPo, id: `po-${Date.now()}`, status: 'IN PROGRESS' };
    const { error } = await supabase.from('purchase_orders').insert(po);
    if (!error) { setPos(prev => [po, ...prev]); setActivePoId(po.id); toast('New PO created'); }
    else toast('PO creation failed', 'error');
    setShowPoModal(false);
    setSyncing(false);
  };

  const syncScheduledTrips = async () => {
    if (!supabase) { toast('Cloud sync requires Supabase', 'error'); return; }
    setSyncing(true);
    const po = pos.find(p => p.id === activePoId) || DEFAULT_PO;
    const today = new Date().toISOString().split('T')[0];
    const workingDays = getWorkingDays(po.start_date, today).filter(d => d.isWorking);
    const newTrips = [];

    workingDays.forEach(day => {
      ['Chifubu', 'Lubuto'].forEach(route => {
        [{ type: 'Morning', sched: '06:00' }, { type: 'Day Shift', sched: '16:00' }].forEach(shift => {
          const exists = logs.some(l => l.iso_date === day.iso && l.route === route && l.type === shift.type && (!l.po_id || l.po_id === activePoId));
          if (!exists) newTrips.push({
            id: `${day.iso}-${route.slice(0,3)}-${shift.type.slice(0,1)}-${Date.now()}`,
            date: day.label, iso_date: day.iso, route, type: shift.type,
            sched: shift.sched, actual: shift.sched, pax: 42, status: 'On Time', po_id: activePoId,
          });
        });
      });
    });

    if (newTrips.length > 0) {
      const { data, error } = await supabase.from('trip_logs').insert(newTrips).select();
      if (!error) { setLogs(prev => [...data, ...prev]); toast(`${newTrips.length} trips synced`); }
      else toast('Sync failed', 'error');
    } else {
      toast('All trips already synced');
    }
    setSyncing(false);
  };

  const activePO = pos.find(p => p.id === activePoId) || DEFAULT_PO;
  const filteredLogs = logs.filter(l => !l.po_id || l.po_id === activePoId);
  const poWithStats = { ...activePO, tripsCompleted: filteredLogs.length };
  const utilPct = filteredLogs.length / (activePO.trips_authorised || 63) * 100;

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05060f] text-emerald-400">
      <Loader2 className="animate-spin mb-4" size={48} />
      <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">Loading Limestone Logs...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="bg-glow" />

      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><Bus size={22} /></div>
          <div>
            <h1 className="text-base font-black text-white leading-tight">Hamoney</h1>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest">Logistics Pro</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'logs', label: 'Trip Logs', icon: ClipboardList },
            { id: 'pos', label: 'PO Management', icon: Wallet },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'config', label: 'Configuration', icon: Settings },
          ].map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm ${currentView === item.id ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon size={16} /><span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* PO warning */}
        {utilPct >= 80 && (
          <div className="mx-2 mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <AlertCircle size={12} className="text-amber-400 shrink-0" />
            <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{Math.round(utilPct)}% PO Used</p>
          </div>
        )}

        <div className="pt-4 border-t border-white/5 space-y-1">
          <div className="flex items-center gap-2 px-4 py-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
            {syncing ? <Loader2 size={11} className="animate-spin text-emerald-400" /> : <Cloud size={11} className={supabase ? 'text-emerald-400' : 'text-amber-400'} />}
            <span>{syncing ? 'Syncing…' : supabase ? 'Cloud Live' : 'No Cloud'}</span>
          </div>
          <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-500 hover:text-rose-400 transition-colors text-sm">
            <LogOut size={16} /><span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">
              {currentView === 'pos' ? 'PO Management' : currentView}
            </h2>
            <div className="h-5 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2 h-8">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">PO</span>
              <select value={activePoId} onChange={e => setActivePoId(e.target.value)}
                className="bg-transparent text-emerald-400 text-xs font-bold border-none outline-none cursor-pointer">
                {pos.map(p => <option key={p.id} value={p.id}>{p.number}</option>)}
              </select>
              <ChevronDown size={10} className="text-slate-500" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-glass gap-1.5 text-xs font-bold text-emerald-400 border-emerald-500/20 py-2 px-3" onClick={() => setShowPoModal(true)}>
              <PlusCircle size={14} />New PO
            </button>
            <button className="btn btn-primary gap-1.5 text-xs font-black uppercase tracking-wider py-2 px-4" onClick={() => setShowAddModal(true)}>
              <PlusCircle size={14} />New Trip
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={currentView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {currentView === 'dashboard' && <DashboardView po={poWithStats} logs={filteredLogs} onSync={syncScheduledTrips} syncing={syncing} />}
            {currentView === 'logs'      && <LogsView logs={filteredLogs} onDelete={deleteLog} onEdit={l => { setEditingLog(l); setShowAddModal(true); }} />}
            {currentView === 'pos'       && <PoManagementView pos={pos} activePoId={activePoId} onSwitch={setActivePoId} onCreate={() => setShowPoModal(true)} filteredLogs={filteredLogs} />}
            {currentView === 'invoices'  && <InvoiceView config={config} po={activePO} logs={filteredLogs} />}
            {currentView === 'config'    && <ConfigView config={config} onSave={saveConfig} syncing={syncing} />}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showAddModal && <AddTripModal log={editingLog} onClose={() => { setShowAddModal(false); setEditingLog(null); }} onSave={addTrip} />}
          {showPoModal  && <AddPoModal onClose={() => setShowPoModal(false)} onSave={addPo} />}
          {confirm      && <ConfirmDialog {...confirm} />}
        </AnimatePresence>
      </main>

      <Toast toasts={toasts} />
    </div>
  );
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const DashboardView = ({ po, logs, onSync, syncing }) => {
  const percent = Math.min((po.tripsCompleted / (po.trips_authorised || 63)) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const late = logs.filter(l => l.status === 'Late').length;
  const onTimeRate = logs.length > 0 ? Math.round(((logs.length - late) / logs.length) * 100) : 100;
  const isWarning = percent >= 80;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={onSync} disabled={syncing}
          className="btn btn-glass gap-2 text-[10px] font-black uppercase tracking-[2px] py-2 px-5 border-emerald-500/20 text-emerald-400 disabled:opacity-50">
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
          Sync Scheduled Trips
        </button>
      </div>

      {/* Revenue banner */}
      <div className={`glass glass-card flex items-center justify-between p-8 relative overflow-hidden border ${isWarning ? 'border-amber-500/20' : 'border-white/5'}`}>
        <div className={`absolute top-0 right-0 w-64 h-64 blur-[100px] -mr-32 -mt-32 ${isWarning ? 'bg-amber-500/5' : 'bg-emerald-500/5'}`} />
        <div className="flex-1 space-y-3 relative z-10 mr-12">
          <div className="flex items-center gap-2">
            <TrendingUp size={12} className="text-emerald-400" />
            <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[3px]">Contract Utilization</p>
            {isWarning && <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-black uppercase">Warning</span>}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-400">{po.tripsCompleted} / {po.trips_authorised} Trips</span>
              <span className={isWarning ? 'text-amber-400' : 'text-emerald-400'}>{Math.round(percent)}%</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                className={`h-full rounded-full ${isWarning ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </div>
          </div>
        </div>
        <div className="flex gap-10 pl-10 border-l border-white/5 relative z-10">
          <div className="text-center">
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Earned</p>
            <p className="text-3xl font-black text-white">K {revenue.toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">Remaining</p>
            <p className={`text-3xl font-black ${isWarning ? 'text-amber-400' : 'text-slate-300'}`}>{po.trips_authorised - po.tripsCompleted}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: 'Cloud Status', val: supabase ? 'Connected' : 'Offline', sub: supabase ? 'Live Sync Active' : 'No Supabase keys', icon: Cloud, color: supabase ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'On-time Rate', val: `${onTimeRate}%`, sub: `${logs.length - late} of ${logs.length} trips`, icon: CheckCircle2, color: onTimeRate >= 95 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Late Trips', val: late, sub: late > 0 ? 'Needs attention' : 'All on time', icon: AlertCircle, color: late > 0 ? 'text-rose-400' : 'text-slate-500' },
        ].map((kpi, i) => (
          <div key={i} className="glass glass-card p-6 border border-white/5 hover:border-white/10 transition-colors">
            <div className={`p-2 w-fit rounded-lg bg-white/5 ${kpi.color} mb-4`}><kpi.icon size={18} /></div>
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">{kpi.label}</p>
            <p className={`text-2xl font-black mt-1 ${kpi.color}`}>{kpi.val}</p>
            <p className="text-[9px] text-slate-500 mt-1.5 font-bold">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
const LogsView = ({ logs, onDelete, onEdit }) => {
  const [activeRoute, setActiveRoute] = useState('Chifubu');
  const [showExport, setShowExport] = useState(false);
  const filteredLogs = logs.filter(l => l.route === activeRoute);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Trip Logs — ${activeRoute}`, 14, 16);
    autoTable(doc, {
      startY: 24,
      head: [['Date', 'Shift', 'Sched', 'Actual', 'PAX', 'Status']],
      body: filteredLogs.map(l => [l.date, l.type, l.sched, l.actual, l.pax, l.status]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });
    doc.save(`trip_logs_${activeRoute.toLowerCase()}.pdf`);
    setShowExport(false);
  };

  const exportExcel = () => {
    const rows = filteredLogs.map(l => ({ Date: l.date, Route: l.route, Shift: l.type, Scheduled: l.sched, Actual: l.actual, PAX: l.pax, Status: l.status }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeRoute);
    XLSX.writeFile(wb, `trip_logs_${activeRoute.toLowerCase()}.xlsx`);
    setShowExport(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div className="flex gap-1.5 p-1 bg-white/5 rounded-xl border border-white/10">
          {['Chifubu', 'Lubuto'].map(r => (
            <button key={r} onClick={() => setActiveRoute(r)}
              className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${activeRoute === r ? 'bg-white/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {r} <span className="ml-1 opacity-60">({logs.filter(l => l.route === r).length})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setShowExport(v => !v)} className="btn btn-glass gap-2 text-[10px] font-black uppercase tracking-widest py-2 px-4">
            <Download size={13} />Export
          </button>
          <AnimatePresence>
            {showExport && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                className="absolute right-0 top-full mt-2 w-44 glass rounded-xl border border-white/10 overflow-hidden z-20 shadow-2xl">
                <button onClick={exportPDF} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white transition-colors">PDF Report</button>
                <button onClick={exportExcel} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white transition-colors border-t border-white/5">Excel Sheet</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="glass glass-card p-0 overflow-hidden border border-white/5">
        <table className="data-table">
          <thead>
            <tr className="text-[9px] uppercase tracking-[3px] text-slate-500">
              <th>Date</th><th>Shift</th><th>Sched</th><th>Actual</th><th>PAX</th><th>Status</th><th className="text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-slate-500 text-xs">No logs for {activeRoute} yet.</td></tr>
            ) : filteredLogs.map(row => (
              <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.015] transition-colors">
                <td className="font-semibold text-slate-300 text-xs">{row.date}</td>
                <td><span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-500 uppercase">{row.type}</span></td>
                <td className="text-slate-500 font-mono text-xs">{row.sched}</td>
                <td className="text-white font-black font-mono text-xs">{row.actual}</td>
                <td className="text-slate-400 font-semibold text-xs">{row.pax}</td>
                <td>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {row.status}
                  </span>
                </td>
                <td className="text-right pr-4">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => onEdit(row)} className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"><Edit2 size={12} /></button>
                    <button onClick={() => onDelete(row.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── PO Management ────────────────────────────────────────────────────────────
const PoManagementView = ({ pos, activePoId, onSwitch, onCreate, filteredLogs }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
    {pos.map(po => {
      const tripCount = filteredLogs.length;
      const pct = Math.min((tripCount / (po.trips_authorised || 1)) * 100, 100);
      const isActive = activePoId === po.id;
      const isWarn = pct >= 80;
      return (
        <div key={po.id} onClick={() => onSwitch(po.id)}
          className={`glass glass-card p-6 border transition-all cursor-pointer ${isActive ? 'border-emerald-500/40' : 'border-white/5 hover:border-white/20'}`}>
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-lg font-black text-white">{po.number}</h4>
            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${po.status === 'CLOSED' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{po.status}</span>
          </div>
          <div className="space-y-2.5 mb-5 text-[10px] font-bold uppercase tracking-widest">
            <div className="flex justify-between text-slate-500"><span>Started</span><span className="text-slate-300">{po.start_date}</span></div>
            <div className="flex justify-between text-slate-500"><span>Rate</span><span className="text-emerald-400">K {po.rate?.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-500"><span>Authorised</span><span className="text-slate-300">{po.trips_authorised} trips</span></div>
          </div>
          {isActive && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[9px] font-black">
                <span className="text-slate-500">Utilisation</span>
                <span className={isWarn ? 'text-amber-400' : 'text-emerald-400'}>{Math.round(pct)}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div style={{ width: `${pct}%` }} className={`h-full rounded-full transition-all ${isWarn ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              </div>
            </div>
          )}
          <p className="text-[9px] font-black text-center mt-4 uppercase tracking-widest text-slate-600">
            {isActive ? '— Active —' : 'Click to switch'}
          </p>
        </div>
      );
    })}
    <div onClick={onCreate}
      className="glass glass-card flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/5 opacity-40 hover:opacity-100 hover:bg-white/[0.02] cursor-pointer gap-3 transition-all min-h-[180px]">
      <PlusCircle size={22} className="text-slate-500" />
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">New Contract</p>
    </div>
  </div>
);

// ─── Invoice ──────────────────────────────────────────────────────────────────
const InvoiceView = ({ config, po, logs }) => {
  const total = logs.length * (po.rate || 0);
  const activeBank = config.banks?.find(b => b.active) || config.banks?.[0] || {};
  const dateRange = logs.length > 0
    ? `${[...logs].sort((a, b) => a.iso_date > b.iso_date ? 1 : -1)[0]?.date} – ${[...logs].sort((a, b) => a.iso_date < b.iso_date ? 1 : -1)[0]?.date}`
    : 'No trips logged';

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(5, 6, 15);
    doc.setFontSize(24); doc.setTextColor(16, 185, 129);
    doc.text('INVOICE', pageW - 14, 22, { align: 'right' });
    doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text(config.supplier.name, 14, 16);
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text(config.supplier.address, 14, 22);
    doc.text(`Tel: ${config.supplier.phone}   Email: ${config.supplier.email}`, 14, 28);

    // Date
    doc.setFontSize(8);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, pageW - 14, 28, { align: 'right' });
    doc.text(`Ref: ${po.number}`, pageW - 14, 34, { align: 'right' });

    // Divider
    doc.setDrawColor(16, 185, 129); doc.setLineWidth(0.5);
    doc.line(14, 36, pageW - 14, 36);

    // Bill To
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('BILL TO:', 14, 44);
    doc.setFontSize(11); doc.setTextColor(30, 30, 30);
    doc.text(config.client.name, 14, 51);
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text(config.client.address, 14, 57);
    doc.text(`Attn: ${config.client.contact}`, 14, 63);

    // Line items
    autoTable(doc, {
      startY: 72,
      head: [['Description', 'Period', 'Trips', 'Rate (K)', 'Total (K)']],
      body: [[
        `Logistics Services — ${po.number}`,
        dateRange,
        logs.length,
        po.rate?.toLocaleString(),
        total.toLocaleString(),
      ]],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    });

    const finalY = doc.lastAutoTable.finalY + 10;

    // Total
    doc.setFontSize(14); doc.setTextColor(16, 185, 129);
    doc.text(`TOTAL DUE: K ${total.toLocaleString()}`, pageW - 14, finalY, { align: 'right' });

    // Bank details
    doc.setFontSize(8); doc.setTextColor(100, 100, 100);
    doc.text('PAYMENT DETAILS:', 14, finalY);
    doc.setTextColor(30, 30, 30);
    doc.text(`Bank: ${activeBank.name}`, 14, finalY + 7);
    doc.text(`Account: ${activeBank.account}`, 14, finalY + 13);
    doc.text(`Branch: ${activeBank.branch}   SWIFT: ${activeBank.swift}`, 14, finalY + 19);

    doc.save(`Invoice_${po.number}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={generatePDF} className="btn btn-primary gap-2 text-xs font-black uppercase tracking-[2px] py-3 px-7 shadow-lg shadow-emerald-500/10">
          <FileText size={15} />Generate PDF Invoice
        </button>
      </div>

      {/* Preview */}
      <div className="glass p-12 max-w-4xl mx-auto border border-white/5 bg-white/[0.01] rounded-2xl">
        <div className="flex justify-between mb-12">
          <div>
            <h2 className="text-2xl font-black text-emerald-400 tracking-tighter">{config.supplier.name}</h2>
            <p className="text-[10px] text-slate-500 mt-1">{config.supplier.address}</p>
            <p className="text-[10px] text-slate-500">{config.supplier.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black text-white/5 tracking-tighter leading-none">INVOICE</p>
            <p className="text-[10px] text-slate-500 mt-2">{new Date().toLocaleDateString('en-GB')}</p>
            <p className="text-[10px] text-emerald-400 font-bold">{po.number}</p>
          </div>
        </div>

        <div className="mb-10">
          <p className="text-emerald-500 text-[9px] font-black uppercase tracking-[4px] mb-2">Bill To</p>
          <h4 className="text-lg font-black text-white">{config.client.name}</h4>
          <p className="text-[10px] text-slate-500 mt-1">{config.client.address}</p>
        </div>

        <div className="border-y border-white/5 py-8 mb-8">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                <th className="text-left pb-4">Description</th>
                <th className="text-center pb-4">Period</th>
                <th className="text-center pb-4">Qty</th>
                <th className="text-right pb-4">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-3">
                  <p className="font-black text-white">Logistics Services — {po.number}</p>
                  <p className="text-[9px] text-slate-500 mt-0.5">Staff transit services per agreement</p>
                </td>
                <td className="text-center text-[10px] text-slate-400">{dateRange}</td>
                <td className="text-center font-black text-white text-lg">{logs.length}</td>
                <td className="text-right font-black text-emerald-400 text-xl font-mono">K {total.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-end">
          <div>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-3">Payment Details</p>
            <p className="text-xs font-black text-slate-300">{activeBank.name}</p>
            <p className="text-[10px] text-slate-500 font-mono">ACC: {activeBank.account}</p>
            <p className="text-[10px] text-slate-500 font-mono">SWIFT: {activeBank.swift}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Due</p>
            <p className="text-3xl font-black text-white">K <span className="text-emerald-400">{total.toLocaleString()}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Config ───────────────────────────────────────────────────────────────────
const ConfigView = ({ config, onSave, syncing }) => {
  const [draft, setDraft] = useState(JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);

  const update = (section, key, value) => {
    setDraft(d => ({ ...d, [section]: { ...d[section], [key]: value } }));
    setDirty(true);
  };

  const updateBank = (id, key, value) => {
    setDraft(d => ({ ...d, banks: d.banks.map(b => b.id === id ? { ...b, [key]: value } : b) }));
    setDirty(true);
  };

  const setActiveBank = (id) => {
    setDraft(d => ({ ...d, banks: d.banks.map(b => ({ ...b, active: b.id === id })) }));
    setDirty(true);
  };

  const handleSave = () => { onSave(draft); setDirty(false); };

  const Field = ({ label, value, onChange }) => (
    <div>
      <label className="text-[9px] font-black uppercase tracking-[3px] text-slate-500 mb-1.5 block">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} className="input-field text-sm" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-slate-500 font-bold">{dirty ? '● Unsaved changes' : 'All changes saved'}</p>
        <button onClick={handleSave} disabled={!dirty || syncing}
          className="btn btn-primary gap-2 text-xs font-black uppercase tracking-wider py-2.5 px-6 disabled:opacity-40">
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Supplier */}
        <div className="glass glass-card p-8 border border-white/5 space-y-5">
          <h4 className="text-sm font-black text-white flex items-center gap-2"><Settings size={16} className="text-emerald-400" />Supplier Info</h4>
          <Field label="Company Name" value={draft.supplier.name} onChange={v => update('supplier', 'name', v)} />
          <Field label="Address" value={draft.supplier.address} onChange={v => update('supplier', 'address', v)} />
          <Field label="Phone" value={draft.supplier.phone} onChange={v => update('supplier', 'phone', v)} />
          <Field label="Email" value={draft.supplier.email} onChange={v => update('supplier', 'email', v)} />
        </div>

        {/* Client */}
        <div className="glass glass-card p-8 border border-white/5 space-y-5">
          <h4 className="text-sm font-black text-white flex items-center gap-2"><Bus size={16} className="text-emerald-400" />Client Info</h4>
          <Field label="Company Name" value={draft.client.name} onChange={v => update('client', 'name', v)} />
          <Field label="Address" value={draft.client.address} onChange={v => update('client', 'address', v)} />
          <Field label="Contact Person" value={draft.client.contact} onChange={v => update('client', 'contact', v)} />
        </div>
      </div>

      {/* Banks */}
      <div className="glass glass-card p-8 border border-white/5">
        <h4 className="text-sm font-black text-white flex items-center gap-2 mb-6"><CreditCard size={16} className="text-emerald-400" />Banking Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {draft.banks.map(bank => (
            <div key={bank.id} className={`p-5 rounded-xl border transition-all ${bank.active ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5'}`}>
              <div className="flex justify-between items-center mb-4">
                <p className="text-xs font-black text-white">Bank {bank.id}</p>
                <button onClick={() => setActiveBank(bank.id)}
                  className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${bank.active ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}>
                  {bank.active ? '✓ Active' : 'Set Active'}
                </button>
              </div>
              <div className="space-y-3">
                {[['Bank Name', 'name'], ['Account No.', 'account'], ['Branch', 'branch'], ['SWIFT', 'swift']].map(([lbl, key]) => (
                  <div key={key}>
                    <label className="text-[9px] font-black uppercase tracking-[3px] text-slate-500 mb-1 block">{lbl}</label>
                    <input value={bank[key]} onChange={e => updateBank(bank.id, key, e.target.value)} className="input-field text-sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Add Trip Modal ───────────────────────────────────────────────────────────
const AddTripModal = ({ log, onClose, onSave }) => {
  const [f, setF] = useState(log
    ? { isoDate: log.iso_date || log.isoDate, route: log.route, type: log.type, sched: log.sched, actual: log.actual, pax: log.pax }
    : { isoDate: new Date().toISOString().split('T')[0], route: 'Chifubu', type: 'Morning', sched: '06:00', actual: '06:00', pax: 42 }
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative glass glass-card w-full max-w-lg p-10 border border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">{log ? 'Edit Trip' : 'New Trip'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all"><X size={16} /></button>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Date</label>
              <input type="date" value={f.isoDate} onChange={e => setF({ ...f, isoDate: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Route</label>
              <select value={f.route} onChange={e => setF({ ...f, route: e.target.value })} className="input-field">
                <option>Chifubu</option><option>Lubuto</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Shift</label>
            <div className="flex gap-3">
              {['Morning', 'Day Shift'].map(s => (
                <button key={s} type="button"
                  onClick={() => setF({ ...f, type: s, sched: s === 'Morning' ? '06:00' : '16:00', actual: s === 'Morning' ? '06:00' : '16:00' })}
                  className={`flex-1 py-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${f.type === s ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'border-white/5 text-slate-500 hover:bg-white/5'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Actual Time</label>
              <input type="time" value={f.actual} onChange={e => setF({ ...f, actual: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">PAX</label>
              <input type="number" value={f.pax} onChange={e => setF({ ...f, pax: e.target.value })} className="input-field" />
            </div>
          </div>
          <button onClick={() => onSave(f)} className="w-full btn btn-primary py-4 text-xs font-black uppercase tracking-[3px] mt-2">
            {log ? 'Save Changes' : 'Confirm & Log Trip'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Add PO Modal ─────────────────────────────────────────────────────────────
const AddPoModal = ({ onClose, onSave }) => {
  const [f, setF] = useState({ number: '', start_date: new Date().toISOString().split('T')[0], trips_authorised: 63, rate: 790 });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="relative glass glass-card w-full max-w-md p-10 border border-white/10 shadow-2xl">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">New Contract</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5"><X size={16} /></button>
        </div>
        <div className="space-y-5">
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">PO Number</label>
            <input placeholder="e.g. PO-002" value={f.number} onChange={e => setF({ ...f, number: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Start Date</label>
            <input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Trip Limit</label>
              <input type="number" value={f.trips_authorised} onChange={e => setF({ ...f, trips_authorised: parseInt(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Rate (K)</label>
              <input type="number" value={f.rate} onChange={e => setF({ ...f, rate: parseFloat(e.target.value) })} className="input-field" />
            </div>
          </div>
          <button onClick={() => onSave(f)} disabled={!f.number.trim()}
            className="w-full btn btn-primary py-4 text-xs font-black uppercase tracking-[3px] mt-2 disabled:opacity-40">
            Create PO
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default App;
