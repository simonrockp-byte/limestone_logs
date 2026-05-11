import React, { useState, useEffect } from 'react';
import { LayoutDashboard, ClipboardList, FileText, Settings, PlusCircle, TrendingUp, Bus, Calendar, ChevronRight, LogOut, AlertCircle, CheckCircle2, Wallet, X, CheckCheck, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const exportToPDF = (logs) => {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text('Hamoney Investments — Trip Log Report', 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`PO-001  |  Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [['Date', 'Route', 'Shift', 'Sched', 'Actual', 'PAX', 'Status']],
    body: logs.map(l => [l.date, l.route, l.type, l.sched, l.actual, l.pax, l.status]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    foot: [[{ content: `Total Trips: ${logs.length}`, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [230, 245, 238] } }]],
    showFoot: 'lastPage',
  });
  doc.save('hamoney_trip_logs.pdf');
};

const exportToExcel = (logs) => {
  const rows = logs.map((l, i) => ({ '#': i + 1, Date: l.date, Route: l.route, Shift: l.type, Scheduled: l.sched, Actual: l.actual, PAX: l.pax, Status: l.status }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 4 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 6 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trip Logs');
  XLSX.writeFile(wb, 'hamoney_trip_logs.xlsx');
};

const exportInvoicePDF = (config, po, logs) => {
  const doc = new jsPDF();
  const total = logs.length * po.rate;
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.text('INVOICE', 140, 25);
  
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Invoice #: INV-${po.number}-${new Date().getFullYear()}`, 140, 32);
  doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`, 140, 37);

  // Supplier
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(config.supplier.name, 14, 25);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(config.supplier.address, 14, 32);
  doc.text(config.supplier.phone, 14, 37);
  doc.text(config.supplier.email, 14, 42);

  // Bill To
  doc.setFontSize(10);
  doc.setTextColor(16, 185, 129);
  doc.text('BILL TO:', 14, 60);
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(config.client.name, 14, 67);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(config.client.address, 14, 74);
  doc.text(`Attn: ${config.client.contact}`, 14, 79);

  // Table
  autoTable(doc, {
    startY: 95,
    head: [['Description', 'Qty', 'Unit Price', 'Total']],
    body: [
      [`Logistics Services for ${po.number}\nPeriod: 23/04/2026 - ${new Date().toLocaleDateString('en-GB')}`, logs.length, `K ${po.rate}`, `K ${total.toLocaleString()}`]
    ],
    headStyles: { fillColor: [16, 185, 129] },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    }
  });

  const finalY = doc.lastAutoTable.finalY + 10;

  // Summary
  doc.setFontSize(10);
  doc.text('Subtotal:', 140, finalY);
  doc.text(`K ${total.toLocaleString()}`, 190, finalY, { align: 'right' });
  doc.setFontSize(12);
  doc.setTextColor(16, 185, 129);
  doc.text('TOTAL DUE:', 140, finalY + 10);
  doc.text(`K ${total.toLocaleString()}`, 190, finalY + 10, { align: 'right' });

  // Bank Details
  doc.setTextColor(100);
  doc.setFontSize(9);
  doc.text('PAYMENT DETAILS:', 14, finalY + 30);
  const activeBank = config.banks.find(b => b.active) || config.banks[0];
  doc.text(`Bank: ${activeBank.name}`, 14, finalY + 37);
  doc.text(`Account: ${activeBank.account}`, 14, finalY + 42);
  doc.text(`Branch: ${activeBank.branch} / Swift: ${activeBank.swift}`, 14, finalY + 47);

  doc.save(`Invoice_${po.number}.pdf`);
};

const INITIAL_CONFIG = {
  supplier: { name: "Hamoney Investments Limited", address: "Plot 123, Independence Ave, Ndola", phone: "+260 971 234 567", email: "info@hamoney.com" },
  client: { name: "Limestone Resources Limited", address: "Copperbelt Road, Ndola", contact: "Operations Manager" },
  banks: [
    { id: 1, name: "Stanbic Bank", account: "904000123456", branch: "Ndola", swift: "SBICZM", active: true },
    { id: 2, name: "ZANACO", account: "5800123456789", branch: "Main", swift: "ZNCOZM", active: false }
  ]
};

const INITIAL_PO = { number: "PO-001", startDate: "2026-04-23", tripsAuthorised: 63, rate: 790, status: "IN PROGRESS" };

// Zambia Public Holidays 2026 relevant to this PO period
const PUBLIC_HOLIDAYS = ['2026-04-28', '2026-05-01'];

// Generate working days from start to today
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

// Fixed PAX values per day (deterministic, not random)
const PAX_TABLE = { 'Chifubu': { 'Morning': 44, 'Day Shift': 42 }, 'Lubuto': { 'Morning': 40, 'Day Shift': 38 } };

const buildSeedLogs = () => {
  const days = getWorkingDays('2026-04-23', '2026-05-11').filter(d => d.isWorking);
  const logs = [];
  days.forEach(day => {
    ['Chifubu', 'Lubuto'].forEach(route => {
      [{ type: 'Morning', sched: '06:00' }, { type: 'Day Shift', sched: '16:00' }].forEach(shift => {
        logs.push({ id: `${day.iso}-${route}-${shift.type}`, date: day.label, isoDate: day.iso, route, type: shift.type, sched: shift.sched, actual: shift.sched, pax: PAX_TABLE[route][shift.type], status: 'On Time' });
      });
    });
  });
  return logs;
};

const SEED_LOGS = buildSeedLogs();

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'logs', label: 'Trip Logs', icon: ClipboardList },
  { id: 'pos', label: 'PO Reconciliation', icon: Wallet },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'config', label: 'Configuration', icon: Settings },
];

const App = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('limestone_config');
    return saved ? JSON.parse(saved) : INITIAL_CONFIG;
  });
  const [po] = useState(INITIAL_PO);
  const [showAddModal, setShowAddModal] = useState(false);

  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('limestone_logs_v2');
    return saved ? JSON.parse(saved) : SEED_LOGS;
  });

  useEffect(() => { localStorage.setItem('limestone_logs_v2', JSON.stringify(logs)); }, [logs]);

  useEffect(() => {
    localStorage.setItem('limestone_config', JSON.stringify(config));
  }, [config]);

  const addTrip = (trip) => {
    const newLog = { ...trip, id: `${trip.isoDate}-${trip.route}-${trip.type}-${Date.now()}`, status: trip.actual <= trip.sched ? 'On Time' : 'Late', date: new Date(trip.isoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) };
    setLogs([newLog, ...logs]);
    setShowAddModal(false);
  };

  const activePO = { ...po, tripsCompleted: logs.length };

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
          {menuItems.map((item) => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${currentView === item.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'}`}>
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
              {currentView === item.id && <motion.div layoutId="active" className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
            </button>
          ))}
        </nav>
        <div className="mt-auto pt-6 border-t border-white/5">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-rose-400 transition-colors">
            <LogOut size={20} /><span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">{menuItems.find(i => i.id === currentView)?.label}</h2>
            <p className="text-slate-400">Welcome back, Hamoney Admin</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn btn-glass"><Calendar size={18} /><span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}><PlusCircle size={18} /><span>New Trip</span></button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={currentView} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {currentView === 'dashboard' && <DashboardView po={activePO} logs={logs} />}
            {currentView === 'logs' && <LogsView logs={logs} />}
            {currentView === 'pos' && <ReconciliationView logs={logs} po={activePO} />}
            {currentView === 'invoices' && <InvoiceView config={config} po={activePO} logs={logs} />}
            {currentView === 'config' && <ConfigView config={config} setConfig={setConfig} />}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showAddModal && <AddTripModal onClose={() => setShowAddModal(false)} onSave={addTrip} />}
        </AnimatePresence>
      </main>
    </div>
  );
};

