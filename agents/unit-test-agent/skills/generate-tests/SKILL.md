---
name: generate-tests
description: "Use to convert a schema-validated test plan into deterministic Vitest files using the repository renderer, without executing or trusting model-generated source."
---

# Generate Vitest Files

## Procedure

1. Validate the plan against `generator/schema.ts`; reject invalid or extra fields.
2. Confirm every case refers to a visible exported symbol and supported invocation.
3. Use only `generator/render.ts` to turn validated data into TypeScript. Never evaluate, import, or execute model output.
4. Use Vitest imports and documented matchers only. Do not use Jest APIs or arbitrary source fragments.
5. Preserve developer-authored test files. Update only files bearing the generator marker; otherwise write to a distinct generated test file.
6. Keep test paths inside the checked-out repository and ensure the backend test runner discovers backend tests.
7. Record generated test paths and each case's name, rationale, category, and source lines in the generation report.
8. If no supported case can be generated, state that explicitly; do not report a successful test addition.

## Safety

The generated test code is a derived artifact, not trusted input. It must pass the repository test runner before it is committed or pushed.
