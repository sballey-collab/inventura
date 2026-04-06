'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import type { Warehouse } from '@/types'

export default function RazlikePage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const [selectedSession, setSelectedSession] = useState('')
  const [sessions, setSessions] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [filter, setFilter] = useState<'sve' | 'manjak' | 'visak' | 'ok'>('sve')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadInit() }, [])

  async function loadInit() {
    const { data: w } = await supabase.from('warehouses').select('*')
    setWarehouses(w || [])
    if (w && w.length > 0) setSelectedWarehouse(w[0].id)

    const { data: s } = await supabase
      .from('inventory_sessions')
      .select('*, warehouses(name)')
      .order('created_at', { ascending: false })
    setSessions(s || [])
    if (s && s.length > 0) setSelectedSession(s[0].id)
  }

  async function loadRazlike() {
    if (!selectedSession || !selectedWarehouse) return
    setLoading(true)

    const { data: session } = await supabase
      .from('inventory_sessions')
      .select('warehouse_id')
      .eq('id', selectedSession)
      .single()

    const { data: counts } = await supabase
      .from('inventory_counts')
      .select('product_id, counted_quantity, products(code, name)')
      .eq('session_id', selectedSession)

    if (!counts || counts.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const productIds = counts.map((c: any) => c.product_id)

    const { data: stocks } = await supabase
      .from('bbm_stock')
      .select('product_id, quantity')
      .eq('warehouse_id', selectedWarehouse)
      .in('product_id', productIds)

    const stockMap: Record<string, number> = {}
    for (const s of stocks || []) {
      stockMap[s.product_id] = s.quantity
    }

    const result = counts.map((c: any) => {
      const bbm = stockMap[c.product_id] ?? 0
      const diff = c.counted_quantity - bbm
      return {
        code: (c.products as any)?.code,
        name: (c.products as any)?.name,
        bbm,
        counted: c.counted_quantity,
        diff,
        status: diff < 0 ? 'manjak' : diff > 0 ? 'visak' : 'ok',
      }
    }).sort((a: any, b: any) => Math.abs(b.diff) - Math.abs(a.diff))

    setRows(result)
    setLoading(false)
  }

  function exportExcel() {
    const data = filtered.map(r => ({
      'Šifra': r.code,
      'Naziv': r.name,
      'BBM stanje': r.bbm,
      'Brojano': r.counted,
      'Razlika': r.diff,
      'Status': r.status,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Razlike')
    XLSX.writeFile(wb, `razlike_${new Date().toLocaleDateString('hr')}.xlsx`)
  }

  function exportBBM() {
    const data = filtered
      .filter(r => r.status !== 'ok')
      .map(r => ({
        'Šifra': r.code,
        'Korekcija': r.diff,
      }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BBM korekcije')
    XLSX.writeFile(wb, `bbm_korekcije_${new Date().toLocaleDateString('hr')}.xlsx`)
  }

  const filtered = rows.filter(r => filter === 'sve' || r.status === filter)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Razlike</h1>

      {/* Filteri */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Sesija</label>
          <select
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} — {(s.warehouses as any)?.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">BBM stanje iz skladišta</label>
          <select
            value={selectedWarehouse}
            onChange={e => setSelectedWarehouse(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
          >
            {warehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={loadRazlike}
          disabled={loading}
          className="bg-blue-600 text-white rounded-xl px-5 py-2 text-sm font-medium"
        >
          {loading ? 'Učitavam...' : 'Prikaži razlike'}
        </button>
      </div>

      {rows.length > 0 && (
        <>
          {/* Statistika */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Ukupno', value: rows.length, color: 'bg-gray-50 text-gray-700' },
              { label: 'Manjak', value: rows.filter(r => r.status === 'manjak').length, color: 'bg-red-50 text-red-700' },
              { label: 'Višak', value: rows.filter(r => r.status === 'visak').length, color: 'bg-green-50 text-green-700' },
              { label: 'OK', value: rows.filter(r => r.status === 'ok').length, color: 'bg-blue-50 text-blue-700' },
            ].map(s => (
              <div key={s.label} className={`rounded-2xl p-4 ${s.color}`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filter tabovi */}
          <div className="flex gap-2 mb-3">
            {(['sve', 'manjak', 'visak', 'ok'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-xl text-sm font-medium capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
              >
                {f === 'sve' ? 'Sve' : f === 'manjak' ? 'Manjak' : f === 'visak' ? 'Višak' : 'OK'}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button onClick={exportExcel} className="px-4 py-1.5 rounded-xl text-sm font-medium bg-white text-gray-600 border border-gray-200">
                Export Excel
              </button>
              <button onClick={exportBBM} className="px-4 py-1.5 rounded-xl text-sm font-medium bg-green-600 text-white">
                Export BBM
              </button>
            </div>
          </div>

          {/* Tablica */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Šifra</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Naziv</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">BBM</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Brojano</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Razlika</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.code} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-mono text-gray-600">{r.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{r.bbm}</td>
                    <td className="px-4 py-2.5 text-right text-gray-800 font-medium">{r.counted}</td>
                    <td className={`px-4 py-2.5 text-right font-medium ${r.diff < 0 ? 'text-red-600' : r.diff > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {r.diff > 0 ? '+' : ''}{r.diff}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                        r.status === 'manjak' ? 'bg-red-50 text-red-600' :
                        r.status === 'visak' ? 'bg-green-50 text-green-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {r.status === 'manjak' ? 'Manjak' : r.status === 'visak' ? 'Višak' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length === 0 && !loading && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          Odaberi sesiju i klikni "Prikaži razlike"
        </div>
      )}
    </div>
  )
}