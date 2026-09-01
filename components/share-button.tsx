'use client'

import { useCallback } from 'react'
import { Share2 } from 'lucide-react'

export function ShareButton({ path, title }: { path: string; title: string }) {
  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url })
        return
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }
    // Fallback: copy URL to clipboard
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard not available either
    }
  }, [path, title])

  return (
    <button aria-label="Share" className="icon-button" onClick={handleShare}>
      <Share2 size={18} />
    </button>
  )
}