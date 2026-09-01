'use client'

import { useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { CampaignImage } from '@/components/campaign-image'

export function CampaignGallery({ photos, coverUrl, title }: { photos: string[]; coverUrl: string | null; title: string }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  // Use coverUrl as first photo if no photos array, or merge them
  const allPhotos: string[] = photos.length > 0 ? photos : coverUrl ? [coverUrl] : [coverUrl ?? '/placeholder.jpg']

  const openLightbox = useCallback((index: number) => setLightboxIndex(index), [])
  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const goNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (lightboxIndex !== null && lightboxIndex < allPhotos.length - 1) {
      setLightboxIndex(lightboxIndex + 1)
    }
  }, [lightboxIndex, allPhotos.length])

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1)
    }
  }, [lightboxIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (lightboxIndex === null) return
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowRight' && lightboxIndex < allPhotos.length - 1) setLightboxIndex(lightboxIndex + 1)
    if (e.key === 'ArrowLeft' && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
  }, [lightboxIndex, allPhotos.length, closeLightbox])

  return <>
    {/* Cover image */}
    <div className="relative">
      <CampaignImage src={coverUrl ?? '/placeholder.jpg'} alt={title} className="campaign-image h-72" width={470} height={288} priority />
    </div>

    {/* Gallery thumbnails (shown if there are multiple photos) */}
    {allPhotos.length > 1 && (
      <div className="px-5 pt-3">
        <div className="gallery-grid">
          {allPhotos.map((photo, index) => (
            <button key={index} type="button" onClick={() => openLightbox(index)} className="overflow-hidden rounded-xl border border-border p-0" aria-label={`View photo ${index + 1} of ${allPhotos.length}`}>
              <img src={photo} alt={`${title} photo ${index + 1}`} className="gallery-thumb" loading="lazy" />
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">{allPhotos.length} {allPhotos.length === 1 ? 'photo' : 'photos'}</p>
      </div>
    )}

    {/* Lightbox */}
    {lightboxIndex !== null && (
      <div className="lightbox-backdrop" onClick={closeLightbox} onKeyDown={handleKeyDown} role="dialog" aria-label="Photo viewer" tabIndex={-1}>
        <button type="button" onClick={closeLightbox} className="absolute right-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-black/40 text-white" aria-label="Close">
          <X size={22} />
        </button>

        {lightboxIndex > 0 && (
          <button type="button" onClick={goPrev} className="absolute left-4 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white" aria-label="Previous photo">
            <ChevronLeft size={22} />
          </button>
        )}

        {lightboxIndex < allPhotos.length - 1 && (
          <button type="button" onClick={goNext} className="absolute right-4 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white" aria-label="Next photo">
            <ChevronRight size={22} />
          </button>
        )}

        <img src={allPhotos[lightboxIndex]} alt={`${title} photo ${lightboxIndex + 1}`} className="lightbox-image" />

        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-xs text-white">
          {lightboxIndex + 1} / {allPhotos.length}
        </p>
      </div>
    )}
  </>
}

