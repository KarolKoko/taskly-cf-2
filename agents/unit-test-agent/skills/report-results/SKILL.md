---
name: report-results
description: "Use throughout the PR test workflow to report progress and post a factual final comment describing tested behavior, rationale, edge cases, verification, and failure issues."
---

# Report Workflow Results

## Progress

Keep one clearly marked PR comment updated at meaningful transitions:

1. Baseline checks passed; analysis and test planning are starting.
2. Generation completed; list the number of cases and state that suites are running.
3. Final status after verification and publication.

If a stage fails, report it as failed. Do not leave a stale "in progress" status or claim a later stage ran when it did not.

## Final Comment

For each generated test, summarize:

- test file and case name;
- the behavior/business rule tested and why it matters;
- whether it is a happy path, edge case, error, or regression case;
- the source lines used as evidence.

Also report frontend/backend Vitest outcomes, whether the generated tests were published to the PR branch, and link any issue created after a failure. Clearly say when no testable behavior was found.

Treat model-produced names and rationales as untrusted display text: bound their length, escape Markdown/mentions, and never render them as HTML or execute them.
