---
name: verify-tests
description: "Use after test generation to run frontend and backend Vitest suites, distinguish generated-test failures, and create a GitHub issue when generated tests fail."
---

# Verify Generated Tests

## Procedure

1. Run the frontend and backend test suites from their respective package directories with their existing Vitest scripts.
2. Capture each command, exit code, and a bounded output excerpt in the machine-readable run report.
3. Do not skip the second suite if the first fails.
4. Compare the generated run with the baseline PR checks. Attribute a failure to generated tests only when it occurs in the post-generation run; do not claim causality without evidence.
5. If any post-generation suite fails, mark verification failed and create or update one GitHub issue for the PR. Include the failing suite, exit code, relevant output excerpt, PR link, and workflow run link.
6. If issue creation fails, surface that failure explicitly; never claim an issue exists.
7. Never commit or publish generated tests when post-generation verification fails.

## Security

Run tests without `OPENAI_API_KEY` or a write-capable GitHub token in their environment. Issue creation must occur in a separate trusted workflow step, not in the test process.
