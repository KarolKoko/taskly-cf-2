# Taskly App Node

## Setup

```sh
cp .env.example .env
```

## Docker

```sh
docker compose up --build -d --wait
```

Application: http://localhost:8080. API: http://localhost:8000/docs.

```sh
docker compose down
```

## Frontend

React + TypeScript + Vite. Tests: Vitest + React Testing Library.

Installation:

```sh
cd frontend
npm ci
```

Development — http://localhost:5173:

```sh
npm run dev
```

Storybook — http://localhost:6006:

```sh
npm run storybook
```

Tests:

```sh
npm test
```

Coverage — `frontend/coverage/index.html`:

```sh
npm run test:coverage
```

## Backend

Node.js + TypeScript + Express. Database: PostgreSQL + Prisma ORM. Tests: Vitest + Supertest.

Requires Node.js >=22.12 and PostgreSQL.

Installation:

```sh
cd backend
npm ci
```

Database — run from the repository root:

```sh
docker compose up -d --wait postgres
```

Development — http://localhost:8000/docs (from `backend`):

```sh
npm run dev
```

Production:

```sh
npm run build
npm start
```

### Database (Prisma ORM)

Schema — `backend/prisma/schema.prisma`. Connection — root `.env`.

Validate schema:

```sh
npm run db:validate
```

Generate client — also runs during installation and build:

```sh
npm run db:generate
```

Database browser:

```sh
npm run db:studio
```

Schema migrations are managed separately; generating the client does not update the database.

### Tests and coverage

Type check:

```sh
npm run typecheck
```

Tests:

```sh
npm test
```

Watch mode:

```sh
npm run test:watch
```

Coverage — `backend/coverage/index.html`:

```sh
npm run test:coverage
```

## PR test generator

The root package contains the PR test-plan generator and test runner. It reads `agents/` instructions and the structured Vitest reference data in `scripts/scrapper/data/`. The reusable agent skills are under `agents/unit-test-agent/skills/`.

```sh
npm ci
npm run typecheck
npm run generate:tests -- --diff path/to/change.diff --docs scripts/scrapper/data
npm run test:generated -- path/to/repository
npm test
```

### One-off baseline coverage run (`COVER_RUN`)

With `COVER_RUN=true` the generator ignores PR diffs and instead plans tests for every frontend/backend source file that no test imports (stories, styles, types, barrels, generated code and test setup are skipped). Agent-generated tests are regenerated; developer-authored tests are never touched. Needs `OPENAI_API_KEY`.

```sh
npm run cover:run:plan   # plan only, no test files written
npm run cover:run        # write tests (COVER_RUN_MAX_FILES caps the files per run, default 40)
npm run test:generated   # run both suites, then review and commit the new tests
```

The GitHub Actions PR workflow runs baseline checks for pull requests and generates tests only for same-repository pull requests. Configure an `OPENAI_API_KEY` secret in the `test-generation` GitHub environment and require approval for that environment. The generator and file appliers run from the trusted base revision; generated tests are run in a separate job without secrets or a write-capable token. When both suites pass, a separate publisher job commits only generated test files to the PR branch as `github-actions[bot]`; repository settings and branch protection must allow that bot to push. If generated tests fail, the workflow creates or updates a GitHub issue and reports it in the PR comment. Fork pull requests receive baseline checks but do not run secret-backed generation or automatic publishing.
