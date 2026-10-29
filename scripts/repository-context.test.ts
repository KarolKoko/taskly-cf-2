import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { readRepositoryContext } from '../generator/context.js'

test('includes dependencies, callers, tests and README; excludes unrelated files and external symlinks', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'taskly-context-test-'))
  try {
    await mkdir(path.join(root, 'backend/src'), { recursive: true })
    await mkdir(path.join(root, 'backend/tests'), { recursive: true })
    const source = "import { value } from './dependency.js'; export const result = () => value"
    const files = {
      'backend/src/subject.ts': source,
      'backend/src/dependency.ts': 'export const value = 1',
      'backend/src/caller.ts': "import { result } from './subject.js'; result()",
      'backend/tests/subject.test.ts': "import { result } from '../src/subject.js'; result()",
      'backend/src/unrelated.ts': 'export const unrelated = true',
      'README.md': 'Documented behavior',
    }
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content)
    await symlink('/etc/passwd', path.join(root, 'backend/src/external.ts'))
    const context = await readRepositoryContext(root, 'backend/src/subject.ts', source)
    assert.deepEqual(context.files.map(file => [file.path, file.relation]), [
      ['backend/tests/subject.test.ts', 'test'], ['backend/src/dependency.ts', 'dependency'],
      ['backend/src/caller.ts', 'caller'], ['README.md', 'documentation'],
    ])
    assert.ok(context.omitted.some(item => item.includes('external.ts')))
    await writeFile(path.join(root, 'backend/src/dependency.ts'), 'export const value = 2')
    assert.notDeepEqual(await readRepositoryContext(root, 'backend/src/subject.ts', source), context)
  } finally { await rm(root, { recursive: true, force: true }) }
})
