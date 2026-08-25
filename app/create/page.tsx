'use client'

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ImagePlus, Loader2, Lock, Plus, X } from 'lucide-react'
import { ApiError, AuthRequiredError, authedFetch } from '@/lib/supabase/session'
import { tryGetSupabaseBrowserClient } from '@/lib/supabase/client'

const CATEGORIES = ['Medical', 'Emergency', 'Community', 'Nonprofit', 'Education']
const GOAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/
const PHONE_PATTERN = /^\+?[1-9]\d{7,14}$/

const MIN_PHONES = 2
const MAX_PHONES = 5
const LOGIN_NEXT = '/login?next=/create'

const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'
const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024

function parseGoalMinor(raw: string): number | null {
  if (!GOAL_PATTERN.test(raw)) return null
  const minor = Math.round(Number(raw) * 100)
  if (!Number.isSafeInteger(minor) || minor < 100 || minor > 1_000_000_000) return null
  return minor
}

/** A campaign photo is public, so we keep its URL. */
type PhotoUpload =
  | { status: 'empty' }
  | { status: 'uploading'; fileName: string }
  | { status: 'ready'; fileName: string; url: string }
  | { status: 'failed'; fileName: string; message: string }

/** An identity document is private: we hold only the storage path, and never render it. */
type DocumentUpload =
  | { status: 'empty' }
  | { status: 'uploading'; fileName: string }
  | { status: 'ready'; fileName: string; path: string }
  | { status: 'failed'; fileName: string; message: string }

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function serverError(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null
  const value = (payload as { error?: unknown }).error
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function readString(payload: unknown, key: string): string | null {
  if (typeof payload !== 'object' || payload === null || !(key in payload)) return null
  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** The endpoint's own wording is the most accurate; the status tells us how to frame it. */
function uploadMessage(payload: unknown, status: number): string {
  const detail = serverError(payload)
  if (status === 413) return `That file is too large. ${sentence(detail ?? 'Please choose a smaller one')}`
  if (status === 415) return `That kind of file will not work here. ${sentence(detail ?? 'Please choose a different one')}`
  if (detail !== null) return sentence(detail)
  return `We could not upload that file (error ${status}). Please try again.`
}

/**
 * authedFetch pins a JSON content-type, which would wreck the multipart boundary, so
 * uploads go out on a plain fetch that borrows the same bearer token.
 */
async function uploadFile(kind: 'campaign-image' | 'identity-document', file: File): Promise<unknown> {
  const supabase = tryGetSupabaseBrowserClient()
  if (!supabase) throw new AuthRequiredError()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new AuthRequiredError()

  const body = new FormData()
  body.append('kind', kind)
  body.append('file', file)

  const response = await fetch('/api/uploads', {
    method: 'POST',
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // Non-JSON body; fall through to status handling.
  }

  if (response.status === 401) throw new AuthRequiredError()
  if (!response.ok) throw new ApiError(response.status, uploadMessage(payload, response.status))
  return payload
}

export default function CreatePage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0] ?? '')
  const [goal, setGoal] = useState('')
  const [photo, setPhoto] = useState<PhotoUpload>({ status: 'empty' })
  const [identity, setIdentity] = useState<DocumentUpload>({ status: 'empty' })
  const [phones, setPhones] = useState<string[]>(['', ''])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const documentInputRef = useRef<HTMLInputElement | null>(null)
  // Pick a second file mid-upload and the first reply must not land on top of it.
  const photoTicket = useRef(0)
  const documentTicket = useRef(0)

  const cleanTitle = title.trim()
  const cleanDescription = description.trim()
  const cleanGoal = goal.trim()
  const goalMinor = parseGoalMinor(cleanGoal)

  const titleInvalid = cleanTitle !== '' && (cleanTitle.length < 8 || cleanTitle.length > 120)
  const descriptionInvalid = cleanDescription !== '' && (cleanDescription.length < 20 || cleanDescription.length > 5000)
  const goalInvalid = cleanGoal !== '' && goalMinor === null

  const trimmedPhones = phones.map((entry) => entry.trim())
  const filledPhones = trimmedPhones.filter((entry) => entry !== '')
  const phonesValid =
    filledPhones.length >= MIN_PHONES &&
    filledPhones.length <= MAX_PHONES &&
    new Set(filledPhones).size === filledPhones.length &&
    filledPhones.every((entry) => PHONE_PATTERN.test(entry))

  const uploading = photo.status === 'uploading' || identity.status === 'uploading'

  function phoneRowError(index: number): string | null {
    const value = trimmedPhones[index] ?? ''
    if (value === '') return null
    if (!PHONE_PATTERN.test(value)) return 'Add the country code, e.g. +252615551234.'
    if (trimmedPhones.indexOf(value) !== index) return 'You have already added this number — the second one needs to be different.'
    return null
  }

  /** Whatever is still standing between the organiser and the submit button. */
  function missingPiece(): string | null {
    if (cleanTitle.length < 8) return 'a title of at least 8 characters'
    if (cleanTitle.length > 120) return 'a shorter title — 120 characters at most'
    if (cleanDescription.length < 20) return 'your story, in at least 20 characters'
    if (cleanDescription.length > 5000) return 'a shorter story — 5000 characters at most'
    if (goalMinor === null) return 'a goal of at least $1'
    if (photo.status !== 'ready') return 'a campaign photo'
    if (identity.status !== 'ready') return 'a photo of your passport or NIRA card'
    if (!phonesValid) return 'two different contact numbers'
    return null
  }

  const missing = missingPiece()
  const canSubmit = !submitting && !uploading && missing === null

  function openPhotoPicker(): void {
    photoInputRef.current?.click()
  }

  function openDocumentPicker(): void {
    documentInputRef.current?.click()
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    // Clear it so choosing the very same file again still fires a change event.
    event.target.value = ''
    if (!file) return
    if (file.size > PHOTO_MAX_BYTES) {
      setPhoto({ status: 'failed', fileName: file.name, message: 'That photo is too large. Campaign photos must be under 5 MB.' })
      return
    }
    const ticket = photoTicket.current + 1
    photoTicket.current = ticket
    setError(null)
    setPhoto({ status: 'uploading', fileName: file.name })
    try {
      const payload = await uploadFile('campaign-image', file)
      if (photoTicket.current !== ticket) return
      const url = readString(payload, 'url')
      if (url === null) throw new ApiError(502, 'The photo uploaded but no link came back')
      setPhoto({ status: 'ready', fileName: file.name, url })
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      if (photoTicket.current !== ticket) return
      setPhoto({
        status: 'failed',
        fileName: file.name,
        message: err instanceof ApiError ? err.message : 'We could not reach the network. Please try again.',
      })
    }
  }

  async function handleDocumentChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > DOCUMENT_MAX_BYTES) {
      setIdentity({ status: 'failed', fileName: file.name, message: 'That file is too large. Your ID must be under 10 MB.' })
      return
    }
    const ticket = documentTicket.current + 1
    documentTicket.current = ticket
    setError(null)
    setIdentity({ status: 'uploading', fileName: file.name })
    try {
      const payload = await uploadFile('identity-document', file)
      if (documentTicket.current !== ticket) return
      // Deliberately only a path: there is no URL for this, and there should not be.
      const path = readString(payload, 'path')
      if (path === null) throw new ApiError(502, 'The file uploaded but was not stored properly')
      setIdentity({ status: 'ready', fileName: file.name, path })
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      if (documentTicket.current !== ticket) return
      setIdentity({
        status: 'failed',
        fileName: file.name,
        message: err instanceof ApiError ? err.message : 'We could not reach the network. Please try again.',
      })
    }
  }

  function updatePhone(index: number, value: string): void {
    setPhones((current) => current.map((entry, position) => (position === index ? value : entry)))
  }

  function addPhone(): void {
    setPhones((current) => (current.length >= MAX_PHONES ? current : [...current, '']))
  }

  function removePhone(index: number): void {
    setPhones((current) => (index < MIN_PHONES ? current : current.filter((_, position) => position !== index)))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return
    if (uploading) return setError('One of your files is still uploading. Give it a moment.')
    if (cleanTitle.length < 8 || cleanTitle.length > 120) return setError('Give your fundraiser a title between 8 and 120 characters.')
    if (cleanDescription.length < 20 || cleanDescription.length > 5000) return setError('Tell your story in 20 to 5000 characters.')
    if (goalMinor === null) return setError('Set a fundraising goal of at least $1.')
    if (photo.status !== 'ready') return setError('Add a campaign photo so people can picture your story.')
    if (identity.status !== 'ready') return setError('Add a photo of your passport or NIRA card so we can verify you.')
    if (!phonesValid) return setError('Add at least two different contact numbers, each with its country code.')
    setSubmitting(true)
    setError(null)
    try {
      const data = await authedFetch<{ campaign?: { id?: string } }>('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: cleanTitle,
          description: cleanDescription,
          category,
          goalMinor,
          imageUrl: photo.url,
          identityDocumentPath: identity.path,
          contactPhones: filledPhones,
        }),
      })
      if (typeof data.campaign?.id !== 'string') throw new ApiError(502, 'Unexpected response from the server')
      setSubmitted(true)
    } catch (err) {
      if (err instanceof AuthRequiredError) { router.push(LOGIN_NEXT); return }
      setError(err instanceof ApiError ? err.message : 'We could not reach the network. Please try again.')
      setSubmitting(false)
    }
  }

  if (submitted) {
    return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto flex min-h-screen max-w-[470px] flex-col justify-center border-x border-border bg-background px-6">
      <p className="eyebrow">Submitted for review</p>
      <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-[-0.035em]">Your story is with our team.</h1>
      <p className="mt-4 text-sm leading-7 text-muted-foreground">Every fundraiser is reviewed by a person before it goes live — it keeps donors safe and your campaign trusted. You will see it go public as soon as it is approved.</p>
      <div className="mt-8 space-y-3">
        <Link href="/dashboard" className="confirm-button">Go to your dashboard</Link>
        <Link href="/explore" className="block py-1 text-center text-xs font-bold text-primary">Explore other campaigns</Link>
      </div>
    </div></main>
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto min-h-screen max-w-[470px] border-x border-border bg-background px-5 pb-10">
        <header className="flex items-center gap-4 pb-8 pt-7">
          <Link href="/" aria-label="Back" className="icon-button"><ArrowLeft size={18} /></Link>
          <div>
            <p className="eyebrow">Create something meaningful</p>
            <h1 className="font-serif text-2xl">Start a fundraiser</h1>
          </div>
        </header>
        <form onSubmit={(event) => { void handleSubmit(event) }} className="space-y-5">
          <label className="block text-sm font-semibold">What are you raising money for?
            <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={8} maxLength={120} disabled={submitting}
              className="amount-input" placeholder="Give your fundraiser a clear title" />
          </label>
          {titleInvalid && <p className="text-xs font-semibold text-red-500" role="alert">Titles run from 8 to 120 characters.</p>}

          <label className="block text-sm font-semibold">Tell your story
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} required minLength={20} maxLength={5000} disabled={submitting}
              className="amount-input min-h-32 resize-none" placeholder="Help people understand why this matters..." />
          </label>
          {descriptionInvalid && <p className="text-xs font-semibold text-red-500" role="alert">Your story needs 20 to 5000 characters — you have {cleanDescription.length}.</p>}

          <label className="block text-sm font-semibold">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} disabled={submitting} className="amount-input">
              {CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>

          <label className="block text-sm font-semibold">Fundraising goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} inputMode="decimal" autoComplete="off" disabled={submitting}
              className="amount-input" placeholder="$ 0.00" />
          </label>
          {goalInvalid && <p className="text-xs font-semibold text-red-500" role="alert">Set a goal of at least $1 — whole dollars or up to 2 decimals.</p>}

          <div>
            <p className="text-sm font-semibold">Campaign photo</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">One honest photo does more than a page of words. JPG, PNG or WebP, up to 5 MB. This one is public — donors will see it.</p>
            <input ref={photoInputRef} type="file" accept={PHOTO_ACCEPT} className="hidden" tabIndex={-1}
              onChange={(event) => { void handlePhotoChange(event) }} />
            {photo.status === 'ready' ? (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                <img src={photo.url} alt="Your campaign photo" className="size-16 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{photo.fileName}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-primary"><Check size={12} /> Uploaded</p>
                </div>
                <button type="button" onClick={openPhotoPicker} disabled={submitting}
                  className="shrink-0 rounded-full border border-border px-3 py-2 text-[11px] font-bold text-foreground">Replace</button>
              </div>
            ) : (
              <button type="button" onClick={openPhotoPicker} disabled={submitting || photo.status === 'uploading'}
                className="amount-option mt-3 flex w-full items-center justify-center gap-2 text-xs">
                {photo.status === 'uploading' ? (
                  <><Loader2 size={15} className="animate-spin" /> <span className="max-w-[70%] truncate">Uploading {photo.fileName}…</span></>
                ) : (
                  <><ImagePlus size={15} /> {photo.status === 'failed' ? 'Choose another photo' : 'Add a campaign photo'}</>
                )}
              </button>
            )}
            {photo.status === 'failed' && <p className="mt-2 text-xs font-semibold leading-5 text-red-500" role="alert">{photo.message}</p>}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><Lock size={14} className="text-primary" /> Proof of identity</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              We know this is a lot to ask. A reviewer looks at your passport or NIRA card once, to confirm that a real, named person is behind this fundraiser. That single check is the reason donors trust the money they send here.
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              It is stored privately, apart from the public site. It never appears on your campaign, it is never shown to donors, and no one but our review team can open it.
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Passport or NIRA card — JPG, PNG, WebP or PDF, up to 10 MB.</p>
            <input ref={documentInputRef} type="file" accept={DOCUMENT_ACCEPT} className="hidden" tabIndex={-1}
              onChange={(event) => { void handleDocumentChange(event) }} />
            {identity.status === 'ready' ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-primary"><Check size={16} /></span>
                <div className="min-w-0 flex-1">
                  {/* Filename only. No preview, no link — this is a passport. */}
                  <p className="truncate text-xs font-semibold">{identity.fileName}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Uploaded and stored privately</p>
                </div>
                <button type="button" onClick={openDocumentPicker} disabled={submitting}
                  className="shrink-0 rounded-full border border-border px-3 py-2 text-[11px] font-bold text-foreground">Replace</button>
              </div>
            ) : (
              <button type="button" onClick={openDocumentPicker} disabled={submitting || identity.status === 'uploading'}
                className="amount-option mt-3 flex w-full items-center justify-center gap-2 text-xs">
                {identity.status === 'uploading' ? (
                  <><Loader2 size={15} className="animate-spin" /> <span className="max-w-[70%] truncate">Uploading {identity.fileName}…</span></>
                ) : (
                  <><Lock size={14} /> {identity.status === 'failed' ? 'Choose another file' : 'Add your passport or NIRA card'}</>
                )}
              </button>
            )}
            {identity.status === 'failed' && <p className="mt-2 text-xs font-semibold leading-5 text-red-500" role="alert">{identity.message}</p>}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Contact numbers</legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Two different numbers, so a reviewer can always reach someone — yours, and a second one that works if your phone does not. Include the country code.</p>
            <div className="mt-1 space-y-2">
              {phones.map((phone, index) => {
                const rowError = phoneRowError(index)
                return (
                  <div key={index}>
                    <div className="flex items-center gap-2">
                      <input value={phone} onChange={(event) => updatePhone(index, event.target.value)} type="tel" inputMode="tel" autoComplete="off"
                        aria-label={`Contact number ${index + 1}`} disabled={submitting}
                        placeholder={index === 0 ? '+252 61 555 1234' : 'A different number'}
                        className="amount-input flex-1" />
                      {index >= MIN_PHONES && (
                        <button type="button" onClick={() => removePhone(index)} disabled={submitting}
                          aria-label={`Remove contact number ${index + 1}`} className="icon-button mt-[7px] shrink-0"><X size={15} /></button>
                      )}
                    </div>
                    {rowError !== null && <p className="mt-1 text-xs font-semibold text-red-500" role="alert">{rowError}</p>}
                  </div>
                )
              })}
            </div>
            {phones.length < MAX_PHONES && (
              <button type="button" onClick={addPhone} disabled={submitting}
                className="amount-option mt-3 flex w-full items-center justify-center gap-2 text-xs"><Plus size={14} /> Add another number</button>
            )}
          </fieldset>

          {error !== null && <p className="text-xs font-semibold text-red-500" role="alert">{error}</p>}
          <div>
            <button type="submit" className="confirm-button disabled:opacity-55" disabled={!canSubmit}>{submitting ? 'Sending…' : 'Submit for review'}</button>
            {!canSubmit && !submitting && (
              <p className="mt-2 text-center text-[11px] leading-5 text-muted-foreground">
                {uploading ? 'Hold on — your file is still uploading.' : `Still to add: ${missing}.`}
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
