import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { GenerationReport, verifyGeneratedResults } from './verify-generated-results.js'

interface SuiteResult {
  suite: string
  command: string[]
  exit_code: number
  output: string
  verification_errors: string[]
  typecheck_exit_code: number
}

async function main() {
  const repo = path.resolve(process.argv[2] ?? process.cwd())
  const generationPath = path.resolve(process.argv[3] ?? path.join(repo, '.vitest-agent/generation-report.json'))
  const generation = GenerationReport.parse(JSON.parse(await readFile(generationPath, 'utf8')))
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const env = { ...process.env }
  for (const name of ['OPENAI_API_KEY', 'GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_OUTPUT', 'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_STEP_SUMMARY']) delete env[name]
  const suites: SuiteResult[] = []
  const temporary = await mkdtemp(path.join(tmpdir(), 'taskly-vitest-'))
  try {
    for (const suite of ['frontend', 'backend']) {
      const options = {
        cwd: path.join(repo, suite), encoding: 'utf8' as const, env,
        shell: process.platform === 'win32', maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60 * 1000,
      }
      const typecheck = spawnSync(npm, ['run', 'typecheck'], options)
      const typecheckExit = typecheck.error ? 1 : typecheck.status ?? 1
      const resultPath = path.join(temporary, `${suite}.json`)
      const command = ['test', '--', '--reporter=default', '--reporter=json', `--outputFile=${resultPath}`]
      // Run both suites even if a type check or the other suite fails.
      const result = spawnSync(npm, command, options)
      const output = `Typecheck:\n${typecheck.stdout ?? ''}${typecheck.stderr ?? ''}\nTests:\n${result.stdout ?? ''}${result.stderr ?? ''}`
      const verificationErrors: string[] = []
      try {
        verificationErrors.push(...verifyGeneratedResults(repo, suite, generation, JSON.parse(await readFile(resultPath, 'utf8'))))
      } catch (error) {
        verificationErrors.push(`Missing or invalid current Vitest JSON report: ${String(error)}`)
      }
      const commandExit = result.error ? 1 : result.status ?? 1
      const exitCode = commandExit || typecheckExit || (verificationErrors.length ? 1 : 0)
      suites.push({ suite, command: ['npm run typecheck', `npm ${command.join(' ')}`, `cwd=${suite}`], exit_code: exitCode,
        output: `${output}\n${verificationErrors.join('\n')}`.slice(-8_000), verification_errors: verificationErrors, typecheck_exit_code: typecheckExit })
      process.stdout.write(`\n--- ${suite} verification (${exitCode === 0 ? 'passed' : 'failed'}) ---\n${output}\n${verificationErrors.join('\n')}\n`)
      if (result.error) console.error(result.error)
      if (typecheck.error) console.error(typecheck.error)
    }
    const report = { generated_at: new Date().toISOString(), passed: suites.every(suite => suite.exit_code === 0), suites }
    const reportPath = path.join(repo, '.vitest-agent/run-report.json')
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tests_passed=${report.passed}\n`)
    if (!report.passed) process.exitCode = 1
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

main().catch(error => { console.error('Unable to run generated-test verification:', error); process.exitCode = 1 })
