import { copyFile, lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { GENERATED_TEST_FILE_MARKER } from '../generator/render.js'

async function copyTests(sourceRoot: string, repo: string, relative = ''): Promise<number> {
  let copied = 0
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const childRelative = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in generated-test artifact: ${childRelative}`)
    if (entry.isDirectory()) {
      copied += await copyTests(path.join(sourceRoot, entry.name), repo, childRelative)
      continue
    }
    if (!entry.isFile() || !/\.test\.[jt]sx?$/.test(entry.name)) {
      throw new Error(`Unexpected file in generated-test artifact: ${childRelative}`)
    }

    const content = await readFile(path.join(sourceRoot, entry.name), 'utf8')
    if (!content.startsWith(GENERATED_TEST_FILE_MARKER)) {
      throw new Error(`Generated-test marker missing: ${childRelative}`)
    }
    const target = path.resolve(repo, childRelative)
    if (target !== repo && !target.startsWith(repo + path.sep)) {
      throw new Error(`Generated-test path escapes repository: ${childRelative}`)
    }
    let parentPath = path.dirname(target)
    while (true) {
      try {
        const parent = await realpath(parentPath)
        if (parent !== repo && !parent.startsWith(repo + path.sep)) {
          throw new Error(`Generated-test directory resolves outside repository: ${childRelative}`)
        }
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const nextParent = path.dirname(parentPath)
        if (nextParent === parentPath) throw error
        parentPath = nextParent
      }
    }
    await mkdir(path.dirname(target), { recursive: true })
    try {
      const currentInfo = await lstat(target)
      if (!currentInfo.isFile()) throw new Error(`Refusing to overwrite non-file test path: ${childRelative}`)
      const current = await readFile(target, 'utf8')
      if (!current.startsWith(GENERATED_TEST_FILE_MARKER)) {
        throw new Error(`Refusing to overwrite developer-authored test file: ${childRelative}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await copyFile(path.join(sourceRoot, entry.name), target)
    copied++
  }
  return copied
}

async function main() {
  if (!process.argv[2] || !process.argv[3]) {
    throw new Error('Usage: apply-generated-tests <staged-artifact> <repo>')
  }
  const artifact = await realpath(path.resolve(process.argv[2]))
  const repo = await realpath(path.resolve(process.argv[3]))
  let copied = 0
  for (const workspace of ['frontend', 'backend']) {
    const source = path.join(artifact, workspace)
    let exists = false
    try {
      await realpath(source)
      exists = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (exists) copied += await copyTests(source, repo, workspace)
  }
  console.log(`Applied ${copied} generated test file(s)`)
}

main().catch(error => {
  console.error('Unable to apply generated tests:', error)
  process.exitCode = 1
})
