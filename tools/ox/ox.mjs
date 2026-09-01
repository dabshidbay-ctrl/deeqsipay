#!/usr/bin/env node
// Senior/worker bridge: Claude writes the spec, Ox Alpha writes the code.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const MODEL = process.env.OX_MODEL || 'deepseek/deepseek-v4-flash-0731'

function key() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  const f = resolve(ROOT, '.env.ox')
  if (!existsSync(f)) throw new Error('No .env.ox and no OPENROUTER_API_KEY')
  const m = readFileSync(f, 'utf8').match(/OPENROUTER_API_KEY\s*=\s*(\S+)/)
  if (!m) throw new Error('.env.ox has no OPENROUTER_API_KEY')
  return m[1]
}

const SYSTEM = `You are Ox Alpha, a senior implementation engineer on a Next.js 16 (App Router) + TypeScript + Tailwind v4 + Supabase fundraising app called "kindred".

A senior architect gives you scoped specs. Implement them exactly. Do not redesign, do not add features not asked for, do not leave TODOs or placeholder logic.

House style, non-negotiable:
- TypeScript strict. No 'any'. No non-null '!' assertions.
- Money is ALWAYS integer minor units. Never floats for money.
- Server-only code lives under lib/server/. Never import it from a client component.
- Existing CSS utility classes in app/globals.css (.campaign-card, .confirm-button, .amount-input, .eyebrow, .pill, .icon-button, .progress-track, .progress-fill, .bottom-nav, .nav-item, etc) are the design system. REUSE them. Do not invent new class names or restyle.
- Match the existing terse code style in the repo.

OUTPUT FORMAT — this is parsed by a script, obey it exactly:
For every file you create or replace, emit the COMPLETE file content (never a diff, never "... rest unchanged") wrapped as:

=== FILE: relative/path/from/repo/root.ts ===
<complete file content, no markdown fences>
=== END FILE ===

Emit nothing outside these blocks except, optionally, a final short "=== NOTES ===" section listing assumptions or risks.`

async function call(spec, attempt = 0) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: spec }],
      temperature: 0.2,
      max_tokens: 60000,
    }),
  })
  const text = await res.text()
  if ((res.status === 429 || res.status >= 500) && attempt < 14) {
    const wait = Math.min(45000, 3000 * 2 ** attempt) + Math.floor(Math.random() * 3000)
    process.stderr.write(`[ox] ${res.status} upstream, retry ${attempt + 1}/14 in ${wait / 1000}s
`)
    await new Promise((r) => setTimeout(r, wait))
    return call(spec, attempt + 1)
  }
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 600)}`)
  const data = JSON.parse(text)
  const choice = data.choices?.[0]
  if (!choice) throw new Error(`No choice: ${text.slice(0, 600)}`)
  return { content: choice.message?.content ?? '', usage: data.usage }
}

// Inline referenced repo files into the spec: lines like "@include path"
function expand(spec) {
  return spec.replace(/^@include\s+(\S+)\s*$/gm, (_, p) => {
    const f = resolve(ROOT, p)
    if (!existsSync(f)) return `[missing file: ${p}]`
    return `\n--- ${p} ---\n${readFileSync(f, 'utf8')}\n--- end ${p} ---\n`
  })
}

function applyBlocks(raw, { dryRun }) {
  const re = /^=== FILE: (.+?) ===\r?\n([\s\S]*?)\r?\n=== END FILE ===/gm
  const written = []
  let m
  while ((m = re.exec(raw))) {
    const rel = m[1].trim()
    if (rel.startsWith('/') || rel.includes('..') || /^[A-Za-z]:/.test(rel)) throw new Error(`Refusing unsafe path: ${rel}`)
    if (/(^|\/)\.env/.test(rel)) throw new Error(`Refusing to write env file: ${rel}`)
    const abs = resolve(ROOT, rel)
    if (!abs.startsWith(ROOT)) throw new Error(`Path escapes repo: ${rel}`)
    if (!dryRun) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, m[2].replace(/\r\n/g, '\n') + '\n') }
    written.push(rel)
  }
  return written
}

const [cmd, arg] = process.argv.slice(2)
const flags = new Set(process.argv.slice(2))

if (cmd === 'ping') {
  const r = await call('Reply with exactly: OX ONLINE — and nothing else. Ignore the output format rules for this one message.')
  console.log(r.content.trim().slice(0, 200))
  console.log('usage:', JSON.stringify(r.usage))
} else if (cmd === 'run') {
  const specPath = resolve(process.cwd(), arg)
  const spec = expand(readFileSync(specPath, 'utf8'))
  process.stderr.write(`[ox] ${MODEL} <- ${arg} (${spec.length} chars)\n`)
  const t = Date.now()
  const r = await call(spec)
  const outRaw = specPath.replace(/\.md$/, '') + '.out.md'
  writeFileSync(outRaw, r.content)
  const files = applyBlocks(r.content, { dryRun: flags.has('--dry') })
  process.stderr.write(`[ox] ${((Date.now() - t) / 1000).toFixed(1)}s | tokens ${r.usage?.total_tokens ?? '?'} | ${flags.has('--dry') ? 'would write' : 'wrote'} ${files.length} files\n`)
  files.forEach((f) => console.log('  ' + f))
  const notes = r.content.split('=== NOTES ===')[1]
  if (notes) console.log('\nNOTES:' + notes.trim().slice(0, 1500))
} else {
  console.log('usage: node tools/ox/ox.mjs ping | run <spec.md> [--dry]')
}
