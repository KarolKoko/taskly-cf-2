## Solution for taskly-cf

Presentation of a modular AI agent for automating unit tests for the TO-DO app. Due to the limited time I had available to complete this task, I decided to use AI development tools to generate the code. However, I believe this was the right decision, as Agentic Engineering is already sufficiently advanced to dramatically speed up the work.

### The main technical decisions and their rationale:
I decided to implement my own Agentic Workflow, which runs in GH Actions. My motivation was security and limiting the LLM’s role in direct interaction with the code. The generated unit test code is no longer suitable for retesting, so the LLM acts as an advisor. The module for generating unit test code is natively implemented in the application in the /generator directory. The uniqueness of this solution lies in the separation of the roles of the code generator and the LLM advisor. An additional advantage of this approach is the reduction in credit consumption and, consequently, the costs of maintaining the repository. As for the instructions for the agent, they have been placed in the agents directory in accordance with best practices. I chose gpt-5.5 as the advisory model, but it is not strictly defined which model must be used for this task. An unquestionable advantage of the solution I’ve implemented is the ability to modify test patterns without changing the agents’ instructions. The generator interprets the LLM’s response and uses it to write tests. This is controlled by the developer, so the result will always stay within the specified parameters. The main source for the LLM is scraped vitest API documentation—this is independent of any remote source, and additionally, the JSON documentation remains unchanged until someone updates it. The workflow pushes the newly created tests to the repository and then runs them. In the event of an error, a new issue is added to GitHub.

### How to run the PR workflow and which prerequisites must be met:
The workflow begins with a pull request. The code is then compared, and the pipeline is triggered. First and foremost, if we want to use the generator, we need an OpenAI key. Before the tests are actually generated, a pre-check is run to validate the syntax and .env files. The flow is as follows:
```text
PR → baseline type checks and tests
   → diff + repository context + skills + Vitest reference
   → validated JSON plan → rendered tests
   → application type checks + both Vitest suites
   → verification that every planned generated case executed and passed
   → PASS: publish test commits / FAIL: create or update an issue
   → final PR comment and required result check
```

### an example run, including the agent's decisions, the skills used, and the test execution results:
https://youtu.be/FMTqiUlkh-E

### Custom agent and reusable skills

The agent's main instructions are in `agents/unit-tests.md`. Reusable skills are defined under `agents/unit-test-agent/skills/`:

| Skill | Responsibility |
| --- | --- |
| `analyze-pr` | Identify changed behavior and distinguish evidence from unknowns. |
| `plan-tests` | Select useful cases, expected outcomes and source evidence. |
| `generate-tests` | Apply the plan schema, renderer and file-preservation rules. |
| `verify-tests` | Define verification, failure handling and publication requirements. |
| `report-results` | Define factual progress updates and final PR reporting. |

`generator/context.ts` loads these instructions, and `generator/model.ts` includes them in the planning request. They are reusable guidance, not five independently executed model agents. `generator/index.ts` coordinates planning and rendering; trusted scripts and GitHub Actions implement verification and reporting.

### Your assumptions:
The agent is capable of generating tests and running them on its own, but at this scale of the application, they don’t play such a significant role. It results in quite a lot of code, and it’s easy to get lost in it sometimes. Undoubtedly, testing is an integral part of software development. If we can combine it with automated and controlled test generation, that’s a great option. For me, the key aspect of this task was securing and encapsulating the LLM within manually written forms. Additionally, I focused on limiting AI credit consumption. It was a great challenge that allowed me to gain new experience—and I really enjoy that, because every opportunity for growth is priceless.

### The solution's limitations:
The renderer supports a fixed set of function, constructor, mock and React interaction patterns. Complex hooks, class methods, rich runtime values and cross-module behavior may need new templates or manual tests. Context discovery follows direct relative imports; it does not resolve every alias or recursively reconstruct the application. Files and context can be excluded or truncated by explicit limits.


### What you would extend or change for a production version:
- Add PR rules and policies for teamwork so that members can be added freely
- Expand test templates
- A script to track LLM token usage
- Expanding comments to include proposed solutions for specific bugs
- Adding end-to-end tests—i.e., an agent that would track the flow of, for example, adding a task—and integrated tests (where one action results from another)
- Expansion of skills and instructions for the agent
- Deployment flow
- For a team, roles such as code reviewer, dev, and CEO can be added and assigned to specific functionalities (e.g., microservices)
- Addition of a retry loop that attempts to execute the task again after a failed test.
