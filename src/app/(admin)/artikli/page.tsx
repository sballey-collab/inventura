'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import type { Warehouse } from '@/types'

export default function ArtikliPage() {
  const [tab, setTab] = useState<'artikli' | 'stanje'>('artikli')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null)
  const [error, setError] = useState('')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedWarehouse, setSelectedWarehouse] = useState('')
  const supabase = createClient()

  useState(() => {
    supabase.from('warehouses').select('*').then(({ data }) => {
      setWarehouses(data || [])
      if (data && data.length > 0) setSelectedWarehouse(data[0].id)
    })
  })

  async function handleArtikliFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setResult(null)
    setError('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet)

      const chunks = []
      for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100))

      let success = 0, errors = 0

      for (const chunk of chunks) {
        const data = chunk
          .map((row: any) => ({
            code: String(row['Šifra'] || '').trim(),
            name: String(row['Naziv'] || '').trim(),
            barcode: String(row['Bar kod'] || '').trim() || null,
          }))
          .filter((r: any) => r.code && r.name)

        const { error } = await supabase
          .from('products')
          .upsert(data, { onConflict: 'code' })

        if (error) { errors += chunk.length; continue }
        success += data.length
        errors += chunk.length - data.length
      }

      setResult({ success, errors })
    } catch {
      setError('Greška pri čitanju datoteke.')
    }
    setImporting(false)
    e.target.value = ''
  }

  async function handleStanjeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedWarehouse) return
    setImporting(true)
    setResult(null)
    setError('')

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet)

      // Dohvati SVE artikle straničenjem
      let allProducts: any[] = []
      let page = 0
      while (true) {
        const { data } = await supabase
          .from('products')
          .select('id, code')
          .range(page * 1000, (page + 1) * 1000 - 1)
        if (!data || data.length === 0) break
        allProducts = allProducts.concat(data)
        if (data.length < 1000) break
        page++
      }

      console.log('Ukupno artikala u mapi:', allProducts.length)

      const productMap: Record<string, string> = {}
      for (const p of allProducts) {
        productMap[p.code] = p.id
      }

      const upsertData = []
      let errors = 0

      for (const row of rows) {
        const code = String(row['Šifra'] || '').trim()
        const qty = parseFloat(String(row['Stanje'] || '0').replace(',', '.'))
        const productId = productMap[code]
        if (!productId) { errors++; continue }
        upsertData.push({
          product_id: productId,
          warehouse_id: selectedWarehouse,
          quantity: isNaN(qty) ? 0 : qty,
        })
      }

      let success = 0
      for (let i = 0; i < upsertData.length; i += 500) {
        const chunk = upsertData.slice(i, i + 500)
        const { error } = await supabase
          .from('bbm_stock')
          .upsert(chunk, { onConflict: 'product_id,warehouse_id' })
        if (error) { errors += chunk.length; continue }
        success += chunk.length
      }

      setResult({ success, errors })
    } catch {
      setError('Greška pri čitanju datoteke.')
    }
    setImporting(false)
    e.target.value = ''
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Artikli</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setTab('artikli'); setResult(null) }}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'artikli' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          Import artikala
        </button>
        <button
          onClick={() => { setTab('stanje'); setResult(null) }}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${tab === 'stanje' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}
        >
          Import BBM stanja
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        {tab === 'artikli' ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Excel stupci: <strong>Šifra</strong>, <strong>Bar kod</strong>, <strong>Naziv</strong>
            </p>
            <FileUpload onChange={handleArtikliFile} importing={importing} />
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Excel stupci: <strong>Šifra</strong>, <strong>Stanje</strong>
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-600 mb-1">Skladište</label>
              <select
                value={selectedWarehouse}
                onChange={e => setSelectedWarehouse(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2 text-gray-800"
              >
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <FileUpload onChange={handleStanjeFile} importing={importing} />
          </>
        )}

        {importing && (
          <div className="mt-4 bg-blue-50 rounded-xl px-4 py-3 text-blue-600 text-sm">
            Uvoz u tijeku, molim pričekaj...
          </div>
        )}

        {result && (
          <div className="mt-4 bg-green-50 rounded-xl px-4 py-3 border border-green-100">
            <p className="text-green-700 font-medium">Uvoz završen</p>
            <p className="text-green-600 text-sm mt-1">✓ Uspješno: {result.success}</p>
            {result.errors > 0 && (
              <p className="text-orange-500 text-sm">⚠ Preskočeno: {result.errors}</p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-red-50 rounded-xl px-4 py-3 border border-red-100 text-red-600 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

function FileUpload({ onChange, importing }: {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  importing: boolean
}) {
  return (
    <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-colors ${importing ? 'border-gray-200 bg-gray-50' : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'}`}>
      <div className="text-4xl mb-3">📂</div>
      <p className="text-gray-600 font-medium">
        {importing ? 'Uvoz u tijeku...' : 'Klikni za odabir Excel datoteke'}
      </p>
      <p className="text-gray-400 text-sm mt-1">.xlsx ili .xls</p>
      <input type="file" accept=".xlsx,.xls" onChange={onChange} disabled={importing} className="hidden" />
    </label>
  )
}