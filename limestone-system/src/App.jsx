import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle, TrendingUp, Bus, LogOut, AlertCircle, CheckCircle2, Wallet, X, CheckCheck, Download, Cloud, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase Initialization ─────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

// ─── Constants ───────────────────────────────────────────────────────────────
const INITIAL_CONFIG = {
  supplier: { name: "Hamoney Investments Limited", address: "Plot 123, Independence Ave, Ndola", phone: "+260 971 234 567", email: "info@hamoney.com" },
  client: { name: "Limestone Resources Limited", address: "Copperbelt Road, Ndola", contact: "Operations Manager" },
  banks: [
    { id: 1, name: "Stanbic Bank", account: "904000123456", branch: "Ndola", swift: "SBICZM", active: true },
    { id: 2, name: "ZANACO", account: "5800123456789", branch: "Main", swift: "ZNCOZM", active: false }
  ]
};

const DEFAULT_PO = { id: 'po-001', number: "PO-001", start_date: "2026-04-23", trips_authorised: 63, rate: 790, status: "IN PROGRESS" };
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
    days.push({ iso, label: cur.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), dayName: cur.toLocaleDateString('en-GB', { weekday: 'short' }), isWorking: !isWeekend && !isHoliday, reason: isHoliday ? 'Public Holiday' : isWeekend ? 'Weekend' : null });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// ─── App Component ───────────────────────────────────────────────────────────
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

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      // Fetch each table independently so one missing table can't block the rest
      const [poResult, logResult, configResult] = await Promise.allSettled([
        supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
        supabase.from('trip_logs').select('*').order('iso_date', { ascending: false }),
        supabase.from('system_config').select('data').eq('id', 'main_config').single(),
      ]);

      const poData = poResult.status === 'fulfilled' ? poResult.value.data : null;
      const logData = logResult.status === 'fulfilled' ? logResult.value.data : null;
      const configData = configResult.status === 'fulfilled' ? configResult.value.data : null;

      if (poData?.length) {
        setPos(poData);
        setActivePoId(poData[0].id);
      }

      if (logData?.length) {
        setLogs(logData);
      }

      if (configData) setConfig(configData.data);

      setLoading(false);
    };
    fetchData();
  }, []);

  const saveLog = async (log) => {
    if (!supabase) return;
    setSyncing(true);
    await supabase.from('trip_logs').upsert({
      id: log.id, date: log.date, iso_date: log.isoDate,
      route: log.route, type: log.type, sched: log.sched,
      actual: log.actual, pax: parseInt(log.pax), status: log.status,
      po_id: log.po_id || activePoId
    });
    setSyncing(false);
  };

  const deleteLog = async (id) => {
    setSyncing(true);
    const { error } = await supabase.from('trip_logs').delete().eq('id', id);
    if (!error) setLogs(logs.filter(l => l.id !== id));
    setSyncing(false);
  };

  const addTrip = (trip) => {
    const newLog = {
      ...trip,
      id: trip.id || `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`,
      status: trip.actual <= trip.sched ? 'On Time' : 'Late',
      date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      po_id: activePoId
    };
    if (editingLog) {
      setLogs(logs.map(l => l.id === editingLog.id ? newLog : l));
      setEditingLog(null);
    } else {
      setLogs([newLog, ...logs]);
    }
    setShowAddModal(false);
    saveLog(newLog);
  };

  const addPo = async (newPo) => {
    setSyncing(true);
    const po = { ...newPo, id: `po-${Date.now()}` };
    const { error } = await supabase.from('purchase_orders').insert(po);
    if (!error) {
      setPos([po, ...pos]);
      setActivePoId(po.id);
    }
    setShowPoModal(false);
    setSyncing(false);
  };

  const syncScheduledTrips = async () => {
    setSyncing(true);
    const po = pos.find(p => p.id === activePoId) || DEFAULT_PO;
    const today = new Date().toISOString().split('T')[0];
    const workingDays = getWorkingDays(po.start_date, today).filter(d => d.isWorking);
    const newTrips = [];

    workingDays.forEach(day => {
      ['Chifubu', 'Lubuto'].forEach(route => {
        [{ type: 'Morning', sched: '06:00' }, { type: 'Day Shift', sched: '16:00' }].forEach(shift => {
          const exists = logs.some(l => l.iso_date === day.iso && l.route === route && l.type === shift.type && (!l.po_id || l.po_id === activePoId));
          if (!exists) {
            newTrips.push({
              id: `${day.iso}-${route}-${shift.type}-${Date.now()}`,
              date: day.label, iso_date: day.iso, route, type: shift.type,
              sched: shift.sched, actual: shift.sched, pax: 42, status: 'On Time', po_id: activePoId
            });
          }
        });
      });
    });

    if (newTrips.length > 0) {
      const { data, error } = await supabase.from('trip_logs').insert(newTrips).select();
      if (!error) setLogs([...data, ...logs]);
    }
    setSyncing(false);
  };

  const activePO = pos.find(p => p.id === activePoId) || DEFAULT_PO;
  // Show logs that match the active PO, OR any log with no po_id (legacy data before multi-PO)
  const filteredLogs = logs.filter(l => !l.po_id || l.po_id === activePoId);
  const poWithStats = { ...activePO, tripsCompleted: filteredLogs.length };

  if (loading) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#05060f] text-emerald-400">
      <Loader2 className="animate-spin mb-4" size={48} />
      <p className="text-slate-400 text-xs font-bold tracking-widest uppercase">Initializing Cloud System...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="bg-glow" />
      <aside className="sidebar">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><Bus size={24} /></div>
          <div><h1 className="text-lg font-black text-white">Hamoney</h1><p className="text-[10px] text-slate-500 uppercase tracking-widest">Logistics Pro</p></div>
        </div>
        <nav className="flex-1 space-y-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'logs', label: 'Trip Logs', icon: ClipboardList },
            { id: 'pos', label: 'PO Management', icon: Wallet },
            { id: 'invoices', label: 'Invoices', icon: FileText },
            { id: 'config', label: 'Configuration', icon: Settings },
          ].map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${currentView === item.id ? 'bg-emerald-500/10 text-emerald-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon size={18} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-4">
            {syncing ? <Loader2 size={12} className="animate-spin text-emerald-400" /> : <Cloud size={12} className="text-emerald-400" />}
            <span>{syncing ? 'Syncing...' : 'Cloud Live'}</span>
          </div>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-rose-400 transition-colors"><LogOut size={18} /><span>Logout</span></button>
        </div>
      </aside>

      <main className="main-content">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">{currentView === 'pos' ? 'PO Management' : currentView}</h2>
            <div className="h-6 w-px bg-white/10 mx-2" />
            <select value={activePoId} onChange={e => setActivePoId(e.target.value)} className="input-field py-1 px-3 text-xs w-auto h-9 font-bold bg-white/5 border-white/10 text-emerald-400">
              {pos.map(p => <option key={p.id} value={p.id}>{p.number}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-glass gap-2 text-xs font-bold text-emerald-400 border-emerald-500/20" onClick={() => setShowPoModal(true)}><PlusCircle size={16} />New PO</button>
            <button className="btn btn-primary gap-2 text-xs font-black uppercase tracking-widest" onClick={() => setShowAddModal(true)}><PlusCircle size={16} />New Trip</button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {currentView === 'dashboard' && <DashboardView po={poWithStats} logs={filteredLogs} onSync={syncScheduledTrips} syncing={syncing} />}
            {currentView === 'logs' && <LogsView logs={filteredLogs} onDelete={deleteLog} onEdit={l => { setEditingLog(l); setShowAddModal(true); }} />}
            {currentView === 'pos' && <PoManagementView pos={pos} activePoId={activePoId} onSwitch={setActivePoId} onCreate={() => setShowPoModal(true)} />}
            {currentView === 'invoices' && <InvoiceView config={config} po={activePO} logs={filteredLogs} />}
            {currentView === 'config' && <ConfigView config={config} setConfig={c => { setConfig(c); }} />}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showAddModal && <AddTripModal log={editingLog} onClose={() => { setShowAddModal(false); setEditingLog(null); }} onSave={addTrip} />}
          {showPoModal && <AddPoModal onClose={() => setShowPoModal(false)} onSave={addPo} />}
        </AnimatePresence>
      </main>
    </div>
  );
};

