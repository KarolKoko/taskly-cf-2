import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseUnifiedDiff, fetchGithubPrDiff } from './diff.js'
import { readAgentInstructions, readRelevantDocumentation } from './context.js'
import { generateTestPlan } from './model.js'
import { GENERATED_TEST_FILE_MARKER, renderTestFile, testFilePath } from './render.js'
import type { GeneratedTestPlan } from './schema.js'

function arg(flag: string): string | undefined { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : undefined }
function assertInRepo(repo: string, file: string): string {
  const absolute = path.resolve(repo, file)
  if (absolute !== repo && !absolute.startsWith(repo + path.sep)) throw new Error(`Path escapes repository: ${file}`)
  return absolute
}
async function assertNoSymlinkEscape(repo: string, target: string): Promise<void> {
  let current = target
  while (true) {
    try {
      const actual = await realpath(current)
      if (actual !== repo && !actual.startsWith(repo + path.sep)) {
        throw new Error(`Path resolves outside repository: ${path.relative(repo, target)}`)
      }
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      current = parent
    }
  }
}
async function existingFile(file: string): Promise<string | undefined> {
  try { return await readFile(file, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function main() {
  const repo = path.resolve(arg('--repo') ?? process.cwd())
  const realRepo = await realpath(repo)
  const diffPath = arg('--diff')
  const pr = arg('--pr')
  const owner = arg('--owner')
  const name = arg('--name')
  if (!diffPath && !(pr && owner && name)) throw new Error('Specify --diff <file> OR --owner <owner> --name <repo> --pr <number>')
  const diff = diffPath ? await readFile(path.resolve(diffPath), 'utf8') :
    await fetchGithubPrDiff(owner!, name!, Number(pr), process.env.GITHUB_TOKEN ?? '')
  const changed = parseUnifiedDiff(diff)
  if (!changed.length) {
    const reportPath = assertInRepo(repo, '.vitest-agent/generation-report.json')
    const plansPath = assertInRepo(repo, '.vitest-agent/plans')
    await assertNoSymlinkEscape(realRepo, reportPath)
    await assertNoSymlinkEscape(realRepo, plansPath)
    await mkdir(plansPath, { recursive: true })
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, JSON.stringify({ files: [] }, null, 2) + '\n')
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'has_generated_tests=false\n')
    console.log('No changed TypeScript/JavaScript source files eligible for test generation')
    return
  }
  const agentsDir = path.resolve(arg('--agents') ?? path.join(repo, 'agents'))
  const agentInstructions = await readAgentInstructions(agentsDir)
  if (!agentInstructions) throw new Error(`No agent instructions found in ${agentsDir}`)
  const docsDir = path.resolve(arg('--docs') ?? path.join(repo, 'data'))
  const dryRun = process.argv.includes('--plan-only')
  const report: {
    source_file: string
    test_file: string | null
    business_behaviors: GeneratedTestPlan['business_behaviors']
    unknowns: string[]
    cases: GeneratedTestPlan['cases']
    status: 'generated' | 'plan_only' | 'no_testable_cases'
  }[] = []
  for (const change of changed) {
    const sourceFile = assertInRepo(repo, change.file)
    await assertNoSymlinkEscape(realRepo, sourceFile)
    const source = await readFile(sourceFile, 'utf8')
    const docs = await readRelevantDocumentation(docsDir, change.patch)
    const plan = await generateTestPlan({ file: change.file, source, diff: change.patch, agentInstructions, vitestDocs: docs })
    const planPath = assertInRepo(repo, `.vitest-agent/plans/${change.file}.json`)
    await assertNoSymlinkEscape(realRepo, planPath)
    await mkdir(path.dirname(planPath), {recursive:true})
    await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n')
    console.log(`Plan: ${path.relative(repo, planPath)} (${plan.cases.length} cases)`)
    if (dryRun || !plan.cases.length) {
      report.push({
        source_file: change.file,
        test_file: null,
        business_behaviors: plan.business_behaviors,
        unknowns: plan.unknowns,
        cases: plan.cases,
        status: dryRun ? 'plan_only' : 'no_testable_cases',
      })
      if (!plan.cases.length) console.warn(`No evidence-backed test cases for ${change.file}`)
      continue
    }
    const standardPath = testFilePath(change.file)
    let targetPath = standardPath
    let target = assertInRepo(repo, targetPath)
    await assertNoSymlinkEscape(realRepo, target)
    let current = await existingFile(target)
    if (current && !current.startsWith(GENERATED_TEST_FILE_MARKER)) {
      const ext = path.posix.extname(standardPath)
      targetPath = `${standardPath.slice(0, -ext.length)}.generated${ext}`
      target = assertInRepo(repo, targetPath)
      await assertNoSymlinkEscape(realRepo, target)
      current = await existingFile(target)
      if (current && !current.startsWith(GENERATED_TEST_FILE_MARKER)) {
        throw new Error(`Refusing to overwrite developer-authored test file: ${targetPath}`)
      }
    }
    if (!current || current.startsWith(GENERATED_TEST_FILE_MARKER)) {
      await mkdir(path.dirname(target), {recursive:true})
      await writeFile(target, renderTestFile(plan, change.file, targetPath))
      console.log(`Test: ${targetPath}`)
    }
    report.push({
      source_file: change.file,
      test_file: targetPath,
      business_behaviors: plan.business_behaviors,
      unknowns: plan.unknowns,
      cases: plan.cases,
      status: 'generated',
    })
  }
  const reportPath = assertInRepo(repo, '.vitest-agent/generation-report.json')
  await assertNoSymlinkEscape(realRepo, reportPath)
  await mkdir(path.dirname(reportPath), {recursive:true})
  await writeFile(reportPath, JSON.stringify({ files: report }, null, 2) + '\n')
  const generated = report.some(file => file.status === 'generated')
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `has_generated_tests=${generated}\n`)
  }
  console.log(`Generation summary: ${report.filter(file => file.status === 'generated').length} files, ${report.reduce((sum, file) => sum + file.cases.length, 0)} cases`)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
