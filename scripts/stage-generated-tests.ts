import { copyFile, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { GENERATED_TEST_FILE_MARKER } from '../generator/render.js'

interface GenerationFile {
  test_file: string | null
  status: 'generated' | 'plan_only' | 'no_testable_cases'
}

function resolveInside(root: string, relative: string): string {
  const absolute = path.resolve(root, relative)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new Error(`Refusing path outside repository: ${relative}`)
  }
  return absolute
}

async function copyTree(source: string, destination: string, root: string, relative: string): Promise<void> {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const childRelative = path.posix.join(relative, entry.name)
    const childSource = resolveInside(root, childRelative)
    const childDestination = path.join(destination, childRelative)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in generated plans: ${childRelative}`)
    if (entry.isDirectory()) {
      await mkdir(childDestination, { recursive: true })
      await copyTree(childSource, destination, root, childRelative)
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      await mkdir(path.dirname(childDestination), { recursive: true })
      await copyFile(childSource, childDestination)
    } else {
      throw new Error(`Unexpected generated-plan entry: ${childRelative}`)
    }
  }
}

async function main() {
  const repo = await realpath(path.resolve(process.argv[2] ?? ''))
  const destination = path.resolve(process.argv[3] ?? '')
  if (!process.argv[2] || !process.argv[3]) throw new Error('Usage: stage-generated-tests <repo> <destination>')
  const reportPath = resolveInside(repo, '.vitest-agent/generation-report.json')
  const report = JSON.parse(await readFile(reportPath, 'utf8')) as { files: GenerationFile[] }
  if (!Array.isArray(report.files)) throw new Error('Invalid generation report: files must be an array')

  await mkdir(destination, { recursive: true })
  const generated = report.files.filter(file => file.status === 'generated' && file.test_file)
  for (const file of generated) {
    const relative = file.test_file!
    const source = resolveInside(repo, relative)
    const actual = await realpath(source)
    if (actual !== repo && !actual.startsWith(repo + path.sep)) {
      throw new Error(`Generated test resolves outside repository: ${relative}`)
    }
    const content = await readFile(source, 'utf8')
    if (!content.startsWith(GENERATED_TEST_FILE_MARKER)) {
      throw new Error(`Generated test marker missing: ${relative}`)
    }
    const target = resolveInside(destination, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
  }

  const generationReport = path.relative(repo, reportPath)
  const stagedReport = resolveInside(destination, generationReport)
  await mkdir(path.dirname(stagedReport), { recursive: true })
  await copyFile(reportPath, stagedReport)
  const plansPath = resolveInside(repo, '.vitest-agent/plans')
  await copyTree(plansPath, destination, repo, '.vitest-agent/plans')
  console.log(`Staged ${generated.length} generated test file(s)`)
}

main().catch(error => {
  console.error('Unable to stage generated tests:', error)
  process.exitCode = 1
})
