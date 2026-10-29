import dotenv from 'dotenv'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseUnifiedDiff, fetchGithubPrDiff, type ChangedFile } from './diff.js'
import { coverRunEnabled, findCoverageTargets } from './cover.js'
import { readAgentInstructions, readRelevantDocumentation, readRepositoryContext } from './context.js'
import { generateTestPlan } from './model.js'
import { GENERATED_TEST_FILE_MARKER, renderTestFile, testFilePath } from './render.js'
import { TestPlan, type GeneratedTestPlan } from './schema.js'

// Local runs only: in CI secrets come from the environment, and a PR must never supply its own .env.
if (!process.env.GITHUB_ACTIONS) dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true })

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
  const coverRun = coverRunEnabled()
  const coverRefresh = /^(1|true|yes)$/i.test(process.env.COVER_RUN_REFRESH?.trim() ?? '') || process.argv.includes('--refresh')
  // Saved plans are reused only while the source, agent rules and planner prompt/schema are unchanged.
  const generatorVersion = (await readFile(path.join(__dirname, 'model.ts'), 'utf8')) + (await readFile(path.join(__dirname, 'schema.ts'), 'utf8'))
  if (!coverRun && !diffPath && !(pr && owner && name)) throw new Error('Specify --diff <file> OR --owner <owner> --name <repo> --pr <number>, or set COVER_RUN=true')
  let changed: ChangedFile[]
  if (coverRun) {
    const limit = Number(process.env.COVER_RUN_MAX_FILES ?? 40)
    if (!Number.isInteger(limit) || limit < 1) throw new Error('COVER_RUN_MAX_FILES must be a positive integer')
    const targets = await findCoverageTargets(repo)
    console.log(`COVER_RUN: ${targets.length} source files without tests${targets.length > limit ? `; processing first ${limit}` : ''}`)
    for (const target of targets) console.log(`  - ${target.file}`)
    changed = targets.slice(0, limit)
  } else {
    const diff = diffPath ? await readFile(path.resolve(diffPath), 'utf8') :
      await fetchGithubPrDiff(owner!, name!, Number(pr), process.env.GITHUB_TOKEN ?? '')
    changed = parseUnifiedDiff(diff)
  }
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
  const docsDir = path.resolve(arg('--docs') ?? path.join(repo, 'scripts', 'scrapper', 'data'))
  const dryRun = process.argv.includes('--plan-only')
  const report: {
    source_file: string
    test_file: string | null
    business_behaviors: GeneratedTestPlan['business_behaviors']
    unknowns: string[]
    cases: (GeneratedTestPlan['cases'][number] | GeneratedTestPlan['component_cases'][number])[]
    status: 'generated' | 'plan_only' | 'no_testable_cases'
  }[] = []
  for (const change of changed) {
    const sourceFile = assertInRepo(repo, change.file)
    await assertNoSymlinkEscape(realRepo, sourceFile)
    const source = await readFile(sourceFile, 'utf8')
    const planPath = assertInRepo(repo, `.vitest-agent/plans/${change.file}.json`)
    await assertNoSymlinkEscape(realRepo, planPath)
    const repositoryContext = await readRepositoryContext(repo, change.file, source)
    const docs = await readRelevantDocumentation(docsDir, change.patch)
    const fingerprint = createHash('sha256').update(source).update(JSON.stringify(repositoryContext)).update(docs).update(agentInstructions).update(generatorVersion).digest('hex')
    const fingerprintPath = `${planPath}.sha256`
    let plan: GeneratedTestPlan | undefined
    if (coverRun && !coverRefresh) {
      const [cachedPlan, cachedHash] = await Promise.all([existingFile(planPath), existingFile(fingerprintPath)])
      if (cachedPlan && cachedHash?.trim() === fingerprint) {
        const parsed = TestPlan.safeParse(JSON.parse(cachedPlan))
        if (parsed.success) { plan = parsed.data; console.log(`Reusing saved plan for ${change.file}`) }
      }
    }
    if (!plan) {
      plan = await generateTestPlan({ file: change.file, source, diff: change.patch, agentInstructions, vitestDocs: docs, repositoryContext })
      await mkdir(path.dirname(planPath), {recursive:true})
      await writeFile(planPath, JSON.stringify(plan, null, 2) + '\n')
      if (coverRun) await writeFile(fingerprintPath, fingerprint + '\n')
    }
    const caseCount = plan.cases.length + plan.component_cases.length
    console.log(`Plan: ${path.relative(repo, planPath)} (${caseCount} cases)`)
    if (dryRun || !caseCount) {
      report.push({
        source_file: change.file,
        test_file: null,
        business_behaviors: plan.business_behaviors,
        unknowns: plan.unknowns,
        cases: [...plan.cases, ...plan.component_cases],
        status: dryRun ? 'plan_only' : 'no_testable_cases',
      })
      if (!caseCount) console.warn(`No evidence-backed test cases for ${change.file}`)
      continue
    }
    const standardPath = testFilePath(change.file)
    let targetPath = standardPath
    let target = assertInRepo(repo, targetPath)
    await assertNoSymlinkEscape(realRepo, target)
    let current = await existingFile(target)
    if (current && !current.startsWith(GENERATED_TEST_FILE_MARKER)) {
      const ext = path.posix.extname(standardPath)
      targetPath = `${standardPath.slice(0, -ext.length).replace(/\.test$/, ".generated.test")}${ext}`
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
      cases: [...plan.cases, ...plan.component_cases],
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
