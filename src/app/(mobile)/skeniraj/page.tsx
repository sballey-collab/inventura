'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { InventorySession, Product } from '@/types'

export default function SkenirajPage() {
  const [sessions, setSessions] = useState<InventorySession[]>([])
  const [selectedSession, setSelectedSession] = useState<InventorySession | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lastProduct, setLastProduct] = useState<Product | null>(null)
  const [lastQty, setLastQty] = useState(0)
  const [lastBbm, setLastBbm] = useState<number | null>(null)
  const [manualCode, setManualCode] = useState('')
  const [manualQty, setManualQty] = useState(1)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'ok' | 'error'>('ok')
  const [userId, setUserId] = useState<string>('')
  const [recentScans, setRecentScans] = useState<any[]>([])
  const [editQty, setEditQty] = useState<string>('')
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [editingItemQty, setEditingItemQty] = useState<number>(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  
  const supabase = createClient()

  useEffect(() => {
    loadData()
    return () => stopScanner()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      window.location.href = '/login'
      return
    }
    setUserId(user.id)

    const { data } = await supabase
      .from('inventory_sessions')
      .select('*, warehouses(name)')
      .eq('status', 'u_tijeku')
      .order('created_at', { ascending: false })

    setSessions(data || [])
    if (data && data.length === 1) setSelectedSession(data[0])
  }

 async function startScanner() {
    if (!selectedSession) {
      showMessage('Odaberi sesiju prije skeniranja', 'error')
      return
    }

    setScanning(true)

    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      })
      const track = stream.getVideoTracks()[0]
      const deviceId = track.getSettings().deviceId
      stream.getTracks().forEach(t => t.stop())

      // Promise koji se razriješi JEDNOM i stane — nema callbacka, nema duplikata
      const result = await reader.decodeOnceFromVideoDevice(deviceId, videoRef.current!)

      BrowserMultiFormatReader.releaseAllStreams()
      readerRef.current = null
      setScanning(false)

      if (result) await processBarcode(result.getText())

    } catch (err: any) {
      BrowserMultiFormatReader.releaseAllStreams()
      readerRef.current = null
      setScanning(false)

      if (err?.name === 'NotAllowedError') {
        showMessage('Dozvoli pristup kameri u postavkama browsera', 'error')
      } else if (err?.name === 'NotFoundException') {
        // korisnik je kliknuo Odustani — tiho ignoriraj
      } else {
        showMessage('Kamera nije dostupna', 'error')
      }
    }
  }

  function stopScanner() {
    try {
      BrowserMultiFormatReader.releaseAllStreams()
      readerRef.current = null
    } catch {}
    setScanning(false)
  }

  async function processBarcode(barcode: string) {
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .single()

    if (!product) {
      showMessage(`Artikl nije pronađen: ${barcode}`, 'error')
      return
    }

    await addCount(product, 1)
  }

  async function handleManualInput() {
    if (!manualCode.trim()) return
    if (!selectedSession) {
      showMessage('Odaberi sesiju', 'error')
      return
    }

    const { data: product } = await supabase
      .from('products')
      .select('*')
      .or(`code.eq.${manualCode},barcode.eq.${manualCode}`)
      .single()

    if (!product) {
      showMessage(`Artikl nije pronađen: ${manualCode}`, 'error')
      return
    }

    await addCount(product, manualQty)
    setManualCode('')
    setManualQty(1)
  }

  async function addCount(product: Product, delta: number) {
    const { error } = await supabase.rpc('increment_count', {
      p_session_id: selectedSession!.id,
      p_product_id: product.id,
      p_user_id: userId,
      p_delta: delta,
    })

    if (error) {
      showMessage('Greška pri upisu', 'error')
      return
    }

    const { data: count } = await supabase
      .from('inventory_counts')
      .select('counted_quantity')
      .eq('session_id', selectedSession!.id)
      .eq('product_id', product.id)
      .single()

    const { data: bbmStock } = await supabase
      .from('bbm_stock')
      .select('quantity')
      .eq('product_id', product.id)
      .eq('warehouse_id', selectedSession!.warehouse_id)
      .single()

    const counted = count?.counted_quantity || delta
    const bbm = bbmStock?.quantity ?? null

    setLastProduct(product)
    setLastQty(counted)
    setLastBbm(bbm)
    setEditQty('')
    showMessage(`✓ ${product.name} → ${counted} kom`, 'ok')

    setRecentScans(prev => {
      const filtered = prev.filter(s => s.product_id !== product.id)
      return [{
        product_id: product.id,
        name: product.name,
        code: product.code,
        qty: counted,
        bbm,
      }, ...filtered].slice(0, 10)
    })
  }

  async function saveInlineEdit() {
    const parsed = parseInt(editQty)
if (isNaN(parsed) || parsed === lastQty || !lastProduct || !selectedSession) return
const delta = parsed - lastQty

    const { error } = await supabase.rpc('increment_count', {
      p_session_id: selectedSession.id,
      p_product_id: lastProduct.id,
      p_user_id: userId,
      p_delta: delta,
    })

    if (error) { showMessage('Greška pri ispravku', 'error'); return }

    setLastQty(editQty)
    setRecentScans(prev => prev.map(s =>
      s.product_id === lastProduct.id ? { ...s, qty: editQty } : s
    ))
    setEditQty('')
    showMessage('Količina ispravljena', 'ok')
  }

  function openEditModal(item: any) {
    setEditingItem(item)
    setEditingItemQty(item.qty)
  }

  async function saveEditModal() {
    if (!editingItem || !selectedSession) return
    const delta = editingItemQty - editingItem.qty
    if (delta === 0) { setEditingItem(null); return }

    const { error } = await supabase.rpc('increment_count', {
      p_session_id: selectedSession.id,
      p_product_id: editingItem.product_id,
      p_user_id: userId,
      p_delta: delta,
    })

    if (error) { showMessage('Greška pri ispravku', 'error'); return }

    setRecentScans(prev => prev.map(s =>
      s.product_id === editingItem.product_id ? { ...s, qty: editingItemQty } : s
    ))
    if (lastProduct?.id === editingItem.product_id) setLastQty(editingItemQty)
    showMessage(`Ispravljeno: ${editingItem.name} → ${editingItemQty} kom`, 'ok')
    setEditingItem(null)
  }

  function showMessage(msg: string, type: 'ok' | 'error') {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 3000)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function diffColor(counted: number, bbm: number | null) {
    if (bbm === null) return 'text-gray-400'
    const diff = counted - bbm
    if (diff === 0) return 'text-green-600'
    if (diff > 0) return 'text-orange-500'
    return 'text-red-600'
  }

  function diffLabel(counted: number, bbm: number | null) {
    if (bbm === null) return 'BBM: nema podatka'
    const diff = counted - bbm
    if (diff === 0) return '✓ Usklađeno'
    if (diff > 0) return `+${diff} višak`
    return `${diff} manjak`
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-blue-600 px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-semibold text-white">📦 Skeniranje</h1>
          {selectedSession && (
            <p className="text-blue-100 text-xs">
              {selectedSession.name} · {(selectedSession.warehouses as any)?.name}
            </p>
          )}
        </div>
        <button onClick={handleLogout} className="text-blue-100 text-sm">Odjava</button>
      </div>

      <div className="p-4 space-y-4">

        {/* Odabir sesije */}
        {sessions.length > 1 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <label className="block text-sm font-medium text-gray-600 mb-2">Odaberi sesiju</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
              onChange={e => {
                const s = sessions.find(s => s.id === e.target.value)
                setSelectedSession(s || null)
                stopScanner()
              }}
              defaultValue=""
            >
              <option value="" disabled>Odaberi sesiju...</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} — {(s.warehouses as any)?.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {sessions.length === 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-gray-400 text-sm">Nema aktivnih sesija. Kontaktiraj admina.</p>
          </div>
        )}

        {/* Kamera */}
        {selectedSession && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            {scanning ? (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  className="w-full rounded-xl"
                  style={{ height: 220, objectFit: 'cover' }}
                />
                <button
                  onClick={stopScanner}
                  className="w-full bg-red-500 text-white rounded-xl py-3 font-medium"
                >
                  ⏹ Odustani
                </button>
              </div>
            ) : (
              <button
                onClick={startScanner}
                className="w-full bg-blue-600 text-white rounded-xl py-5 text-xl font-bold"
              >
                📷 Skeniraj
              </button>
            )}
          </div>
        )}

        {/* Poruka */}
        {message && (
          <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            messageType === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-red-50 text-red-600 border border-red-100'
          }`}>
            {message}
          </div>
        )}

        {/* Zadnje skenirano */}
        {lastProduct && selectedSession && !scanning && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Zadnje skenirano</p>
            <p className="font-semibold text-gray-800 text-lg">{lastProduct.name}</p>
            <p className="text-sm text-gray-400 mb-3">Šifra: {lastProduct.code}</p>

            <div className="grid grid-cols-3 gap-2 mb-2">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-400 mb-1">Brojano</p>
                <p className="text-2xl font-bold text-blue-700">{lastQty}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">BBM</p>
                <p className="text-2xl font-bold text-gray-600">{lastBbm ?? '—'}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">Razlika</p>
                <p className={`text-2xl font-bold ${diffColor(lastQty, lastBbm)}`}>
                  {lastBbm !== null
                    ? (lastQty - lastBbm > 0 ? '+' : '') + (lastQty - lastBbm)
                    : '—'}
                </p>
              </div>
            </div>

            <div className={`mb-4 text-center text-sm font-medium ${diffColor(lastQty, lastBbm)}`}>
              {diffLabel(lastQty, lastBbm)}
            </div>

            {/* Inline edit količine */}
            <div className="border-t border-gray-100 pt-3 mb-3">
              <label className="block text-sm font-medium text-gray-600 mb-2">Ispravi brojano</label>
              <div className="flex gap-2">
                <input
                type="text"
inputMode="numeric"
value={editQty === '' ? String(lastQty) : editQty}
onChange={e => setEditQty(e.target.value.replace(/[^0-9]/g, ''))}
onFocus={() => setEditQty(String(lastQty))}
                  className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 text-center text-lg font-bold"
                  min={0}
                />
                <button
                  onClick={saveInlineEdit}
                  className="flex-1 bg-blue-600 text-white rounded-xl px-4 py-2 font-medium"
                >
                  Spremi ispravak
                </button>
              </div>
            </div>

            {/* Skeniraj sljedeći */}
            <button
              onClick={startScanner}
              className="w-full bg-green-500 text-white rounded-xl py-4 text-lg font-bold"
            >
              📷 Skeniraj sljedeći
            </button>
          </div>
        )}

        {/* Ručni unos */}
        {selectedSession && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <label className="block text-sm font-medium text-gray-600 mb-2">Ručni unos šifre</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualInput()}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-gray-800"
                placeholder="Šifra artikla..."
              />
              <input
                type="number"
                value={manualQty}
                onChange={e => setManualQty(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-gray-800 text-center"
                min={1}
              />
              <button
                onClick={handleManualInput}
                className="bg-blue-600 text-white rounded-xl px-4 py-2 font-medium"
              >
                Dodaj
              </button>
            </div>
          </div>
        )}

        {/* Lista zadnjih skenova */}
        {recentScans.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-600">
                Zadnje skenirani{' '}
                <span className="text-xs text-gray-400">(klikni za ispravak)</span>
              </p>
            </div>
            {recentScans.map((s, i) => {
              const diff = s.bbm !== null ? s.qty - s.bbm : null
              return (
                <div
                  key={s.product_id}
                  onClick={() => openEditModal(s)}
                  className={`flex justify-between items-center px-4 py-3 cursor-pointer active:bg-gray-50 ${
                    i !== recentScans.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-700">
                      {s.qty} <span className="text-xs">✏️</span>
                    </p>
                    {diff !== null && (
                      <p className={`text-xs font-medium ${
                        diff === 0 ? 'text-green-500' : diff > 0 ? 'text-orange-500' : 'text-red-500'
                      }`}>
                        {diff > 0 ? '+' : ''}{diff}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Edit modal iz liste */}
      {editingItem && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end z-50"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="bg-white w-full rounded-t-3xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs text-gray-400 mb-1">Ispravak količine</p>
            <p className="font-semibold text-gray-800 text-lg mb-1">{editingItem.name}</p>
            <p className="text-sm text-gray-400 mb-4">Šifra: {editingItem.code}</p>

            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={() => setEditingItemQty(q => Math.max(0, q - 1))}
                className="w-14 h-14 bg-gray-100 rounded-2xl text-2xl font-bold text-gray-600"
              >
                −
              </button>
              <input
                type="number"
                value={editingItemQty}
                onChange={e => setEditingItemQty(Number(e.target.value))}
                className="flex-1 border-2 border-blue-200 rounded-2xl px-4 py-3 text-center text-3xl font-bold text-blue-700"
                min={0}
              />
              <button
                onClick={() => setEditingItemQty(q => q + 1)}
                className="w-14 h-14 bg-gray-100 rounded-2xl text-2xl font-bold text-gray-600"
              >
                +
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditingItem(null)}
                className="flex-1 bg-gray-100 text-gray-600 rounded-2xl py-4 font-medium"
              >
                Odustani
              </button>
              <button
                onClick={saveEditModal}
                className="flex-1 bg-blue-600 text-white rounded-2xl py-4 font-medium"
              >
                Spremi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}