// ─── Views ───────────────────────────────────────────────────────────────────
const DashboardView = ({ po, logs, onSync, syncing }) => {
  const percent = Math.min((po.tripsCompleted / po.trips_authorised) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const late = logs.filter(l => l.status === 'Late').length;

  return (
    <div className="space-y-8">
      <div className="flex justify-end"><button onClick={onSync} disabled={syncing} className="btn btn-glass gap-2 text-[10px] font-black uppercase tracking-[2px] py-2 px-6 border-emerald-500/20 text-emerald-400">{syncing ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}Sync Scheduled Trips</button></div>
      <div className="glass glass-card flex items-center justify-between p-8 relative overflow-hidden border border-white/5">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] -mr-32 -mt-32" />
        <div className="flex-1 space-y-4 relative z-10">
          <p className="text-emerald-400 text-[10px] font-black uppercase tracking-[3px]">Contract Utilization</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">{po.tripsCompleted} / {po.trips_authorised} Trips</span><span className="text-emerald-400">{Math.round(percent)}%</span></div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} className="h-full bg-emerald-500" /></div>
          </div>
        </div>
        <div className="flex gap-12 pl-12 border-l border-white/5 relative z-10 ml-12">
          <div className="text-center"><p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Earned</p><p className="text-3xl font-black text-white">K {revenue.toLocaleString()}</p></div>
          <div className="text-center"><p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">Unused</p><p className="text-3xl font-black text-amber-500">{po.trips_authorised - po.tripsCompleted}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Cloud Status', val: 'Connected', sub: 'Live Sync Enabled', icon: Cloud, color: 'text-emerald-400' },
          { label: 'Performance', val: '98%', sub: 'On-time Logistics', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Late Trips', val: late, sub: 'Needs Attention', icon: AlertCircle, color: late > 0 ? 'text-rose-400' : 'text-slate-500' },
        ].map((kpi, i) => (
          <div key={i} className="glass glass-card p-6 border border-white/5">
            <div className={`p-2 w-fit rounded-lg bg-white/5 ${kpi.color} mb-4`}><kpi.icon size={20} /></div>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{kpi.label}</p>
            <p className="text-2xl font-black text-white mt-1">{kpi.val}</p>
            <p className="text-[10px] text-slate-500 mt-2 font-bold uppercase">{kpi.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const LogsView = ({ logs, onDelete, onEdit }) => {
  const [activeRoute, setActiveRoute] = useState('Chifubu');
  const filteredLogs = logs.filter(l => l.route === activeRoute);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
          {['Chifubu', 'Lubuto'].map(r => <button key={r} onClick={() => setActiveRoute(r)} className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeRoute === r ? 'bg-white/10 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}>{r}</button>)}
        </div>
        <button onClick={() => {}} className="btn btn-glass gap-2 text-[10px] font-black uppercase tracking-widest"><Download size={14} />Export Logs</button>
      </div>
      <div className="glass glass-card p-0 overflow-hidden border border-white/5">
        <table className="data-table">
          <thead><tr className="bg-white/2 text-[10px] uppercase tracking-[3px] text-slate-500"><th>Date</th><th>Shift</th><th>Sched</th><th>Actual</th><th>PAX</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {filteredLogs.map(row => (
              <tr key={row.id} className="border-t border-white/5 hover:bg-white/[0.01]">
                <td className="font-bold text-slate-300">{row.date}</td>
                <td><span className="px-2 py-1 rounded bg-emerald-500/10 text-[9px] font-black text-emerald-500 uppercase">{row.type}</span></td>
                <td className="text-slate-500 font-mono text-xs">{row.sched}</td>
                <td className="text-white font-black font-mono text-xs">{row.actual}</td>
                <td className="font-bold text-slate-400">{row.pax}</td>
                <td><span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>{row.status}</span></td>
                <td className="text-right"><div className="flex justify-end gap-3"><button onClick={() => onEdit(row)} className="text-slate-500 hover:text-emerald-400"><Settings size={14} /></button><button onClick={() => onDelete(row.id)} className="text-slate-500 hover:text-rose-400"><X size={14} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const PoManagementView = ({ pos, activePoId, onSwitch, onCreate }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {pos.map(po => (
      <div key={po.id} onClick={() => onSwitch(po.id)} className={`glass glass-card p-6 border transition-all cursor-pointer ${activePoId === po.id ? 'border-emerald-500/40 bg-emerald-500/[0.02]' : 'border-white/5 hover:border-white/20'}`}>
        <div className="flex justify-between mb-4"><h4 className="text-lg font-black text-white">{po.number}</h4><span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${po.status === 'CLOSED' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>{po.status}</span></div>
        <div className="space-y-3 mb-6">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Started</span><span className="text-slate-300">{po.start_date}</span></div>
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Rate</span><span className="text-emerald-400">K {po.rate}</span></div>
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500"><span>Limit</span><span className="text-slate-300">{po.trips_authorised} Trips</span></div>
        </div>
        <div className="text-[9px] font-black text-center text-slate-600 uppercase tracking-widest">{activePoId === po.id ? 'Active Focus' : 'Click to Switch'}</div>
      </div>
    ))}
    <div onClick={onCreate} className="glass glass-card flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/5 opacity-50 hover:opacity-100 hover:bg-white/[0.02] cursor-pointer gap-3 transition-all"><PlusCircle size={24} className="text-slate-500" /><p className="text-xs font-black uppercase tracking-widest text-slate-500">New Contract</p></div>
  </div>
);

const InvoiceView = ({ config, po, logs }) => {
  const total = logs.length * po.rate;
  return (
    <div className="space-y-6">
      <div className="flex justify-end"><button className="btn btn-primary gap-2 text-xs font-black uppercase tracking-[2px] py-4 px-8 border-emerald-500/20 shadow-xl shadow-emerald-500/10">Generate PDF Invoice</button></div>
      <div className="glass p-16 max-w-4xl mx-auto border border-white/5 relative bg-white/[0.01]">
        <div className="flex justify-between mb-16">
          <div><h2 className="text-3xl font-black text-emerald-400 tracking-tighter uppercase">{config.supplier.name}</h2><p className="text-[10px] text-slate-500 max-w-[200px] mt-2 font-bold uppercase leading-relaxed">{config.supplier.address}</p></div>
          <div className="text-right"><p className="text-6xl font-black text-white/5 tracking-tighter leading-none">INVOICE</p><p className="text-[10px] text-slate-500 font-black mt-2">{new Date().toLocaleDateString('en-GB')}</p></div>
        </div>
        <div className="mb-16"><p className="text-emerald-500 text-[10px] font-black uppercase tracking-[4px] mb-3">Bill To</p><h4 className="text-xl font-black text-white">{config.client.name}</h4><p className="text-[10px] text-slate-500 font-bold uppercase mt-2">{config.client.address}</p></div>
        <div className="border-y border-white/5 py-10 mb-10"><table className="w-full"><thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-600"><th className="text-left pb-6">Description</th><th className="text-center pb-6">Qty</th><th className="text-right pb-6">Total</th></tr></thead><tbody><tr className="text-white"><td className="py-4"><p className="font-black text-lg tracking-tight">Logistics: {po.number}</p><p className="text-[10px] text-slate-600 font-bold uppercase mt-1">Staff Transit Services</p></td><td className="text-center font-black text-xl">{logs.length}</td><td className="text-right font-black text-2xl text-emerald-400 font-mono">K {total.toLocaleString()}</td></tr></tbody></table></div>
        <div className="flex justify-between items-end"><div className="space-y-1"><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-4">Bank Info</p><p className="text-xs font-black text-slate-300">{config.banks[0].name}</p><p className="text-[10px] text-slate-600 font-bold uppercase">Acc: {config.banks[0].account}</p></div><p className="text-4xl font-black text-white tracking-tighter">Total Due: <span className="text-emerald-400">K {total.toLocaleString()}</span></p></div>
      </div>
    </div>
  );
};

const ConfigView = ({ config }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
    <div className="glass glass-card p-10 border border-white/5 space-y-8"><h4 className="text-lg font-black text-white flex items-center gap-2"><Settings size={20} className="text-emerald-400" />Supplier Settings</h4>{Object.entries(config.supplier).map(([k, v]) => ( <div key={k}><label className="text-[9px] font-black uppercase tracking-[3px] text-slate-600 mb-2 block">{k}</label><input value={v} className="input-field" readOnly /></div> ))}</div>
    <div className="glass glass-card p-10 border border-white/5 space-y-8"><h4 className="text-lg font-black text-white flex items-center gap-2"><Bus size={20} className="text-emerald-400" />Client Settings</h4>{Object.entries(config.client).map(([k, v]) => ( <div key={k}><label className="text-[9px] font-black uppercase tracking-[3px] text-slate-600 mb-2 block">{k}</label><input value={v} className="input-field" readOnly /></div> ))}</div>
  </div>
);

const AddTripModal = ({ log, onClose, onSave }) => {
  const [f, setF] = useState(log || { isoDate: new Date().toISOString().split('T')[0], route: 'Chifubu', type: 'Morning', sched: '06:00', actual: '06:00', pax: 42 });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} /><motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative glass glass-card w-full max-w-xl p-12 border border-white/10 shadow-2xl"><h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">{log ? 'Modify Trip' : 'New Trip Activity'}</h3><div className="grid grid-cols-2 gap-6 mb-8"><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Date</label><input type="date" value={f.isoDate} onChange={e => setF({...f, isoDate: e.target.value})} className="input-field" /></div><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Route</label><select value={f.route} onChange={e => setF({...f, route: e.target.value})} className="input-field"><option>Chifubu</option><option>Lubuto</option></select></div></div><div className="flex gap-4 mb-8">{['Morning', 'Day Shift'].map(s => <button key={s} onClick={() => setF({...f, type:s, sched:s==='Morning'?'06:00':'16:00', actual:s==='Morning'?'06:00':'16:00'})} className={`flex-1 py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${f.type===s?'bg-emerald-500/20 border-emerald-500/50 text-emerald-400':'border-white/5 text-slate-500 hover:bg-white/5'}`}>{s}</button>)}</div><div className="grid grid-cols-2 gap-6 mb-10"><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Actual Time</label><input type="time" value={f.actual} onChange={e => setF({...f, actual: e.target.value})} className="input-field" /></div><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">PAX</label><input type="number" value={f.pax} onChange={e => setF({...f, pax: e.target.value})} className="input-field" /></div></div><button onClick={() => onSave(f)} className="w-full btn btn-primary py-5 text-xs font-black uppercase tracking-[4px]">Confirm & Sync Trip</button></motion.div></div>
  );
};

const AddPoModal = ({ onClose, onSave }) => {
  const [f, setF] = useState({ number: '', start_date: new Date().toISOString().split('T')[0], trips_authorised: 63, rate: 790 });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} /><motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative glass glass-card w-full max-w-lg p-12 border border-white/10 shadow-2xl"><h3 className="text-3xl font-black text-white uppercase tracking-tighter mb-8">Create Contract</h3><div className="space-y-6 mb-10"><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">PO Number</label><input placeholder="e.g. PO-002" onChange={e => setF({...f, number: e.target.value})} className="input-field" /></div><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Start Date</label><input type="date" value={f.start_date} onChange={e => setF({...f, start_date: e.target.value})} className="input-field" /></div><div className="grid grid-cols-2 gap-6"><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Trip Limit</label><input type="number" value={f.trips_authorised} onChange={e => setF({...f, trips_authorised: parseInt(e.target.value)})} className="input-field" /></div><div><label className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-2 block">Rate (K)</label><input type="number" value={f.rate} onChange={e => setF({...f, rate: parseFloat(e.target.value)})} className="input-field" /></div></div></div><button onClick={() => onSave(f)} className="w-full btn btn-primary py-5 text-xs font-black uppercase tracking-[4px]">Initialize PO</button></motion.div></div>
  );
};

export default App;
