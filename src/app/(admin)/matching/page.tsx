'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'

export default function MatchingPage() {
  const [sessions, setSessions] = useState<any[]>([])
  const [warehouses, setWarehouses] = useState<any[]>([])
  const [sessionA, setSessionA] = useState('')
  const [sessionB, setSessionB] = useState('')
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadInit() }, [])

  async function loadInit() {
    const { data: s } = await supabase
      .from('inventory_sessions')
      .select('*, warehouses(name)')
      .order('created_at', { ascending: false })
    setSessions(s || [])

    const { data: w } = await supabase.from('warehouses').select('*')
    setWarehouses(w || [])
  }

  async function runMatching() {
    if (!sessionA || !sessionB) return
    setLoading(true)
    setSaved(false)
    setMatches([])

    // Dohvati sesije da znamo koja je skladišta
    const sessA = sessions.find(s => s.id === sessionA)
    const sessB = sessions.find(s => s.id === sessionB)

    if (!sessA || !sessB) { setLoading(false); return }

    // Dohvati razlike za sesiju A
    const diffsA = await getDiffs(sessionA, sessA.warehouse_id)
    // Dohvati razlike za sesiju B
    const diffsB = await getDiffs(sessionB, sessB.warehouse_id)

    // Napravi map za brzo pretraživanje
    const mapA: Record<string, any> = {}
    for (const d of diffsA) mapA[d.product_id] = d

    const mapB: Record<string, any> = {}
    for (const d of diffsB) mapB[d.product_id] = d

    // Matching logika
    const result: any[] = []
    const allProductIds = new Set([...Object.keys(mapA), ...Object.keys(mapB)])

    for (const productId of allProductIds) {
      const a = mapA[productId]
      const b = mapB[productId]

      if (!a || !b) continue

      const diffA = a.diff // negativno = manjak u A
      const diffB = b.diff // pozitivno = višak u B

      // Manjak u A, višak u B → prijenos iz B u A
      if (diffA < 0 && diffB > 0) {
        const qty = Math.min(Math.abs(diffA), diffB)
        result.push({
          product_id: productId,
          code: a.code,
          name: a.name,
          from_warehouse_id: sessB.warehouse_id,
          from_warehouse: (sessB.warehouses as any)?.name,
          to_warehouse_id: sessA.warehouse_id,
          to_warehouse: (sessA.warehouses as any)?.name,
          manjak: diffA,
          visak: diffB,
          qty,
          status: 'prijedlog',
        })
      }

      // Višak u A, manjak u B → prijenos iz A u B
      if (diffA > 0 && diffB < 0) {
        const qty = Math.min(diffA, Math.abs(diffB))
        result.push({
          product_id: productId,
          code: a.code,
          name: a.name,
          from_warehouse_id: sessA.warehouse_id,
          from_warehouse: (sessA.warehouses as any)?.name,
          to_warehouse_id: sessB.warehouse_id,
          to_warehouse: (sessB.warehouses as any)?.name,
          manjak: diffB,
          visak: diffA,
          qty,
          status: 'prijedlog',
        })
      }
    }

    setMatches(result)
    setLoading(false)
  }

  async function getDiffs(sessionId: string, warehouseId: string) {
    const { data: counts } = await supabase
      .from('inventory_counts')
      .select('product_id, counted_quantity, products(code, name)')
      .eq('session_id', sessionId)

    if (!counts || counts.length === 0) return []

    const productIds = counts.map((c: any) => c.product_id)

    const { data: stocks } = await supabase
      .from('bbm_stock')
      .select('product_id, quantity')
      .eq('warehouse_id', warehouseId)
      .in('product_id', productIds)

    const stockMap: Record<string, number> = {}
    for (const s of stocks || []) stockMap[s.product_id] = s.quantity

    return counts.map((c: any) => ({
      product_id: c.product_id,
      code: (c.products as any)?.code,
      name: (c.products as any)?.name,
      diff: c.counted_quantity - (stockMap[c.product_id] ?? 0),
    }))
  }

  async function saveMatches() {
    if (matches.length === 0) return

    // Obriši stare prijedloge
    await supabase.from('transfer_matches').delete().eq('status', 'prijedlog')

    const data = matches.map(m => ({
      product_id: m.product_id,
      from_warehouse_id: m.from_warehouse_id,
      to_warehouse_id: m.to_warehouse_id,
      quantity: m.qty,
      status: 'prijedlog',
    }))

    await supabase.from('transfer_matches').insert(data)
    setSaved(true)
  }

  async function confirmMatch(index: number) {
    const match = matches[index]
    const updated = [...matches]
    updated[index] = { ...match, status: 'potvrdjeno' }
    setMatches(updated)
  }

  async function rejectMatch(index: number) {
    const updated = matches.filter((_, i) => i !== index)
    setMatches(updated)
  }

  function exportMatches() {
    const confirmed = matches.filter(m => m.status === 'potvrdjeno')
    const data = confirmed.map(m => ({
      'Šifra': m.code,
      'Naziv': m.name,
      'Iz skladišta': m.from_warehouse,
      'U skladište': m.to_warehouse,
      'Količina': m.qty,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Međuskladišnice')
    XLSX.writeFile(wb, `medjuskladisnice_${new Date().toLocaleDateString('hr')}.xlsx`)
  }

  const confirmed = matches.filter(m => m.status === 'potvrdjeno').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Matching — međuskladišnice</h1>

      {/* Odabir sesija */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
        <p className="text-sm text-gray-500 mb-4">Odaberi dvije sesije (različita skladišta) za usporedbu razlika.</p>
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sesija 1</label>
            <select
              value={sessionA}
              onChange={e => setSessionA(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
            >
              <option value="">Odaberi...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {(s.warehouses as any)?.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Sesija 2</label>
            <select
              value={sessionB}
              onChange={e => setSessionB(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
            >
              <option value="">Odaberi...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {(s.warehouses as any)?.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={runMatching}
            disabled={loading || !sessionA || !sessionB}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl px-6 py-2 text-sm font-medium"
          >
            {loading ? 'Analiziram...' : 'Pokreni matching'}
          </button>
        </div>
      </div>

      {/* Rezultati */}
      {matches.length > 0 && (
        <>
          {/* Statistika */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <p className="text-2xl font-bold text-blue-700">{matches.length}</p>
              <p className="text-sm text-blue-500">Prijedloga</p>
            </div>
            <div className="bg-green-50 rounded-2xl p-4">
              <p className="text-2xl font-bold text-green-700">{confirmed}</p>
              <p className="text-sm text-green-500">Potvrđeno</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-2xl font-bold text-gray-700">{matches.length - confirmed}</p>
              <p className="text-sm text-gray-500">Na čekanju</p>
            </div>
          </div>

          {/* Akcije */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={saveMatches}
              className="bg-blue-600 text-white rounded-xl px-4 py-2 text-sm font-medium"
            >
              Spremi prijedloge
            </button>
            {confirmed > 0 && (
              <button
                onClick={exportMatches}
                className="bg-green-600 text-white rounded-xl px-4 py-2 text-sm font-medium"
              >
                Export potvrđenih ({confirmed})
              </button>
            )}
            {saved && (
              <span className="text-green-600 text-sm self-center">✓ Spremljeno</span>
            )}
          </div>

          {/* Tablica */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Šifra</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Naziv</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">Iz</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">U</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Količina</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium">Akcija</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-4 py-2.5 font-mono text-gray-600">{m.code}</td>
                    <td className="px-4 py-2.5 text-gray-800">{m.name}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{m.from_warehouse}</td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{m.to_warehouse}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-800">{m.qty}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                        m.status === 'potvrdjeno'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-blue-50 text-blue-600'
                      }`}>
                        {m.status === 'potvrdjeno' ? 'Potvrđeno' : 'Prijedlog'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {m.status !== 'potvrdjeno' ? (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => confirmMatch(i)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            Potvrdi
                          </button>
                          <button
                            onClick={() => rejectMatch(i)}
                            className="text-red-400 hover:text-red-600 text-xs font-medium"
                          >
                            Odbij
                          </button>
                        </div>
                      ) : (
                        <span className="text-green-500 text-xs">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {matches.length === 0 && !loading && sessionA && sessionB && (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
          Nema prijedloga za matching — nema artikala s manjkom u jednom i viškom u drugom skladištu.
        </div>
      )}
    </div>
  )
}