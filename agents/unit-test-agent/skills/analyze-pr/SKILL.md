---
name: analyze-pr
description: "Use when inspecting a pull-request diff to identify changed TypeScript behavior, map it to business rules, and distinguish evidence from unknowns before planning tests."
---

# Analyze a Pull Request

## Goal

Explain the business behavior affected by the diff using repository evidence only. Do not write tests or infer product requirements at this stage.

## Procedure

1. Read the complete diff and the current full source for each changed TypeScript/JavaScript module.
2. Use `repository_context.files` to inspect direct relative dependencies, callers, existing tests and README documentation. Each entry includes its path, relation and bounded source. Check `repository_context.omitted` for missing or truncated evidence; report relevant limitations in `unknowns`. Do not assume omitted context exists or invent its behavior.
3. For each changed behavior, record:
   - source path and changed line numbers;
   - the observable input, state transition, or output;
   - the business rule supported by code or documentation;
   - the evidence path and symbol;
   - uncertainties or missing evidence.
4. For to-do behavior, consider only applicable dimensions evidenced in the code: creation, editing, deletion, completion/status, priority, due dates, filtering/sorting, and notifications. Do not assume a feature exists merely because it appears in the product description.
5. Separate direct evidence from interpretation. If multiple interpretations remain possible, mark the behavior `uncertain` and do not create an assertion for it.
6. Exclude generated files, test files, declarations, and unsupported languages unless the workflow explicitly supports them.

## Output

Return strict JSON for the next planning step:

```json
{
  "changed_behaviors": [
    {
      "source_file": "path/to/module.ts",
      "source_lines": [12, 13],
      "behavior": "Observable behavior, phrased narrowly",
      "evidence": ["path/to/module.ts:12-13", "path/to/caller.ts:40"]
    }
  ],
  "unknowns": []
}
```

Put unresolved or ambiguous behavior in `unknowns` and omit it from `changed_behaviors`. Never fill gaps with conventional or assumed to-do-list behavior.
