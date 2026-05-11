import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ClipboardList, 
  FileText, 
  Settings, 
  PlusCircle, 
  TrendingUp, 
  Bus, 
  Calendar, 
  ChevronRight,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock Data
const INITIAL_CONFIG = {
  supplier: {
    name: "Hamoney Investments Limited",
    address: "Plot 123, Independence Ave, Ndola",
    phone: "+260 971 234 567",
    email: "info@hamoney.com"
  },
  client: {
    name: "Limestone Resources Limited",
    address: "Copperbelt Road, Ndola",
    contact: "Operations Manager"
  },
  banks: [
    { id: 1, name: "Stanbic Bank", account: "904000123456", branch: "Ndola", swift: "SBICZM", active: true },
    { id: 2, name: "ZANACO", account: "5800123456789", branch: "Main", swift: "ZNCOZM", active: false }
  ]
};

const INITIAL_PO = {
  number: "PO-001",
  startDate: "2026-04-23",
  tripsAuthorised: 63,
  rate: 790,
  tripsCompleted: 0, // Will be calculated
  status: "IN PROGRESS"
};

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'logs', label: 'Trip Logs', icon: ClipboardList },
  { id: 'pos', label: 'PO Tracker', icon: Wallet },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'config', label: 'Configuration', icon: Settings },
];

