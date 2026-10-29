---
name: plan-tests
description: "Use after PR analysis to produce a strict structured Vitest test plan with evidence-based business cases, expected outcomes, and edge cases without guessing."
---

# Plan Evidence-Based Tests

## Goal

Produce a schema-valid JSON plan, never test source code. The schema in `generator/schema.ts` is authoritative.

## Procedure

1. Use only `supported` behaviors and evidence from the PR analysis, full source, existing tests, and supplied Vitest documentation.
2. Select exported functions/classes that can be invoked with the declared test harness. Do not invent exports or call signatures.
3. Translate each supported business rule into a deterministic test case whose inputs and expected result follow from the implementation.
4. Include an edge case only when the code establishes its handling (for example empty title, invalid due date, completed overdue task, priority tie-break, or failed notification dependency).
5. Every case must include:
   - a concise behavior-focused name;
   - a `rationale` stating what business rule it verifies and why this scenario matters;
   - the exact source line(s) supporting the assertion;
   - at least one matcher;
   - realistic, type-compatible inputs and expected values;
   - one category: `happy_path`, `edge_case`, `error`, or `regression`.
6. Consult the supplied Vitest API reference for every selected Vitest API/matcher. Do not substitute Jest APIs.
7. Leave `cases` and `component_cases` empty when evidence or the renderer is insufficient; report why in the analysis output instead of fabricating tests.
7a. Route by kind: plain functions and classes go in `cases`; React components (JSX, hooks, styled-components) go only in `component_cases`, described as props, spy callbacks, user steps, and element/spy assertions that the source proves. Never put a component in `cases`.
8. Avoid duplicate cases and low-value permutations. Prefer a small set of distinct cases that cover changed rules and consequential edge/error paths; do not request repeated model passes just to increase case count.
9. Fill `business_behaviors` only with evidence-backed observable behavior, and put unresolved behavior in `unknowns`.
10. Return JSON matching `generator/schema.ts` exactly, including each case's `business_rule` and `rationale`. Do not add fields, prose, markdown fences, source code, or instructions.
