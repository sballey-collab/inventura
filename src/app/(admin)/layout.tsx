'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/dashboard', label: '📊 Dashboard' },
  { href: '/artikli', label: '📦 Artikli' },
  { href: '/sesije', label: '📋 Sesije' },
  { href: '/razlike', label: '⚖️ Razlike' },
  { href: '/matching', label: '🔄 Matching' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const NavLinks = ({ onClose }: { onClose?: () => void }) => (
    <>
      <nav className="flex-1 p-3 space-y-1">
        {links.map(link => (
          <Link
            key={link.href}
            href={link.href}
            onClick={onClose}
            className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              pathname === link.href
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-100">
        <Link
          href="/skeniraj"
          onClick={onClose}
          className="flex items-center px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 mb-1"
        >
          📷 Skeniranje
        </Link>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50"
        >
          Odjava
        </button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
        <p className="text-lg font-semibold text-gray-800">Inventura</p>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="Izbornik"
        >
          {menuOpen ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 shadow-md flex flex-col">
          <NavLinks onClose={() => setMenuOpen(false)} />
        </div>
      )}

      {/* Desktop layout */}
      <div className="flex">

        {/* Desktop sidebar — skrivena na mobitelu */}
        <div className="hidden md:flex w-56 bg-white border-r border-gray-100 flex-col min-h-screen">
          <div className="p-5 border-b border-gray-100">
            <p className="text-lg font-semibold text-gray-800">Inventura</p>
            <p className="text-xs text-gray-400 mt-0.5">Admin panel</p>
          </div>
          <NavLinks />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>

      </div>
    </div>
  )
}