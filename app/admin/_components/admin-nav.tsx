'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/admin/transactions', label: 'Transactions' },
  { href: '/admin/profiles', label: 'Organisers' },
  { href: '/admin/payouts', label: 'Payouts' },
] as const

export function AdminNav() {
  const pathname = usePathname()
  return <nav className="scrollbar-hidden -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0">
    {LINKS.map((link) => {
      const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
      return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`pill ${active ? 'pill-active' : ''}`}>{link.label}</Link>
    })}
  </nav>
}
