/**
 * Client-safe. Deliberately separate from lib/server/sifalo.ts: the donate form needs the
 * wallet list, and importing it from the server module would pull the charge logic and
 * credential handling into the browser bundle.
 */

export type SifaloWallet = 'zaad' | 'edahab' | 'pbwallet'

export const SIFALO_WALLETS: ReadonlyArray<{ value: SifaloWallet; label: string; hint: string }> = [
  { value: 'zaad', label: 'EVC Plus / ZAAD / SAHAL', hint: 'Hormuud, Telesom or Golis' },
  { value: 'edahab', label: 'eDahab', hint: 'Somtel' },
  { value: 'pbwallet', label: 'Premier Wallet', hint: 'Premier Bank' },
]

const WALLETS = new Set<string>(SIFALO_WALLETS.map((wallet) => wallet.value))

export function isSifaloWallet(value: unknown): value is SifaloWallet {
  return typeof value === 'string' && WALLETS.has(value)
}
