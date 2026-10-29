import path from 'node:path'
import { z } from 'zod'

export const GenerationReport = z.object({ files: z.array(z.object({
  status: z.enum(['generated', 'plan_only', 'no_testable_cases']),
  test_file: z.string().nullable(),
  cases: z.array(z.object({ name: z.string().min(1) })),
})) })

const VitestReport = z.object({ testResults: z.array(z.object({
  name: z.string(),
  assertionResults: z.array(z.object({ title: z.string(), status: z.string() })),
})) })

/** Every planned case must be discovered and pass; skipped/todo cases do not count. */
export function verifyGeneratedResults(repo: string, suite: string, generation: z.infer<typeof GenerationReport>, raw: unknown): string[] {
  const report = VitestReport.parse(raw)
  const errors: string[] = []
  for (const file of generation.files.filter(file => file.status === 'generated')) {
    if (!file.test_file) { errors.push('Generated entry has no test file'); continue }
    const normalized = path.posix.normalize(file.test_file)
    if (!/^(frontend\/src\/|backend\/tests\/).+\.test\.[jt]sx?$/.test(normalized) || normalized !== file.test_file) {
      errors.push(`Unsupported generated test path: ${file.test_file}`); continue
    }
    if (!normalized.startsWith(suite + '/')) continue
    if (!file.cases.length) { errors.push(`No planned cases: ${normalized}`); continue }
    const target = path.resolve(repo, normalized)
    const results = report.testResults.filter(result => path.resolve(result.name) === target)
    if (results.length !== 1) { errors.push(`Generated file not uniquely executed: ${normalized}`); continue }
    const remaining = [...results[0].assertionResults]
    for (const planned of file.cases) {
      const index = remaining.findIndex(result => result.title === planned.name)
      if (index < 0) { errors.push(`Planned case not executed: ${normalized}: ${planned.name}`); continue }
      const [actual] = remaining.splice(index, 1)
      if (actual.status !== 'passed') errors.push(`Planned case ${actual.status}: ${normalized}: ${planned.name}`)
    }
  }
  return errors
}
