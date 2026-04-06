'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeSessions: 0,
    totalCounts: 0,
    totalMatches: 0,
  })
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const [products, sessions, counts, matches] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('inventory_sessions').select('*, warehouses(name)').order('created_at', { ascending: false }).limit(5),
      supabase.from('inventory_counts').select('id', { count: 'exact', head: true }),
      supabase.from('transfer_matches').select('id', { count: 'exact', head: true }).eq('status', 'prijedlog'),
    ])

    setStats({
      totalProducts: products.count || 0,
      activeSessions: sessions.data?.filter(s => s.status === 'u_tijeku').length || 0,
      totalCounts: counts.count || 0,
      totalMatches: matches.count || 0,
    })
    setSessions(sessions.data || [])
    setLoading(false)
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
    return (
      <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${map[status]}`}>
        {label[status]}
      </span>
    )
  }

  if (loading) return (
    <div className="p-6 text-gray-400">Učitavam...</div>
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-800 mb-6">Dashboard</h1>

      {/* Kartice */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Artikala u bazi', value: stats.totalProducts, color: 'bg-blue-50 text-blue-700', href: '/artikli' },
          { label: 'Aktivne sesije', value: stats.activeSessions, color: 'bg-green-50 text-green-700', href: '/sesije' },
          { label: 'Skeniranih stavki', value: stats.totalCounts, color: 'bg-purple-50 text-purple-700', href: '/razlike' },
          { label: 'Prijedlozi matchinga', value: stats.totalMatches, color: 'bg-orange-50 text-orange-700', href: '/matching' },
        ].map(s => (
          <Link key={s.label} href={s.href}>
            <div className={`rounded-2xl p-5 ${s.color} hover:opacity-80 transition-opacity cursor-pointer`}>
              <p className="text-3xl font-bold">{s.value}</p>
              <p className="text-sm mt-1 opacity-75">{s.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Brze akcije */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {[
          { label: '📷 Skeniranje', href: '/skeniraj', color: 'bg-blue-600 text-white' },
          { label: '📋 Nova sesija', href: '/sesije', color: 'bg-white text-gray-700 border border-gray-200' },
          { label: '⚖️ Razlike', href: '/razlike', color: 'bg-white text-gray-700 border border-gray-200' },
          { label: '🔄 Matching', href: '/matching', color: 'bg-white text-gray-700 border border-gray-200' },
        ].map(a => (
          <Link key={a.label} href={a.href}>
            <div className={`rounded-xl px-4 py-3 text-sm font-medium text-center ${a.color} hover:opacity-80 transition-opacity cursor-pointer`}>
              {a.label}
            </div>
          </Link>
        ))}
      </div>

      {/* Zadnje sesije */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center">
          <p className="font-medium text-gray-700">Zadnje sesije</p>
          <Link href="/sesije" className="text-sm text-blue-500 hover:text-blue-700">Sve sesije</Link>
        </div>
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm p-6">Nema sesija.</p>
        ) : (
          sessions.map((s, i) => (
            <div key={s.id} className={`flex items-center justify-between px-6 py-3 ${i !== sessions.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div>
                <p className="font-medium text-gray-800 text-sm">{s.name}</p>
                <p className="text-xs text-gray-400">{(s.warehouses as any)?.name} · {new Date(s.created_at).toLocaleDateString('hr')}</p>
              </div>
              {statusBadge(s.status)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}