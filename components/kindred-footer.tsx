import Link from 'next/link'
import { ArrowUpRight, Mail, ShieldCheck } from 'lucide-react'

export function KindredFooter() {
  return <footer className="mt-12 border-t border-border px-5 pb-8 pt-7">
    <div className="flex items-start justify-between gap-4">
      <div><p className="font-serif text-xl font-semibold tracking-[-0.03em]">DeeqsiPay</p><p className="mt-2 max-w-[220px] text-xs leading-5 text-muted-foreground">Fundraising for people and causes.</p></div>
      <div className="grid size-9 place-items-center rounded-full bg-muted text-primary"><ShieldCheck size={17} /></div>
    </div>
    <div className="mt-7 grid grid-cols-2 gap-6 text-xs">
      <div><p className="font-bold text-foreground">Explore</p><div className="mt-3 grid gap-2 text-muted-foreground"><Link href="/explore">Find a fundraiser</Link><Link href="/saved">Saved stories</Link><Link href="/create">Start a fundraiser</Link></div></div>
      <div><p className="font-bold text-foreground">Need help?</p><div className="mt-3 grid gap-2 text-muted-foreground"><a href="mailto:hello@deeqsipay.com" className="flex items-center gap-1.5">Contact us <Mail size={12} /></a><Link href="/how-payouts-work">How payouts work</Link><Link href="/privacy">Privacy policy</Link><Link href="/settings">Account settings</Link></div></div>
    </div>
    <div className="mt-7 flex items-center justify-between border-t border-border pt-4 text-[10px] text-muted-foreground"><span>© 2026 DeeqsiPay, Inc.</span><span className="flex items-center gap-1">Built for good <ArrowUpRight size={11} /></span></div>
  </footer>
}

export function ContactSection() { return <section className="mx-5 mt-10 rounded-2xl bg-primary p-5 text-primary-foreground"><p className="eyebrow text-primary-foreground/65">Questions, ideas, or a hand to lend?</p><h2 className="mt-2 font-serif text-2xl leading-tight">We&apos;re here to help your good work go further.</h2><a href="mailto:hello@deeqsipay.com" className="mt-5 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2.5 text-xs font-bold text-foreground">Get in touch <ArrowUpRight size={14} /></a></section> }
