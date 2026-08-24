export type Campaign = {
  id: string
  title: string
  description: string
  category: string
  goalMinor: number
  raisedMinor: number
  donorCount: number
  currency: string
  imageUrl: string | null
  endsAt: string | null
  createdAt: string
  owner: { displayName: string; avatarUrl: string | null } | null
}

export function formatMoney(minor: number, currency: string): string {
  const digits = minor % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(minor / 100)
}

export function progressPercent(raisedMinor: number, goalMinor: number): number {
  if (goalMinor <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((raisedMinor / goalMinor) * 100)))
}

export function daysLeft(endsAt: string | null): number | null {
  if (endsAt === null) return null
  const msRemaining = new Date(endsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(msRemaining / 86_400_000))
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('')
}

export function mapCampaignRow(row: Record<string, unknown>): Campaign {
  // PostgREST returns an object for this to-one embed, but supabase-js can surface it
  // as an array without generated DB types. Handle both or owner names silently blank out.
  const rawProfile = row.profiles
  const profile = (Array.isArray(rawProfile) ? rawProfile[0] ?? null : rawProfile ?? null) as
    { display_name?: unknown; avatar_url?: unknown } | null
  const owner = profile
    ? {
        displayName: typeof profile.display_name === 'string' ? profile.display_name : '',
        avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
      }
    : null
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    goalMinor: Number(row.goal_minor),
    raisedMinor: Number(row.raised_minor),
    donorCount: Number(row.donor_count),
    currency: String(row.currency),
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    endsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
    createdAt: String(row.created_at),
    owner,
  }
}
