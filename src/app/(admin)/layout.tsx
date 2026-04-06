'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-56 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <p className="text-lg font-semibold text-gray-800">📦 Inventura</p>
          <p className="text-xs text-gray-400 mt-0.5">Admin panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  )
}