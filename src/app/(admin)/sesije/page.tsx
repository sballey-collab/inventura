'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { InventorySession, Warehouse } from '@/types'

export default function SesijePage() {
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [name, setName] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: s } = await supabase
      .from('inventory_sessions')
      .select('*, warehouses(name)')
      .order('created_at', { ascending: false })
    setSessions(s || [])

    const { data: w } = await supabase.from('warehouses').select('*')
    setWarehouses(w || [])
    if (w && w.length > 0) setWarehouseId(w[0].id)
  }

  async function createSession() {
    if (!name.trim() || !warehouseId) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('inventory_sessions').insert({
      name,
      warehouse_id: warehouseId,
      status: 'u_tijeku',
      created_by: user?.id,
    })

    setName('')
    await loadAll()
    setLoading(false)
  }

  async function changeStatus(id: string, status: string) {
    await supabase
      .from('inventory_sessions')
      .update({ status, ...(status === 'zakljucano' ? { closed_at: new Date().toISOString() } : {}) })
      .eq('id', id)
    await loadAll()
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      otvoreno: 'bg-gray-100 text-gray-600',
      u_tijeku: 'bg-green-100 text-green-700',
      zakljucano: 'bg-red-100 text-red-600',
    }
    const label: Record<string, string> = {
      otvoreno: 'Otvoreno',
      u_tijeku: 'U tijeku',
      zakljucano: 'Zaključano',
    }
    return <span className={`px-2 py-1 rounded-lg text-xs font-medium ${map[status]}`}>{label[status]}</span>
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Inventurne sesije</h1>

      {/* Nova sesija */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-700 mb-4">Nova sesija</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Naziv sesije (npr. Inventura travanj 2025)"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={warehouseId}
            onChange={e => setWarehouseId(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 text-gray-800"
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            onClick={createSession}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-6 py-2 font-medium"
          >
            Kreiraj
          </button>
        </div>
      </div>

      {/* Lista sesija */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm p-6">Nema sesija.</p>
        ) : (
          sessions.map((s, i) => (
            <div key={s.id} className={`flex items-center justify-between px-6 py-4 ${i !== sessions.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <p className="font-medium text-gray-800">{s.name}</p>
                <p className="text-sm text-gray-400">{(s.warehouses as any)?.name} · {new Date(s.created_at).toLocaleDateString('hr')}</p>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(s.status)}
                {s.status === 'u_tijeku' && (
                  <button onClick={() => changeStatus(s.id, 'zakljucano')} className="text-sm text-red-500 hover:text-red-700">
                    Zaključaj
                  </button>
                )}
                {s.status === 'zakljucano' && (
                  <button onClick={() => changeStatus(s.id, 'u_tijeku')} className="text-sm text-blue-500 hover:text-blue-700">
                    Otvori
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}