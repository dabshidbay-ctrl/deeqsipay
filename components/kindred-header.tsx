'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuthUser } from '@/components/auth-provider'

function initialsForEmail(email: string): string {
  const local = email.split('@')[0] ?? ''
  const words = local.split(/[._+\-0-9]+/).filter(Boolean)
  const first = words[0]?.charAt(0) ?? ''
  const second = words.length > 1 ? words[1]?.charAt(0) ?? '' : words[0]?.charAt(1) ?? ''
  return `${first}${second}`.toUpperCase() || 'D'
}

export function KindredHeader({ eyebrow = 'deeqsipay' }: { eyebrow?: string }) {
  const { user, loading } = useAuthUser()
  return (
    <header className="flex items-center justify-between px-5 pb-3 pt-7">
      <Link href="/" className="block">
        <p className="font-serif text-[29px] font-semibold leading-none tracking-[-0.04em] text-foreground">deeqsipay</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      </Link>
      <div className="flex items-center gap-2">
        <Link href="/notifications" aria-label="Notifications" className="icon-button relative"><Bell size={19} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></Link>
        {loading ? <span className="avatar" aria-hidden="true" /> : user ? (
          <Link href="/profile" aria-label="Profile" className="avatar">{initialsForEmail(user.email ?? '')}</Link>
        ) : (
          <Link href="/login" aria-label="Sign in" className="avatar">in</Link>
        )}
      </div>
    </header>
  )
}
