import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient, requireUser } from '@/lib/server/supabase-admin'

/**
 * Uploads go through the server rather than straight from the browser, so that MIME type,
 * magic bytes and size are checked somewhere the uploader cannot edit.
 *
 * Two kinds, with deliberately different destinations:
 *   'campaign-image'    -> public bucket, returns a public URL
 *   'identity-document' -> PRIVATE bucket, returns only a storage PATH. Never a URL:
 *                          this is a passport or NIRA card, and a URL is a thing that
 *                          leaks. Admins read it later via a short-lived signed URL.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

const KINDS = {
  'campaign-image': { bucket: 'campaign-images', maxBytes: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp'] },
  'identity-document': { bucket: 'identity-documents', maxBytes: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
} as const

type Kind = keyof typeof KINDS

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
}

/** A declared Content-Type is just a claim. Check the actual leading bytes. */
function sniff(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf'
  return null
}

export async function POST(request: Request) {
  const user = await requireUser(request)
  if (!user) return json({ error: 'Authentication required' }, 401)

  let form: FormData
  try { form = await request.formData() } catch { return json({ error: 'Invalid upload' }, 400) }

  const kind = String(form.get('kind') ?? '')
  if (!(kind in KINDS)) return json({ error: 'Unknown upload kind' }, 400)
  const spec = KINDS[kind as Kind]

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return json({ error: 'No file received' }, 400)
  if (file.size > spec.maxBytes) return json({ error: `File must be under ${Math.floor(spec.maxBytes / 1024 / 1024)} MB` }, 413)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const actual = sniff(bytes)
  // Trust the bytes, not the header: a .php renamed to .jpg would pass a header check.
  if (actual === null || !spec.mimes.includes(actual as never)) {
    return json({ error: kind === 'identity-document' ? 'Upload a photo or PDF of your ID' : 'Upload a JPG, PNG or WebP image' }, 415)
  }

  // Foldered by uid so the storage policies can scope writes to the owner.
  const path = `${user.id}/${randomUUID()}.${EXTENSIONS[actual]}`
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(spec.bucket).upload(path, bytes, { contentType: actual, upsert: false })
  if (error) return json({ error: 'Unable to store the file' }, 500)

  if (kind === 'identity-document') {
    // Path only. Returning a URL here — even a signed one — would put a passport link in
    // the browser, in logs, and in anything that later echoes this response.
    return json({ path }, 201)
  }

  const { data } = supabase.storage.from(spec.bucket).getPublicUrl(path)
  return json({ path, url: data.publicUrl }, 201)
}
