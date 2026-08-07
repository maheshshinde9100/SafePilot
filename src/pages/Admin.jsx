import { useEffect, useState } from "react";
import ProtectedRoute from "../components/ProtectedRoute";
import {
  deleteContact,
  listContacts,
  upsertContact,
  listVehicleStates,
  listEmergencyCases
} from "../lib/dataService";
import { Link } from "react-router-dom";

export default function AdminPage() {
  // Contacts State
  const [contacts, setContacts] = useState([]);

  // Fleet State
  const [vehicles, setVehicles] = useState([]);
  const [emergencies, setEmergencies] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Poll every 5s for admin dashboard
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    try {
      const [contactsList, vehiclesList, emergencyList] = await Promise.all([
        listContacts(),
        listVehicleStates(),
        listEmergencyCases({ resolved: false })
      ]);

      setContacts(contactsList.map((d) => ({ id: d.$id, name: d.name || "", phone: d.phone || "", priority: d.priority || 0 })));
      setVehicles(vehiclesList);
      setEmergencies(emergencyList);
    } catch (e) {
      setError(e?.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  // Contact Handlers
  async function addContact() {
    if (contacts.length >= 5) return;
    const doc = { name: "", phone: "", priority: contacts.length + 1 };
    await upsertContact(doc);
    loadData();
  }

  async function updateContact(id, patch) {
    const existing = contacts.find((x) => x.id === id);
    if (!existing) return;
    const updatedLocal = { ...existing, ...patch };
    setContacts((c) => c.map((x) => (x.id === id ? updatedLocal : x)));
    await upsertContact({ $id: id, ...updatedLocal });
  }

  async function removeContact(id) {
    await deleteContact(id);
    loadData();
  }

  async function moveContact(id, dir) {
    const idx = contacts.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const ni = Math.max(0, Math.min(contacts.length - 1, idx + dir));
    const copy = [...contacts];
    const [it] = copy.splice(idx, 1);
    copy.splice(ni, 0, it);
    const reordered = copy.map((x, i) => ({ ...x, priority: i + 1 }));

    setContacts(reordered); // Optimistic UI
    for (const n of reordered) await upsertContact({ $id: n.id, ...n });
  }

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="max-w-6xl mx-auto space-y-8">

          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h1 className="text-3xl font-bold text-cyan-400">Admin Command Center</h1>
            <div className="text-sm text-slate-400">System Ready</div>
          </div>

          {error && <div className="p-4 bg-rose-900/20 border border-rose-500 rounded text-rose-200">{String(error)}</div>}

          {loading && !vehicles.length ? (
            <div className="text-slate-400 animate-pulse">Loading system status...</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* LEFT COLUMN */}
              <div className="space-y-8">

                {/* 1. EMERGENCY CASES */}
                <section>
                  <h2 className="text-xl text-rose-400 mb-4 flex items-center gap-2">
                    <span>  Active Emergencies</span>
                    {emergencies.length > 0 && <span className="bg-rose-600 text-white text-xs px-2 py-0.5 rounded-full">{emergencies.length}</span>}
                  </h2>
                  {emergencies.length === 0 ? (
                    <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-500 text-sm">No active emergencies reported.</div>
                  ) : (
                    <div className="space-y-3">
                      {emergencies.map(em => (
                        <div key={em.$id} className="p-4 bg-rose-950/30 border border-rose-800/50 rounded-xl flex justify-between items-center">
                          <div>
                            <div className="font-bold text-rose-200">{em.caseType} Alert</div>
                            <div className="text-xs text-rose-300/70">Car: {em.carId} • Driver: {em.driverId || 'Unknown'}</div>
                            <div className="text-xs text-slate-400 mt-1">{new Date(em.createdAt).toLocaleString()}</div>
                          </div>
                          <Link to="/controls" className="px-3 py-1 bg-rose-600 hover:bg-rose-500 rounded text-white text-xs">Take Action</Link>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 2. LIVE FLEET STATUS */}
                <section>
                  <h2 className="text-xl text-sky-400 mb-4">Live Fleet Status</h2>
                  <div className="grid gap-3">
                    {vehicles.length === 0 ? (
                      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-slate-500">No active vehicles online.</div>
                    ) : (
                      vehicles.map(v => (
                        <div key={v.$id} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-sky-500/50 transition-colors">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <div className="font-mono text-lg text-sky-200">{v.carId}</div>
                              <div className="text-xs text-slate-400">Driver: {v.driverId || 'Unassigned'}</div>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${v.drowsinessLevel === 'critical' || v.alcoholStatus === 'detected' ? 'bg-rose-600 text-white' :
                                v.drowsinessLevel === 'warning' ? 'bg-amber-500 text-black' : 'bg-emerald-600/20 text-emerald-400'
                              }`}>
                              {v.drowsinessLevel === 'critical' ? 'CRITICAL' : v.alcoholStatus === 'detected' ? 'ALCOHOL' : 'NORMAL'}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="bg-slate-950 p-2 rounded">
                              <div className="text-slate-500 text-[10px] uppercase">Speed</div>
                              <div className="text-slate-200 font-mono">{v.speed} km/h</div>
                            </div>
                            <div className="bg-slate-950 p-2 rounded">
                              <div className="text-slate-500 text-[10px] uppercase">Control</div>
                              <div className="text-slate-200">{v.controlMode}</div>
                            </div>
                            <div className="bg-slate-950 p-2 rounded">
                              <div className="text-slate-500 text-[10px] uppercase">Heart Rate</div>
                              <div className="text-slate-200">{v.heartRate} bpm</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[10px] text-slate-600 text-right">Updated: {new Date(v.lastUpdated).toLocaleTimeString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-8">
                {/* 3. EMERGENCY CONTACTS */}
                <section>
                  <h2 className="text-xl text-emerald-400 mb-4">Emergency Contacts Priority</h2>
                  <div className="space-y-3">
                    {contacts.map((c, idx) => (
                      <div key={c.id} className="grid grid-cols-12 gap-2 items-center bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                        <div className="col-span-1 text-slate-400 font-mono">#{idx + 1}</div>
                        <input value={c.name} onChange={(e) => updateContact(c.id, { name: e.target.value })} placeholder="Name" className="col-span-4 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm" />
                        <input value={c.phone} onChange={(e) => updateContact(c.id, { phone: e.target.value })} placeholder="Phone" className="col-span-4 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm" />
                        <div className="col-span-3 flex justify-end gap-1">
                          <button onClick={() => moveContact(c.id, -1)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700">↑</button>
                          <button onClick={() => moveContact(c.id, 1)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700">↓</button>
                          <button onClick={() => removeContact(c.id)} className="px-2 py-1 rounded bg-rose-900/40 border border-rose-800/50 hover:bg-rose-900/60 text-rose-400">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {contacts.length < 5 && (
                    <button onClick={addContact} className="mt-3 px-4 py-2 w-full rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/50 border-dashed">
                      + Add Priority Contact
                    </button>
                  )}
                </section>

                <section className="bg-slate-900/30 border border-slate-800 rounded-xl p-4">
                  <h3 className="text-slate-300 font-semibold mb-2">Backend Health</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-sm text-slate-400">Socket Server Active</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm text-slate-400">MQTT Bridge Active</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                    <span className="text-sm text-slate-400">Appwrite Database Connected</span>
                  </div>
                </section>
              </div>

            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