const RECONCILED_LOGS = [
  // Generating logs from 23/04 to 11/05 excluding weekends and holidays (Apr 28, May 1)
  { date: '2026-05-11', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-05-08', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-05-07', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-05-06', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-05-05', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-05-04', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-04-30', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-04-29', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-04-27', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-04-24', routes: ['Chifubu', 'Lubuto'] },
  { date: '2026-04-23', routes: ['Chifubu', 'Lubuto'] },
].flatMap((day, index) => {
  const shifts = [
    { type: 'Morning', sched: '06:00' },
    { type: 'Day Shift', sched: '16:00' }
  ];
  const formattedDate = new Date(day.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  
  return day.routes.flatMap(route => 
    shifts.map(shift => ({
      id: `${day.date}-${route}-${shift.type}`,
      date: formattedDate,
      route: route,
      type: shift.type,
      sched: shift.sched,
      actual: shift.sched, // Assuming perfectly on time for reconciliation
      pax: Math.floor(Math.random() * 10) + 38, // Random PAX between 38-48
      status: 'On Time'
    }))
  );
});

const App = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [activePO, setActivePO] = useState(INITIAL_PO);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [logs, setLogs] = useState(() => {
    const saved = localStorage.getItem('limestone_logs');
    return saved ? JSON.parse(saved) : RECONCILED_LOGS;
  });

  useEffect(() => {
    localStorage.setItem('limestone_logs', JSON.stringify(logs));
    setActivePO(prev => ({ ...prev, tripsCompleted: logs.length }));
  }, [logs]);

  const addTrip = (trip) => {
    const newLog = {
      ...trip,
      id: Date.now(),
      status: trip.actual <= trip.sched ? 'On Time' : 'Late',
      date: new Date(trip.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    };
    setLogs([newLog, ...logs]);
    setShowAddModal(false);
  };

  return (
    <div className="app-container">
      <div className="bg-glow" />
      
      <aside className="sidebar glass">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500">
            <Bus size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Hamoney</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[2px]">Logistics Pro</p>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                currentView === item.id 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
              {currentView === item.id && (
                <motion.div layoutId="active" className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/5">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:text-rose-400 transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">
              {menuItems.find(i => i.id === currentView)?.label}
            </h2>
            <p className="text-slate-400">Welcome back, Hamoney Admin</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="btn btn-glass">
              <Calendar size={18} />
              <span>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <PlusCircle size={18} />
              <span>New Trip</span>
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderView(currentView, { config, activePO, logs })}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {showAddModal && (
            <AddTripModal 
              onClose={() => setShowAddModal(false)} 
              onSave={addTrip}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const renderView = (view, data) => {
  switch (view) {
    case 'dashboard': return <DashboardView activePO={data.activePO} logs={data.logs} />;
    case 'logs': return <LogsView logs={data.logs} />;
    case 'config': return <ConfigView config={data.config} />;
    default: return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <AlertCircle size={48} className="mb-4 opacity-20" />
        <p>This module is under construction</p>
      </div>
    );
  }
};

const DashboardView = ({ activePO, logs }) => {
  const percent = (activePO.tripsCompleted / activePO.tripsAuthorised) * 100;
  const revenue = activePO.tripsCompleted * activePO.rate;
  
  return (
    <div className="space-y-8">
      <div className="glass glass-card flex items-center justify-between relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-emerald-500/5 blur-3xl rounded-full -mr-20 -mt-20 group-hover:bg-emerald-500/10 transition-colors" />
        
        <div className="space-y-4 flex-1 max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm tracking-wider uppercase">
            <TrendingUp size={16} />
            <span>Active Purchase Order</span>
          </div>
          <h3 className="text-4xl font-bold text-white">{activePO.number}</h3>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total Progress: {activePO.tripsCompleted} / {activePO.tripsAuthorised} Trips</span>
              <span className="text-emerald-400 font-bold">{Math.round(percent)}%</span>
            </div>
            <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400" 
              />
            </div>
          </div>
        </div>

        <div className="flex gap-8 pl-12 border-l border-white/5">
          <div className="text-center">
            <p className="text-slate-500 text-xs uppercase tracking-widest mb-1">Rate</p>
            <p className="text-2xl font-bold text-white">K {activePO.rate}</p>
          </div>
          <div className="text-center">
            <p className="text-slate-500 text-xs uppercase tracking-widest mb-1">Remaining</p>
            <p className="text-2xl font-bold text-gold">
              {Math.max(0, activePO.tripsAuthorised - activePO.tripsCompleted)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Revenue Earned', val: `K ${revenue.toLocaleString()}`, sub: 'From current PO', icon: Wallet, color: 'text-emerald-400' },
          { label: 'Completed Trips', val: activePO.tripsCompleted, sub: 'Chifubu + Lubuto', icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Pending Invoices', val: '1', sub: 'PO-001 completion', icon: AlertCircle, color: 'text-amber-400' },
        ].map((kpi, i) => (
          <div key={i} className="glass glass-card">
            <div className={`p-2 w-fit rounded-lg bg-white/5 ${kpi.color} mb-4`}>
              <kpi.icon size={20} />
            </div>
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
  const filteredLogs = logs.filter(l => l.route === activeRoute);

  return (
    <div className="space-y-6">
      <div className="flex gap-4 p-1 bg-white/5 w-fit rounded-xl border border-white/5">
        <button 
          onClick={() => setActiveRoute('Chifubu')}
          className={`px-6 py-2 rounded-lg transition-all ${activeRoute === 'Chifubu' ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Chifubu Route
        </button>
        <button 
          onClick={() => setActiveRoute('Lubuto')}
          className={`px-6 py-2 rounded-lg transition-all ${activeRoute === 'Lubuto' ? 'bg-white/10 text-white font-medium' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Lubuto Route
        </button>
      </div>

      <div className="glass glass-card p-0 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Sched Depart</th>
              <th>Actual Depart</th>
              <th>PAX</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.date}</td>
                <td>
                  <span className="px-2 py-1 rounded-md bg-white/5 text-xs text-slate-300 uppercase font-semibold">
                    {row.type}
                  </span>
                </td>
                <td className="text-slate-400">{row.sched}</td>
                <td className="text-white font-medium">{row.actual}</td>
                <td>{row.pax}</td>
                <td>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    row.status === 'On Time' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {row.status}
                  </span>
                </td>
                <td>
                  <button className="text-slate-500 hover:text-white transition-colors">
                    <ChevronRight size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredLogs.length === 0 && (
          <div className="py-20 text-center text-slate-500">
            No logs found for this route
          </div>
        )}
      </div>
    </div>
  );
};

const AddTripModal = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    route: 'Chifubu',
    type: 'Morning',
    sched: '06:00',
    actual: '06:00',
    pax: 40,
    remarks: ''
  });

  const handleTypeChange = (type) => {
    setFormData({
      ...formData,
      type,
      sched: type === 'Morning' ? '06:00' : '16:00',
      actual: type === 'Morning' ? '06:00' : '16:00'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative glass glass-card w-full max-w-lg p-8 space-y-6"
      >
        <div className="flex justify-between items-center">
          <h3 className="text-2xl font-bold">Log New Trip</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-1">Date</label>
              <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-1">Route</label>
              <select value={formData.route} onChange={e => setFormData({...formData, route: e.target.value})} className="input-field">
                <option>Chifubu</option>
                <option>Lubuto</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 uppercase mb-2">Shift Type (Night Shifts Disabled)</label>
            <div className="flex gap-2">
              {['Morning', 'Day Shift'].map(shift => (
                <button
                  key={shift}
                  type="button"
                  onClick={() => handleTypeChange(shift)}
                  className={`flex-1 py-2 rounded-lg border transition-all ${
                    formData.type === shift 
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                    : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  {shift}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-1">Actual Depart</label>
              <input type="time" value={formData.actual} onChange={e => setFormData({...formData, actual: e.target.value})} className="input-field" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 uppercase mb-1">PAX Count</label>
              <input type="number" value={formData.pax} onChange={e => setFormData({...formData, pax: e.target.value})} className="input-field" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 uppercase mb-1">Remarks</label>
            <textarea value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="input-field h-20 pt-2" />
          </div>
        </div>

        <button 
          onClick={() => onSave(formData)}
          className="w-full btn btn-primary justify-center text-lg py-4"
        >
          Confirm & Log Trip
        </button>
      </motion.div>
    </div>
  );
};

const ConfigView = ({ config }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <div className="space-y-6">
      <div className="glass glass-card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Settings size={20} className="text-emerald-400" />
          Supplier Details
        </h4>
        <div className="space-y-4">
          {Object.entries(config.supplier).map(([key, val]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 uppercase tracking-widest mb-1">{key}</label>
              <input 
                type="text" 
                defaultValue={val}
                className="input-field"
              />
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="space-y-6">
      <div className="glass glass-card">
        <h4 className="text-lg font-bold mb-6 flex items-center gap-2">
          <Wallet size={20} className="text-emerald-400" />
          Active Bank Accounts
        </h4>
        <div className="space-y-3">
          {config.banks.map((bank) => (
            <div key={bank.id} className="p-4 rounded-xl border border-white/5 bg-white/2 hover:bg-white/5 transition-colors group">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-white">{bank.name}</p>
                  <p className="text-sm text-slate-400 font-mono">{bank.account}</p>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  bank.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500'
                }`}>
                  {bank.active ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
              <p className="text-xs text-slate-500">{bank.branch} • {bank.swift}</p>
            </div>
          ))}
          <button className="w-full py-3 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm hover:border-white/20 hover:text-slate-400 transition-all">
            + Add Bank Account
          </button>
        </div>
      </div>
    </div>
  </div>
);

export default App;
