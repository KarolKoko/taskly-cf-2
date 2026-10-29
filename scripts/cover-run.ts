// One-off baseline coverage run: plans and renders tests for every source file that has none.
// Equivalent to `COVER_RUN=true tsx generator/index.ts`; extra flags (e.g. --plan-only) pass through.
process.env.COVER_RUN = 'true'
import('../generator/index.js').catch(error => { console.error(error); process.exitCode = 1 })
