import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

interface SuiteResult {
  suite: string
  command: string[]
  exit_code: number
  output: string
}

async function main() {
  const repo = path.resolve(process.argv[2] ?? process.cwd())
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const env = { ...process.env }
  delete env.OPENAI_API_KEY
  delete env.GITHUB_TOKEN
  delete env.GH_TOKEN
  delete env.GITHUB_OUTPUT
  delete env.GITHUB_ENV
  delete env.GITHUB_PATH
  delete env.GITHUB_STEP_SUMMARY
  const suites: SuiteResult[] = []

  for (const suite of ['frontend', 'backend']) {
    const command = ['test']
    const result = spawnSync(npm, command, {
      cwd: path.join(repo, suite),
      encoding: 'utf8',
      env,
      shell: process.platform === 'win32',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    const exitCode = result.error ? 1 : result.status ?? 1
    suites.push({
      suite,
      command: [`npm ${command.join(' ')}`, `cwd=${suite}`],
      exit_code: exitCode,
      output: output.slice(-8_000),
    })
    process.stdout.write(`\n--- ${suite} Vitest (${exitCode === 0 ? 'passed' : 'failed'}) ---\n${output}`)
    if (result.error) console.error(`${suite} test runner error:`, result.error)
  }

  const report = {
    generated_at: new Date().toISOString(),
    passed: suites.every(suite => suite.exit_code === 0),
    suites,
  }
  const reportPath = path.join(repo, '.vitest-agent', 'run-report.json')
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `tests_passed=${report.passed}\n`)
  }
  if (!report.passed) process.exitCode = 1
}

main().catch(error => {
  console.error('Unable to run generated-test verification:', error)
  process.exitCode = 1
})
