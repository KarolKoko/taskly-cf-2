import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyGeneratedResults } from './verify-generated-results.js'

const generation = { files: [{ status: 'generated' as const, test_file: 'backend/tests/example.generated.test.ts', cases: [{ name: 'handles input' }] }] }
const report = (status: string, title = 'handles input') => ({ testResults: [{ name: '/repo/backend/tests/example.generated.test.ts', assertionResults: [{ title, status }] }] })

test('accepts the planned case only when the generated file executes and passes', () => {
  assert.deepEqual(verifyGeneratedResults('/repo', 'backend', generation, report('passed')), [])
})
test('rejects omitted files, renamed cases and skipped/todo/failed cases', () => {
  assert.ok(verifyGeneratedResults('/repo', 'backend', generation, { testResults: [] }).length)
  assert.ok(verifyGeneratedResults('/repo', 'backend', generation, report('passed', 'different case')).length)
  for (const status of ['pending', 'skipped', 'todo', 'failed']) {
    assert.ok(verifyGeneratedResults('/repo', 'backend', generation, report(status)).length)
  }
})
test('requires one result for each planned case with a duplicate name', () => {
  const duplicate = { files: [{ ...generation.files[0], cases: [{ name: 'handles input' }, { name: 'handles input' }] }] }
  assert.ok(verifyGeneratedResults('/repo', 'backend', duplicate, report('passed')).length)
})
test('rejects non-discoverable paths and malformed reports', () => {
  assert.ok(verifyGeneratedResults('/repo', 'backend', { files: [{ ...generation.files[0], test_file: 'backend/tests/example.test.generated.ts' }] }, report('passed')).length)
  assert.throws(() => verifyGeneratedResults('/repo', 'backend', generation, {}))
})
