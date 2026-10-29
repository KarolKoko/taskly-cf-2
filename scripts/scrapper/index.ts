import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseApiPage, type ApiPage } from './parser.js'

const BASE = 'https://vitest.dev'
const ROOT = `${BASE}/api/`
const API = new URL(ROOT)
const outDir = path.resolve(process.env.OUTPUT_DIR || path.join(__dirname, 'data'))
const concurrency = Math.max(1, Math.min(12, Number(process.env.CONCURRENCY || 3)))
const delayMs = Math.max(0, Number(process.env.DELAY_MS || 250))
const maxPages = Math.max(1, Number(process.env.MAX_PAGES || 500))
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const headers = { 'User-Agent': 'VitestDocsStructuredScraper/1.0 (+https://vitest.dev/)', Accept: 'text/html,application/xml,text/xml' }

async function get(url: string): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) })
      if (response.status === 429 || response.status >= 500) {
        if (attempt < 3) { await sleep(600 * 2 ** attempt); continue }
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`)
      return response.text()
    } catch (error) {
      if (attempt === 3) throw error
      await sleep(600 * 2 ** attempt)
    }
  }
  throw new Error(`Failed to fetch ${url}`)
}

function isApiUrl(raw: string): string | null {
  try {
    const url = new URL(raw, BASE)
    if (url.origin !== API.origin || !url.pathname.startsWith(API.pathname)) return null
    if (/\.(?:css|js|json|md|png|jpg|svg|xml)$/i.test(url.pathname)) return null
    url.hash = ''
    url.search = ''
    if (url.pathname.endsWith('.html')) url.pathname = url.pathname.slice(0, -5)
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '')
    return url.toString()
  } catch { return null }
}

async function discover(): Promise<string[]> {
  const urls = new Set<string>([ROOT.replace(/\/$/, '')])
  // Prefer the public sitemap, but fall back to following links from /api/.
  try {
    const sitemap = await get(`${BASE}/sitemap.xml`)
    for (const match of sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)) {
      const url = isApiUrl(match[1].replace(/&amp;/g, '&'))
      if (url) urls.add(url)
    }
  } catch (error) { console.warn('Sitemap unavailable; using link discovery:', String(error)) }
  // Also crawl API index/sidebar: sitemap may omit some API pages.
  const queue = [...urls]
  const visited = new Set<string>()
  while (queue.length && visited.size < maxPages) {
    const url = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)
    try {
      const html = await get(url)
      const matches = html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)
      for (const match of matches) {
        const link = isApiUrl(new URL(match[1].replace(/&amp;/g, '&'), url).toString())
        if (link && !urls.has(link) && urls.size < maxPages) { urls.add(link); queue.push(link) }
      }
    } catch (error) { console.warn('Discovery failed:', url, String(error)) }
    await sleep(delayMs)
  }
  return [...urls].slice(0, maxPages).sort()
}

async function main() {
  await mkdir(path.join(outDir, 'pages'), { recursive: true })
  const urls = await discover()
  console.log(`Discovered ${urls.length} API pages`)
  const pages: ApiPage[] = []
  const errors: { url: string; message: string }[] = []
  let index = 0
  async function worker() {
    while (index < urls.length) {
      const url = urls[index++]
      try {
        const html = await get(url)
        const page = parseApiPage(html, url)
        if (!page.entries.length) throw new Error('No API headings found')
        pages.push(page)
        const slug = new URL(url).pathname.replace(/^\/api\/?/, '').replace(/[^a-z0-9_-]+/gi, '-') || 'index'
        await writeFile(path.join(outDir, 'pages', `${slug}.json`), JSON.stringify(page, null, 2) + '\n')
        console.log(`[${pages.length}/${urls.length}] ${url}`)
      } catch (error) {
        errors.push({ url, message: String(error) })
        console.warn(`Failed ${url}: ${String(error)}`)
      }
      await sleep(delayMs)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  pages.sort((a, b) => a.url.localeCompare(b.url))
  const result = {
    schemaVersion: '1.0', source: ROOT, scrapedAt: new Date().toISOString(),
    stats: { discovered: urls.length, succeeded: pages.length, failed: errors.length },
    pages, errors,
  }
  await writeFile(path.join(outDir, 'vitest-api.json'), JSON.stringify(result, null, 2) + '\n')
  console.log(`Saved ${pages.length} pages; ${errors.length} failed -> ${outDir}`)
  if (errors.length) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
