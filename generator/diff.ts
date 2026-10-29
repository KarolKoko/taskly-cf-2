import path from 'node:path'

export interface ChangedFile { file: string; patch: string; addedLines: number[] }
export function parseUnifiedDiff(diff: string): ChangedFile[] {
  const result: ChangedFile[] = []
  let current: ChangedFile | undefined
  let lineNo = 0
  for (const line of diff.split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/)
    if (header) {
      current = { file: header[2], patch: '', addedLines: [] }
      result.push(current)
      continue
    }
    // Supports a single-file patch without a diff --git header.
    const plus = line.match(/^\+\+\+ b\/(.+)$/)
    if (plus && !current) { current = { file: plus[1], patch: '', addedLines: [] }; result.push(current) }
    if (!current) continue
    current.patch += line + '\n'
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) lineNo = Number(hunk[1])
    else if (line.startsWith('+') && !line.startsWith('+++')) { current.addedLines.push(lineNo); lineNo++ }
    else if (line.startsWith(' ') ) lineNo++
  }
  return result.filter(f => !f.patch.includes('+++ /dev/null') && /\.(tsx?|jsx?)$/.test(f.file) && !/\.(test|spec)\.[jt]sx?$/.test(f.file) && !f.file.endsWith('.d.ts') && !path.isAbsolute(f.file) && !f.file.split('/').includes('..'))
}

export async function fetchGithubPrDiff(owner: string, repo: string, pr: number, token: string): Promise<string> {
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || !Number.isSafeInteger(pr) || pr < 1) throw new Error('Invalid GitHub repository or PR')
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr}`, {headers: {
    Accept: 'application/vnd.github.v3.diff', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vitest-test-generator',
  }, signal: AbortSignal.timeout(30_000)})
  if (!response.ok) throw new Error(`GitHub diff HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`)
  return response.text()
}
