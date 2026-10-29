import { z } from 'zod'

// The model returns data, never arbitrary TypeScript source code.
export const JsonValue = z.object({
  kind: z.enum(['json', 'undefined', 'nan', 'infinity', 'negative_infinity']),
  json: z.string(), // valid JSON text if kind=json; empty otherwise
}).strict()
export type Value = z.infer<typeof JsonValue>

export const MockFunction = z.object({
  module_path: z.string(), // relative to source file, e.g. ./repository.js
  export_name: z.string(),
  behavior: z.enum(['return', 'resolve', 'reject', 'throw']),
  value: JsonValue,
}).strict()

export const TestCase = z.object({
  name: z.string(),
  business_rule: z.string().min(1).max(500),
  rationale: z.string().min(1).max(500),
  target_export: z.string(),
  invocation: z.enum(['function', 'constructor']),
  input_data: z.array(JsonValue),
  expected_output: JsonValue,
  async_mode: z.enum(['sync', 'resolves', 'rejects']),
  mock_function: z.array(MockFunction),
  testing_stack: z.array(z.object({
    expected: z.boolean(), // whether the matcher should pass (false means .not)
    matcher: z.enum(['toBe', 'toEqual', 'toStrictEqual', 'toContain', 'toBeTruthy', 'toBeFalsy', 'toBeNull', 'toBeUndefined', 'toHaveLength', 'toThrow']),
    matcher_args: z.array(JsonValue),
  }).strict()),
  category: z.enum(['happy_path', 'edge_case', 'error', 'regression']),
  source_lines: z.array(z.number().int()),
}).strict()

export const TestPlan = z.object({
  source_file: z.string(),
  describe_name: z.string(),
  business_behaviors: z.array(z.object({
    behavior: z.string().min(1).max(600),
    evidence: z.array(z.string().min(1).max(300)).min(1),
  }).strict()),
  unknowns: z.array(z.string().min(1).max(500)),
  cases: z.array(TestCase),
}).strict()
export type GeneratedTestPlan = z.infer<typeof TestPlan>