// ─── Dashboard ──────────────────────────────────────────────────────────────
const DashboardView = ({ po, logs }) => {
  const percent = Math.min((po.tripsCompleted / po.tripsAuthorised) * 100, 100);
  const revenue = po.tripsCompleted * po.rate;
  const remaining = Math.max(0, po.tripsAuthorised - po.tripsCompleted);
  const late = logs.filter(l => l.status === 'Late').length;

  return (
    <div className="space-y-8">
      <div className="glass glass-card flex items-center justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-emerald-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover:bg-emerald-500/10 transition-colors" />
        <div className="space-y-4 flex-1 max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm tracking-wider uppercase">
            <TrendingUp size={16} /><span>Active Purchase Order — {po.number}</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Progress: {po.tripsCompleted} / {po.tripsAuthorised} Trips</span>
              <span className="text-emerald-400 font-bold">{Math.round(percent)}%</span>
            </div>
            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, ease: "easeOut" }} className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400" />
            </div>
          </div>
        </div>
        <div className="flex gap-8 pl-12 border-l border-white/5">
          <div className="text-center"><p className="text-slate-500 text-xs uppercase tracking-widest mb-1">Rate/Trip</p><p className="text-2xl font-bold text-white">K {po.rate}</p></div>
          <div className="text-center"><p className="text-slate-500 text-xs uppercase tracking-widest mb-1">Remaining</p><p className="text-2xl font-bold text-gold">{remaining}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Revenue Earned', val: `K ${revenue.toLocaleString()}`, sub: `${po.tripsCompleted} trips × K${po.rate}`, icon: Wallet, color: 'text-emerald-400' },
          { label: 'Trips Completed', val: po.tripsCompleted, sub: 'Chifubu + Lubuto', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Trips Remaining', val: remaining, sub: `of ${po.tripsAuthorised} authorised`, icon: AlertCircle, color: remaining < 10 ? 'text-amber-400' : 'text-slate-400' },
          { label: 'Late Departures', val: late, sub: 'Across all logs', icon: AlertCircle, color: late > 0 ? 'text-rose-400' : 'text-slate-400' },
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

// ─── Trip Logs ───────────────────────────────────────────────────────────────
const LogsView = ({ logs }) => {
  const [activeRoute, setActiveRoute] = useState('Chifubu');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const filteredLogs = logs.filter(l => l.route === activeRoute);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 p-1 bg-white/5 w-fit rounded-xl border border-white/5">
          {['Chifubu', 'Lubuto'].map(r => (
            <button key={r} onClick={() => setActiveRoute(r)}
              className={`px-6 py-2 rounded-lg transition-all ${activeRoute === r ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}>
              {r} Route <span className="ml-2 text-xs text-emerald-400">({logs.filter(l => l.route === r).length})</span>
            </button>
          ))}
        </div>

        {/* Export Button */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(v => !v)}
            className="btn btn-glass flex items-center gap-2"
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          {showExportMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute right-0 mt-2 w-44 glass rounded-xl border border-white/10 z-20 overflow-hidden"
            >
              <button
                onClick={() => { exportToPDF(logs); setShowExportMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <span className="text-rose-400 font-bold text-xs">PDF</span>
                Export as PDF
              </button>
              <button
                onClick={() => { exportToExcel(logs); setShowExportMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors border-t border-white/5"
              >
                <span className="text-emerald-400 font-bold text-xs">XLS</span>
                Export as Excel
              </button>
            </motion.div>
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
                <td><span className="px-2 py-1 rounded-md bg-white/5 text-xs text-slate-300 uppercase font-semibold">{row.type}</span></td>
                <td className="text-slate-400">{row.sched}</td>
                <td className="text-white font-medium">{row.actual}</td>
                <td>{row.pax}</td>
                <td><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLogs.length === 0 && <div className="py-20 text-center text-slate-500">No logs for this route</div>}
      </div>
    </div>
  );
};

// ─── PO Reconciliation View ──────────────────────────────────────────────────
const ReconciliationView = ({ logs, po }) => {
  const allDays = getWorkingDays('2026-04-23', '2026-05-11');
  const ROUTES = ['Chifubu', 'Lubuto'];
  const SHIFTS = ['Morning', 'Day Shift'];

  const hasLog = (isoDate, route, type) => logs.some(l => l.isoDate === isoDate && l.route === route && l.type === type);
  const dayTrips = (isoDate) => logs.filter(l => l.isoDate === isoDate).length;

  const runningTotal = { count: 0 };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Working Days', val: allDays.filter(d => d.isWorking).length },
          { label: 'Trips Logged', val: logs.length },
          { label: 'Trips Remaining', val: Math.max(0, po.tripsAuthorised - logs.length) },
          { label: 'Revenue to Date', val: `K ${(logs.length * po.rate).toLocaleString()}` },
        ].map((s, i) => (
          <div key={i} className="glass glass-card py-4">
            <p className="text-slate-500 text-xs uppercase tracking-widest">{s.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Reconciliation table */}
      <div className="glass glass-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-2">
          <CheckCheck size={18} className="text-emerald-400" />
          <h3 className="font-bold text-white">Day-by-Day Reconciliation — PO-001</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th className="text-center">Chifubu AM</th>
                <th className="text-center">Chifubu Day</th>
                <th className="text-center">Lubuto AM</th>
                <th className="text-center">Lubuto Day</th>
                <th className="text-center">Trips/Day</th>
                <th className="text-right">Running Total</th>
              </tr>
            </thead>
            <tbody>
              {allDays.map(day => {
                const tripsToday = day.isWorking ? dayTrips(day.iso) : 0;
                if (day.isWorking) runningTotal.count += tripsToday;

                return (
                  <tr key={day.iso} className={!day.isWorking ? 'opacity-30' : ''}>
                    <td className="font-medium text-sm">{day.label}</td>
                    <td>
                      {!day.isWorking
                        ? <span className="text-xs text-slate-600 italic">{day.reason}</span>
                        : <span className="text-slate-400 text-xs">{day.dayName}</span>
                      }
                    </td>
                    {day.isWorking
                      ? [['Chifubu', 'Morning'], ['Chifubu', 'Day Shift'], ['Lubuto', 'Morning'], ['Lubuto', 'Day Shift']].map(([route, type]) => (
                        <td key={`${route}-${type}`} className="text-center">
                          {hasLog(day.iso, route, type)
                            ? <span className="text-emerald-400">✓</span>
                            : <span className="text-rose-500">✗</span>
                          }
                        </td>
                      ))
                      : <td colSpan={4} className="text-center text-slate-600 text-xs italic">{day.reason}</td>
                    }
                    <td className="text-center font-bold">{day.isWorking ? <span className={tripsToday === 4 ? 'text-emerald-400' : 'text-amber-400'}>{tripsToday}</span> : '—'}</td>
                    <td className="text-right font-mono text-slate-300">{day.isWorking ? runningTotal.count : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-emerald-500/20">
                <td colSpan={6} className="font-bold text-emerald-400 text-sm">TOTAL CONFIRMED TRIPS</td>
                <td className="text-center font-bold text-emerald-400">{logs.length}</td>
                <td className="text-right font-bold text-emerald-400">/ {po.tripsAuthorised} auth.</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Config ──────────────────────────────────────────────────────────────────
const ConfigView = ({ config, setConfig }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div className="glass glass-card">
      <h4 className="text-lg font-bold mb-6 flex items-center gap-2"><Settings size={20} className="text-emerald-400" />Supplier Details</h4>
      <div className="space-y-4">
        {Object.entries(config.supplier).map(([key, val]) => (
          <div key={key}>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">{key}</label>
            <input 
              type="text" 
              value={val}
              onChange={(e) => {
                const newSupplier = { ...config.supplier, [key]: e.target.value };
                setConfig({ ...config, supplier: newSupplier });
              }}
              className="input-field" 
            />
          </div>
        ))}
      </div>
    </div>
    
    <div className="glass glass-card">
      <h4 className="text-lg font-bold mb-6 flex items-center gap-2"><Settings size={20} className="text-emerald-400" />Client Details</h4>
      <div className="space-y-4">
        {Object.entries(config.client).map(([key, val]) => (
          <div key={key}>
            <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">{key}</label>
            <input 
              type="text" 
              value={val}
              onChange={(e) => {
                const newClient = { ...config.client, [key]: e.target.value };
                setConfig({ ...config, client: newClient });
              }}
              className="input-field" 
            />
          </div>
        ))}
      </div>
    </div>

    <div className="glass glass-card lg:col-span-2">
      <h4 className="text-lg font-bold mb-6 flex items-center gap-2"><Wallet size={20} className="text-emerald-400" />Active Bank Accounts</h4>
      <div className="space-y-3">
        {config.banks.map(bank => (
          <div key={bank.id} className="p-4 rounded-xl border border-white/5 bg-white/2">
            <div className="flex justify-between items-start mb-2">
              <div><p className="font-bold text-white">{bank.name}</p><p className="text-sm text-slate-400 font-mono">{bank.account}</p></div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${bank.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>{bank.active ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <p className="text-xs text-slate-500">{bank.branch} • {bank.swift}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Add Trip Modal ───────────────────────────────────────────────────────────
const AddTripModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({ isoDate: new Date().toISOString().split('T')[0], route: 'Chifubu', type: 'Morning', sched: '06:00', actual: '06:00', pax: 42 });

  const setShift = (type) => setFormData({ ...formData, type, sched: type === 'Morning' ? '06:00' : '16:00', actual: type === 'Morning' ? '06:00' : '16:00' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative glass glass-card w-full max-w-lg p-8 space-y-5">
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-bold">Log New Trip</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-500 uppercase mb-1">Date</label><input type="date" value={formData.isoDate} onChange={e => setFormData({ ...formData, isoDate: e.target.value })} className="input-field" /></div>
          <div><label className="block text-xs text-slate-500 uppercase mb-1">Route</label>
            <select value={formData.route} onChange={e => setFormData({ ...formData, route: e.target.value })} className="input-field">
              <option>Chifubu</option><option>Lubuto</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 uppercase mb-2">Shift (Night Shifts Disabled)</label>
          <div className="flex gap-2">
            {['Morning', 'Day Shift'].map(s => (
              <button key={s} type="button" onClick={() => setShift(s)} className={`flex-1 py-2 rounded-lg border transition-all ${formData.type === s ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs text-slate-500 uppercase mb-1">Actual Depart</label><input type="time" value={formData.actual} onChange={e => setFormData({ ...formData, actual: e.target.value })} className="input-field" /></div>
          <div><label className="block text-xs text-slate-500 uppercase mb-1">PAX Count</label><input type="number" value={formData.pax} onChange={e => setFormData({ ...formData, pax: parseInt(e.target.value) })} className="input-field" /></div>
        </div>
        <button onClick={() => onSave(formData)} className="w-full btn btn-primary justify-center py-4 text-base">Confirm & Log Trip</button>
      </motion.div>
    </div>
  );
};

const InvoiceView = ({ config, po, logs }) => {
  const totalAmount = logs.length * po.rate;
  const activeBank = config.banks.find(b => b.active) || config.banks[0];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold text-white">Invoice Preview</h3>
        <button 
          onClick={() => exportInvoicePDF(config, po, logs)}
          className="btn btn-primary"
        >
          <FileText size={18} />
          <span>Download PDF Invoice</span>
        </button>
      </div>

      <div className="glass p-12 rounded-2xl bg-white/[0.02] text-slate-300 max-w-4xl mx-auto shadow-2xl border border-white/5">
        {/* Invoice Header */}
        <div className="flex justify-between mb-12">
          <div className="space-y-1">
            <h4 className="text-2xl font-bold text-emerald-400 mb-2">{config.supplier.name}</h4>
            <p className="text-sm opacity-60">{config.supplier.address}</p>
            <p className="text-sm opacity-60">{config.supplier.phone}</p>
            <p className="text-sm opacity-60">{config.supplier.email}</p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-bold text-white/90 mb-2">INVOICE</h2>
            <p className="text-sm font-mono opacity-40">#INV-{po.number}-{new Date().getFullYear()}</p>
            <p className="text-sm opacity-60 mt-4">Date: {new Date().toLocaleDateString('en-GB')}</p>
          </div>
        </div>

        {/* Bill To Section */}
        <div className="mb-12">
          <p className="text-xs uppercase tracking-widest text-emerald-500 font-bold mb-3">Bill To:</p>
          <h5 className="text-lg font-bold text-white mb-1">{config.client.name}</h5>
          <p className="text-sm opacity-60">{config.client.address}</p>
          <p className="text-sm opacity-60 mt-1">Attn: {config.client.contact}</p>
        </div>

        {/* Items Table */}
        <div className="border-y border-white/5 py-8 mb-12">
          <table className="w-full">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 text-left">
                <th className="pb-4">Description</th>
                <th className="pb-4 text-center">Qty</th>
                <th className="pb-4 text-right">Unit Price</th>
                <th className="pb-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="text-white">
              <tr>
                <td className="py-4">
                  <p className="font-medium">Logistics Services for {po.number}</p>
                  <p className="text-xs text-slate-500 mt-1">Reconciled trip logs for period 23/04/2026 - {new Date().toLocaleDateString('en-GB')}</p>
                </td>
                <td className="py-4 text-center">{logs.length}</td>
                <td className="py-4 text-right">K {po.rate}</td>
                <td className="py-4 text-right font-bold">K {totalAmount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Total Summary */}
        <div className="flex justify-end mb-16">
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subtotal</span>
              <span className="text-white">K {totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between pt-3 border-t border-white/10">
              <span className="text-lg font-bold text-white">Total Due</span>
              <span className="text-xl font-bold text-emerald-400">K {totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Footer / Bank Info */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-white/5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Payment Details:</p>
            <p className="text-sm font-bold text-white">{activeBank.name}</p>
            <p className="text-sm opacity-60">Account: {activeBank.account}</p>
            <p className="text-sm opacity-60">Branch: {activeBank.branch} / SWIFT: {activeBank.swift}</p>
          </div>
          <div className="text-right flex flex-col justify-end">
            <p className="text-xs text-slate-500 italic">Please include PO number in payment reference.</p>
            <p className="text-xs text-slate-500 mt-1">Payment is due within 14 days.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const UnderConstruction = ({ label }) => (
  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
    <AlertCircle size={48} className="mb-4 opacity-20" />
    <p>{label} — Coming Soon</p>
  </div>
);

export default App;
