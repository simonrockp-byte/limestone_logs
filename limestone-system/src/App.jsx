import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle,
  TrendingUp, Bus, LogOut, AlertCircle, CheckCircle2,
  Wallet, X, Download, Cloud, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// ─── Constants ───────────────────────────────────────────────────────────────
const INITIAL_CONFIG = {
  supplier: {
    name: 'Hamoney Investments Limited',
    address: 'Plot 123, Independence Ave, Ndola',
    phone: '+260 971 234 567',
    email: 'info@hamoney.com',
  },
  client: {
    name: 'Limestone Resources Limited',
    address: 'Copperbelt Road, Ndola',
    contact: 'Operations Manager',
  },
  banks: [
    { id: 1, name: 'Stanbic Bank', account: '904000123456', branch: 'Ndola', swift: 'SBICZM', active: true },
    { id: 2, name: 'ZANACO', account: '5800123456789', branch: 'Main', swift: 'ZNCOZM', active: false },
  ],
};

const DEFAULT_PO = { id: 'po-001', number: 'PO-001', start_date: '2026-04-23', trips_authorised: 63, rate: 790, status: 'IN PROGRESS' };
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

// ─── Export Helpers ───────────────────────────────────────────────────────────
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

// ─── Nav items ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',        icon: LayoutDashboard },
  { id: 'logs',       label: 'Trip Logs',         icon: ClipboardList },
  { id: 'pos',        label: 'PO Reconciliation', icon: Wallet },
  { id: 'invoices',   label: 'Invoices',          icon: FileText },
  { id: 'config',     label: 'Configuration',     icon: Settings },
];

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

  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) {
        setLoading(false);
        const saved = localStorage.getItem('limestone_logs_v2');
        if (saved) setLogs(JSON.parse(saved));
        return;
      }
      try {
        const { data: poData } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
        const { data: logData } = await supabase.from('trip_logs').select('*').order('iso_date', { ascending: false });
        const { data: configData } = await supabase.from('system_config').select('data').eq('id', 'main_config').single();

        if (poData?.length) {
          setPos(poData);
          setActivePoId(poData[0].id);
        }
        if (logData?.length) setLogs(logData);
        if (configData) setConfig(configData.data);
      } catch (err) {
        console.error('Supabase fetch failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const saveLog = async (log) => {
    if (!supabase) return;
    setSyncing(true);
    const { error } = await supabase.from('trip_logs').upsert({
      id: log.id, date: log.date, iso_date: log.isoDate,
      route: log.route, type: log.type, sched: log.sched,
      actual: log.actual, pax: parseInt(log.pax), status: log.status,
      po_id: activePoId
    });
    if (error) console.error('Sync error:', error);
    setSyncing(false);
  };

  const deleteLog = async (id) => {
    setSyncing(true);
    if (supabase) {
      const { error } = await supabase.from('trip_logs').delete().eq('id', id);
      if (!error) setLogs(logs.filter(l => l.id !== id));
    } else {
      setLogs(logs.filter(l => l.id !== id));
    }
    setSyncing(false);
  };

  const saveConfig = async (newConfig) => {
    if (!supabase) return;
    setSyncing(true);
    const { error } = await supabase.from('system_config').upsert({ id: 'main_config', data: newConfig });
    if (error) console.error('Config sync error:', error);
    setSyncing(false);
  };

  const addTrip = (trip) => {
    const newLog = {
      ...trip,
      id: trip.id || `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`,
      status: trip.actual <= trip.sched ? 'On Time' : 'Late',
      date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
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

  const syncScheduledTrips = async () => {
    setSyncing(true);
    const today = new Date().toISOString().split('T')[0];
    const workingDays = getWorkingDays(INITIAL_PO.startDate, today).filter(d => d.isWorking);
    const newTrips = [];

    workingDays.forEach(day => {
      ['Chifubu', 'Lubuto'].forEach(route => {
        [{ type: 'Morning', sched: '06:00' }, { type: 'Day Shift', sched: '16:00' }].forEach(shift => {
          const exists = logs.some(l => l.iso_date === day.iso && l.route === route && l.type === shift.type);
          if (!exists) {
            newTrips.push({
              id: `${day.iso}-${route}-${shift.type}-${Date.now()}`,
              date: day.label,
              iso_date: day.iso,
              route,
              type: shift.type,
              sched: shift.sched,
              actual: shift.sched,
              pax: 42,
              status: 'On Time'
            });
          }
        });
      });
    });

    if (newTrips.length > 0) {
      if (supabase) {
        const { data, error } = await supabase.from('trip_logs').insert(newTrips).select();
        if (!error) setLogs([...data, ...logs]);
      } else {
        setLogs([...newTrips, ...logs]);
      }
    }
    setSyncing(false);
  };

  const syncScheduledTrips = async () => {
    setSyncing(true);
    const today = new Date().toISOString().split('T')[0];
    const workingDays = getWorkingDays(INITIAL_PO.startDate, today).filter(d => d.isWorking);
    const newTrips = [];

    workingDays.forEach(day => {
      ['Chifubu', 'Lubuto'].forEach(route => {
        [{ type: 'Morning', sched: '06:00' }, { type: 'Day Shift', sched: '16:00' }].forEach(shift => {
          const exists = logs.some(l => l.iso_date === day.iso && l.route === route && l.type === shift.type);
          if (!exists) {
            newTrips.push({
              id: `${day.iso}-${route}-${shift.type}-${Date.now()}`,
              date: day.label,
              iso_date: day.iso,
              route,
              type: shift.type,
              sched: shift.sched,
              actual: shift.sched,
              pax: 42,
              status: 'On Time',
            });
          }
        });
      });
    });

    if (newTrips.length > 0) {
      if (supabase) {
        const { data, error } = await supabase.from('trip_logs').insert(newTrips).select();
        if (!error) setLogs(prev => [...data, ...prev]);
      } else {
        setLogs(prev => [...newTrips, ...prev]);
      }
    }
    setSyncing(false);
  };

  const addPo = async (newPo) => {
    setSyncing(true);
    const po = { ...newPo, id: `po-${Date.now()}` };
    if (supabase) {
      const { error } = await supabase.from('purchase_orders').insert(po);
      if (!error) {
        setPos([po, ...pos]);
        setActivePoId(po.id);
      }
    } else {
      setPos([po, ...pos]);
      setActivePoId(po.id);
    }
    setShowPoModal(false);
    setSyncing(false);
  };

  const activePO = pos.find(p => p.id === activePoId) || DEFAULT_PO;
  const filteredLogs = logs.filter(l => l.po_id === activePoId);
  const activePOTripsCompleted = filteredLogs.length;
  const poWithStats = { ...activePO, tripsCompleted: activePOTripsCompleted };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#05060f', color: '#10b981', gap: 16 }}>
      <Loader2 className="animate-spin" size={40} />
      <p style={{ color: '#64748b', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Connecting to cloud…</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="bg-glow" />

      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36, paddingLeft: 4 }}>
          <div style={{ padding: 8, borderRadius: 10, background: 'rgba(16,185,129,0.15)', color: '#10b981', display: 'flex' }}>
            <Bus size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>Hamoney</h1>
            <p style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Logistics System</p>
          </div>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = currentView === id;
            return (
              <button
                key={id}
                onClick={() => setCurrentView(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10, border: 'none',
                  cursor: 'pointer', width: '100%', textAlign: 'left',
                  fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
                  transition: 'all 0.15s ease',
                  background: active ? 'rgba(16,185,129,0.1)' : 'transparent',
                  color: active ? '#10b981' : '#64748b',
                  boxShadow: active ? 'inset 0 0 0 1px rgba(16,185,129,0.2)' : 'none',
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Sync badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, marginBottom: 16,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          fontSize: 11, color: '#475569',
        }}>
          {syncing
            ? <Loader2 size={13} className="animate-spin" style={{ color: '#10b981' }} />
            : <Cloud size={13} style={{ color: supabase ? '#10b981' : '#f59e0b' }} />}
          <span>{!supabase ? 'Local storage' : syncing ? 'Syncing…' : 'Live'}</span>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 10, border: 'none',
            cursor: 'pointer', width: '100%', background: 'transparent',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600,
            color: '#475569', transition: 'color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#f43f5e'}
            onMouseLeave={e => e.currentTarget.style.color = '#475569'}
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', textTransform: 'capitalize', letterSpacing: '-0.02em' }}>
              {currentView === 'pos' ? 'PO Management' : currentView}
            </h2>
            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <select 
              value={activePoId} 
              onChange={(e) => setActivePoId(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', width: 'auto', fontSize: 12, height: 32 }}
            >
              {pos.map(p => <option key={p.id} value={p.id}>{p.number}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-glass" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.2)' }} onClick={() => setShowPoModal(true)}>
              <PlusCircle size={16} /> New PO
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <PlusCircle size={16} /> New Trip
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {currentView === 'dashboard' && <DashboardView po={poWithStats} logs={filteredLogs} onSync={syncScheduledTrips} syncing={syncing} />}
            {currentView === 'logs'      && <LogsView logs={filteredLogs} onDelete={deleteLog} onEdit={(l) => { setEditingLog(l); setShowAddModal(true); }} />}
            {currentView === 'pos'       && <PoManagementView pos={pos} activePoId={activePoId} onSwitch={setActivePoId} />}
            {currentView === 'invoices'  && <InvoiceView config={config} po={activePO} logs={filteredLogs} />}
            {currentView === 'config'    && <ConfigView config={config} setConfig={c => { setConfig(c); saveConfig(c); }} />}
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
const DashboardView = ({ po, logs, onSync, syncing }) => {
  const percent = Math.min((po.tripsCompleted / po.tripsAuthorised) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const late = logs.filter(l => l.status === 'Late').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
        <button 
          onClick={onSync} 
          disabled={syncing}
          className="btn btn-glass"
          style={{ 
            fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
            padding: '8px 16px', color: '#10b981', borderColor: 'rgba(16,185,129,0.2)' 
          }}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
          {syncing ? 'Synchronizing...' : 'Sync All Scheduled'}
        </button>
      </div>
      {/* Revenue banner */}
      <div className="glass glass-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '32px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, background: 'rgba(16,185,129,0.08)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
            <TrendingUp size={14} /> Revenue Overview
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
            <span style={{ color: '#94a3b8' }}>{po.tripsCompleted} / {po.tripsAuthorised} trips</span>
            <span style={{ color: '#10b981', fontWeight: 700 }}>{Math.round(percent)}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg, #059669, #10b981)', borderRadius: 99 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 48, paddingLeft: 48, borderLeft: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Total Earned</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>K {revenue.toLocaleString()}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Remaining</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', fontFamily: 'Outfit, sans-serif' }}>{po.tripsAuthorised - po.tripsCompleted}</p>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        {[
          { label: 'Cloud Database', val: 'Supabase', sub: 'Real-time sync', icon: Cloud, color: '#10b981' },
          { label: 'On-time Rate', val: '98%', sub: 'Logistics performance', icon: CheckCircle2, color: '#10b981' },
          { label: 'Late Trips', val: late, sub: 'Requires review', icon: AlertCircle, color: late > 0 ? '#f43f5e' : '#475569' },
        ].map(({ label, val, sub, icon: Icon, color }, i) => (
          <div key={i} className="glass glass-card">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color, marginBottom: 16 }}>
              <Icon size={18} />
            </div>
            <p style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{label}</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: 'Outfit, sans-serif', margin: '4px 0 6px' }}>{val}</p>
            <p style={{ fontSize: 12, color: '#475569' }}>{sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Logs ─────────────────────────────────────────────────────────────────────
const LogsView = ({ logs, onDelete, onEdit }) => {
  const [activeRoute, setActiveRoute] = useState('Chifubu');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const filteredLogs = logs.filter(l => l.route === activeRoute);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Route tabs */}
        <div style={{ display: 'flex', gap: 4, padding: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
          {['Chifubu', 'Lubuto'].map(r => (
            <button
              key={r}
              onClick={() => setActiveRoute(r)}
              style={{
                padding: '7px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700,
                transition: 'all 0.15s',
                background: activeRoute === r ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: activeRoute === r ? '#10b981' : '#64748b',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Export */}
        <div style={{ position: 'relative' }}>
          <button className="btn btn-glass" onClick={() => setShowExportMenu(v => !v)}>
            <Download size={15} /> Export
          </button>
          <AnimatePresence>
            {showExportMenu && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.12 }}
                className="glass"
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 200, borderRadius: 10, overflow: 'hidden', zIndex: 20 }}
              >
                <button onClick={() => { exportToPDF(logs); setShowExportMenu(false); }} style={exportItemStyle}>
                  PDF Report
                </button>
                <button onClick={() => { exportToExcel(logs); setShowExportMenu(false); }} style={{ ...exportItemStyle, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  Excel Sheet
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="glass glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Shift</th><th>Scheduled</th><th>Actual</th><th>PAX</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', color: '#475569', padding: 32, fontSize: 13 }}>No logs for this route yet.</td></tr>
              : filteredLogs.map(row => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 600, color: '#e2e8f0' }}>{row.date}</td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.1)', fontSize: 10, fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {row.type}
                    </span>
                  </td>
                  <td style={{ color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{row.sched}</td>
                  <td style={{ color: '#fff', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{row.actual}</td>
                  <td style={{ color: '#94a3b8', fontWeight: 600 }}>{row.pax}</td>
                  <td>
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      ...(row.status === 'On Time'
                        ? { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }
                        : { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' })
                    }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => onEdit(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><Settings size={14} /></button>
                      <button onClick={() => onDelete(row.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f43f5e' }}><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

const exportItemStyle = {
  display: 'block', width: '100%', padding: '11px 16px',
  background: 'transparent', border: 'none', cursor: 'pointer',
  textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#94a3b8',
  fontFamily: 'Inter, sans-serif', transition: 'background 0.1s',
};

                          ? <span style={{ color: '#10b981' }}>✓</span>
                          : <span style={{ color: '#f43f5e', opacity: 0.3 }}>✗</span>}
                      </td>
                    ))
                    : <td colSpan={4} style={{ textAlign: 'center', fontSize: 10, color: '#334155', fontStyle: 'italic', letterSpacing: '0.1em' }}>NO SERVICE</td>
                  }
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#10b981', fontWeight: 700, fontSize: 12 }}>
                    {day.isWorking ? runningTotal : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Invoice ──────────────────────────────────────────────────────────────────
const InvoiceView = ({ config, po, logs }) => {
  const totalAmount = logs.length * po.rate;
  const activeBank = config.banks.find(b => b.active) || config.banks[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" style={{ padding: '12px 28px' }} onClick={() => exportInvoicePDF(config, po, logs)}>
          <FileText size={16} /> Generate PDF
        </button>
      </div>

      <div className="glass" style={{ padding: '56px 64px', borderRadius: 20, maxWidth: 860, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 52 }}>
          <div>
            <h4 style={{ fontSize: 22, fontWeight: 900, color: '#10b981', letterSpacing: '-0.03em', marginBottom: 6, fontFamily: 'Outfit, sans-serif' }}>
              {config.supplier.name}
            </h4>
            <p style={{ fontSize: 12, color: '#475569', lineHeight: 1.7 }}>{config.supplier.address}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 52, fontWeight: 900, color: 'rgba(255,255,255,0.04)', fontFamily: 'Outfit, sans-serif', lineHeight: 1, marginBottom: -8 }}>INVOICE</p>
            <p style={{ fontSize: 11, color: '#475569', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {new Date().toLocaleDateString('en-GB')}
            </p>
          </div>
        </div>

        {/* Client */}
        <div style={{ marginBottom: 44 }}>
          <p style={{ fontSize: 10, color: '#10b981', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: 10 }}>Bill To</p>
          <h5 style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'Outfit, sans-serif', marginBottom: 4 }}>{config.client.name}</h5>
          <p style={{ fontSize: 12, color: '#475569' }}>{config.client.address}</p>
        </div>

        {/* Line items */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '32px 0', marginBottom: 40 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <th style={{ textAlign: 'left', paddingBottom: 16, fontWeight: 700 }}>Description</th>
                <th style={{ textAlign: 'center', paddingBottom: 16, fontWeight: 700 }}>Qty</th>
                <th style={{ textAlign: 'right', paddingBottom: 16, fontWeight: 700 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ paddingTop: 8 }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9', fontFamily: 'Outfit, sans-serif' }}>Logistics Services: {po.number}</p>
                  <p style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>Staff transport services per agreement.</p>
                </td>
                <td style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, color: '#fff', paddingTop: 8 }}>{logs.length}</td>
                <td style={{ textAlign: 'right', fontSize: 20, fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif', paddingTop: 8 }}>
                  K {totalAmount.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div>
            <p style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Banking Details</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{activeBank.name}</p>
            <p style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>ACC: {activeBank.account}</p>
            <p style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>SWIFT: {activeBank.swift}</p>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <p style={{ fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 4 }}>TOTAL DUE</p>
            <p style={{ fontSize: 30, fontWeight: 900, color: '#10b981', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.03em' }}>
              K {totalAmount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Config ───────────────────────────────────────────────────────────────────
const ConfigView = ({ config, setConfig }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
    {[
      { title: 'Supplier', icon: Settings, key: 'supplier' },
      { title: 'Client', icon: Bus, key: 'client' },
    ].map(({ title, icon: Icon, key }) => (
      <div key={key} className="glass glass-card" style={{ padding: 32 }}>
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 28, fontFamily: 'Outfit, sans-serif' }}>
          <Icon size={18} style={{ color: '#10b981' }} /> {title} Info
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Object.entries(config[key]).map(([k, v]) => (
            <div key={k}>
              <label style={{ display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#475569', fontWeight: 700, marginBottom: 8 }}>{k}</label>
              <input
                type="text"
                value={v}
                className="input-field"
                onChange={e => setConfig({ ...config, [key]: { ...config[key], [k]: e.target.value } })}
              />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

// ─── Add Trip Modal ───────────────────────────────────────────────────────────
const AddTripModal = ({ log, onClose, onSave }) => {
  const [form, setForm] = useState(log || {
    isoDate: new Date().toISOString().split('T')[0],
    route: 'Chifubu',
    type: 'Morning',
    sched: '06:00',
    actual: '06:00',
    pax: 42,
  });

  const setShift = (s) => setForm({ ...form, type: s, sched: s === 'Morning' ? '06:00' : '16:00', actual: s === 'Morning' ? '06:00' : '16:00' });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose} />
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="glass glass-card"
        style={{ position: 'relative', width: '100%', maxWidth: 520, padding: 36, boxShadow: '0 0 60px rgba(16,185,129,0.08)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', fontFamily: 'Outfit, sans-serif' }}>Log New Trip</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.isoDate} className="input-field" onChange={e => setForm({ ...form, isoDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Route</label>
              <select value={form.route} className="input-field" onChange={e => setForm({ ...form, route: e.target.value })}>
                <option>Chifubu</option><option>Lubuto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label" style={{ marginBottom: 10 }}>Shift</label>
            <div style={{ display: 'flex', gap: 10 }}>
              {['Morning', 'Day Shift'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShift(s)}
                  style={{
                    flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid',
                    cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                    ...(form.type === s
                      ? { background: 'rgba(16,185,129,0.15)', borderColor: 'rgba(16,185,129,0.4)', color: '#10b981' }
                      : { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', color: '#475569' })
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">Actual Time</label>
              <input type="time" value={form.actual} className="input-field" onChange={e => setForm({ ...form, actual: e.target.value })} />
            </div>
            <div>
              <label className="label">Passengers</label>
              <input type="number" value={form.pax} className="input-field" onChange={e => setForm({ ...form, pax: e.target.value })} />
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '13px 0', marginTop: 4, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase' }}
            onClick={() => onSave(form)}
          >
            Save Trip
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default App;
