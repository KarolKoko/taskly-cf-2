import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'
import type { ApiPage } from '../scripts/scrapper/parser.js'

export async function readAgentInstructions(dir: string): Promise<string> {
  const fragments: string[] = []
  async function walk(directory: string, depth = 0) {
    if (depth > 4) return
    let names: string[]
    try { names = (await readdir(directory)).sort() } catch { return }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const absolute = path.join(directory, name)
      const info = await stat(absolute)
      if (info.isDirectory()) await walk(absolute, depth + 1)
      else if (info.isFile() && /\.(md|txt)$/i.test(name) && info.size <= 100_000) {
        fragments.push(`## ${path.relative(dir, absolute)}\n${(await readFile(absolute, 'utf8')).slice(0, 12_000)}`)
      }
    }
  }
  await walk(dir)
  return fragments.join('\n\n').slice(0, 35_000)
}

type DocEntry = { name: string; description?: string; signatures?: string[]; url?: string; children?: DocEntry[] }
function flatten(items: DocEntry[]): DocEntry[] { return items.flatMap(item => [item, ...flatten(item.children ?? [])]) }

export async function readRelevantDocumentation(dataDir: string, diff: string, limit = 18): Promise<string> {
  const file = path.join(dataDir, 'vitest-api.json')
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  const pages: ApiPage[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.pages) ? (raw as any).pages : []
  if (pages.length === 0) throw new Error(`Vitest API reference has no pages: ${file}`)
  const tokens = new Set((diff.toLowerCase().match(/[a-z_$][\w$]{2,}/g) ?? []).slice(0, 2000))
  const entries = pages.flatMap(p => flatten(p.entries as DocEntry[])).map(entry => {
    const terms = (entry.name.toLowerCase().match(/[a-z_$][\w$]{2,}/g) ?? [])
    return { entry, score: terms.filter(t => tokens.has(t)).length + (entry.name.startsWith('expect') ? 1 : 0) }
  }).sort((a, b) => b.score - a.score).slice(0, limit)
  if (entries.length === 0) throw new Error(`No Vitest API reference entries available: ${file}`)
  return JSON.stringify(entries.map(({entry}) => ({ name: entry.name, description: entry.description?.slice(0, 400), signatures: entry.signatures?.slice(0, 2), url: entry.url }))).slice(0, 18_000)
}

export interface RepositoryContext {
  files: { path: string; relation: 'dependency' | 'caller' | 'test' | 'documentation'; content: string }[]
  omitted: string[]
}

/** Read only bounded source/documentation inside the checkout; never follow symlinks. */
export async function readRepositoryContext(repo: string, sourceFile: string, source: string): Promise<RepositoryContext> {
  const root = await realpath(repo)
  const candidates: { path: string; content: string }[] = []
  const omitted: string[] = []
  const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage', 'generated', '.vitest-agent', '.next'])
  let scanned = 0
  async function walk(directory: string) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) { omitted.push(`Symlink excluded: ${path.relative(root, path.join(directory, entry.name))}`); continue }
      if (ignored.has(entry.name) || entry.name.startsWith('.')) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) { await walk(absolute); continue }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|md)$/.test(entry.name)) continue
      if (++scanned > 1500) throw new Error('Repository context scan exceeds 1500 files')
      const relative = path.relative(root, absolute).split(path.sep).join('/')
      const actual = await realpath(absolute)
      if (!actual.startsWith(root + path.sep)) throw new Error(`Context path escapes repository: ${relative}`)
      const info = await stat(absolute)
      if (info.size > 100_000) { omitted.push(`Oversized file excluded: ${relative}`); continue }
      candidates.push({ path: relative, content: await readFile(absolute, 'utf8') })
    }
  }
  await walk(root)
  const normalized = (file: string) => file.replace(/\.(?:[cm]?[jt]sx?)$/, '').replace(/\/index$/, '')
  function imports(file: string, content: string): string[] {
    const ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)
    const result: string[] = []
    function visit(node: ts.Node) {
      let specifier: ts.Expression | undefined
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) specifier = node.arguments[0]
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
        result.push(normalized(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier.text))))
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    return result
  }
  const target = normalized(sourceFile)
  const dependencies = new Set(imports(sourceFile, source))
  const files: RepositoryContext['files'] = []
  let remaining = 90_000
  const selected = candidates.flatMap(file => {
    if (file.path === sourceFile) return []
    const references = imports(file.path, file.content).includes(target)
    const test = /\.(test|spec)\.[jt]sx?$/.test(file.path)
    const relation = test && (references || normalized(file.path.replace(/\.(test|spec)(?=\.)/, '')) === target) ? 'test' :
      dependencies.has(normalized(file.path)) ? 'dependency' : references ? 'caller' :
      /(?:^|\/)README\.md$/i.test(file.path) ? 'documentation' : undefined
    return relation ? [{ ...file, relation }] : []
  }) as RepositoryContext['files']
  const priority = { test: 0, dependency: 1, caller: 2, documentation: 3 }
  selected.sort((a, b) => priority[a.relation] - priority[b.relation] || a.path.localeCompare(b.path))
  for (const file of selected) {
    if (files.length >= 20 || remaining <= 0) { omitted.push(`Context budget excluded: ${file.path}`); continue }
    const length = Math.min(file.content.length, 16_000, remaining)
    files.push({ ...file, content: file.content.slice(0, length) })
    remaining -= length
    if (length < file.content.length) omitted.push(`Context truncated: ${file.path}`)
  }
  return { files, omitted }
}
