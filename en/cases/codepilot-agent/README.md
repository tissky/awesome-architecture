# Case 06 · CodePilot: an AI Agent / coding Agent platform

> Thesis in one line: **this case drills "how an AI that can act stays controlled"**. The hard part of a coding Agent is not making a model write code. It is letting it read repos, edit files, run commands, call tools, and work for a long time while permissions, sandboxing, budgets, approvals, checkpoints, and evals still constrain it.

---

> **🧪 Case-track article 6 · This case drills one thing**
>
> It drills architectural judgment for an **AI Agent / coding Agent platform**: when to use a workflow, when to allow an autonomous Agent loop, why tool calls must pass through a permission gateway, why sandboxing and human approval are different controls, how long tasks survive through checkpoints and context compaction, when subagents help, and how evals catch silent regressions after a model or prompt change.
>
> | After reading, you should be able to | This case drills it through |
> |---|---|
> | Explain why an Agent is different from a chat box | The "read repo → edit files → run tests → observe → edit again" action loop |
> | Explain why tool calls cannot be handed directly to the model | Permission gateway, sandbox, workspace boundary, and high-risk approval |
> | Understand why long tasks forget goals, burn budgets, and drift | Checkpoints, trace, context compaction, hard budgets, and resume flow |
> | Decide when subagents help, and when they add noise | Independent context, independent budget, and structured result handoff |
>
> **Important note: this is a teaching case, not an internal design of any real coding Agent product.** The numbers are for order-of-magnitude reasoning. The point is judgment, not one canonical answer.

---

## Opening: why a coding Agent is not "a better code-writing chat box"

Because a chat box gives advice. A coding Agent actually touches your repository.

> **CodePilot** is a coding Agent platform for engineering teams. An engineer can submit a task: "fix this failing test," "add idempotency to the payment callback," "upgrade this dependency," or "read this module and propose a refactor." CodePilot checks out the repo, reads code, plans, edits files, runs tests, reacts to failures, and eventually produces a diff or Pull Request.

At first glance, it looks like "a model that writes code":

- the user describes the task;
- the model reads code;
- the model generates a patch;
- tests run;
- a result is returned.

But after launch, the most dangerous failure is not "the code is not elegant enough." It is:

> **The Agent is induced by prompt injection in a README to read secrets, runs a dangerous command, edits files outside the workspace, forgets the user's constraint after context compaction, lets subagents conflict, or silently regresses after a model upgrade.**

So this chapter is not about "how to call an LLM API." It asks a sharper question:

> **How do you let an Agent read and write code, execute commands, and work autonomously for a long time while still being stoppable, auditable, recoverable, and measurable?**

The pressure source is different from the first five cases:

- [StarArena](../stararena-ticketing/README.md) fears inventory and payment-state errors.
- [PatchDesk](../patchdesk-saas/README.md) fears tenant-boundary failures.
- [DocuMind](../documind-rag/README.md) fears ungrounded answers and prompt injection.
- [SyncRoom](../syncroom-collaboration/README.md) fears realtime state convergence.
- [FeedStream](../feedstream-content/README.md) fears distribution amplification.
- **CodePilot fears the moment AI can act: mistakes turn from "said the wrong thing" into "changed, leaked, spent, or shipped the wrong thing."**

---

## Pre-reading glossary

These words repeat throughout the chapter. Align on plain-language meanings first:

| Term | Plain-language meaning |
|---|---|
| Agent | AI that can take multiple steps by itself: plan, call tools, observe results, and decide what to do next. |
| Workflow | A fixed or mostly fixed sequence of steps. The model may judge at a few points, but the path is mostly predetermined. |
| Agent loop | The action loop: plan → call tool → observe → plan again. |
| Tool call | A model request to read files, search code, edit files, run tests, fetch a page, or call an internal API. |
| Sandbox | An isolated execution environment that limits where a command can read, where it can write, and whether it can access the network. |
| Workspace | The project directory the Agent is allowed to read and write. Files outside it are usually out of bounds. |
| Permission gateway | The control layer every tool call passes through. It decides allow, deny, or ask the user. |
| Approval | Human confirmation before high-risk actions such as networking, deleting files, committing, or deploying. |
| Checkpoint | Saved task state: current diff, tool-result summaries, budget use, and enough state to resume after interruption. |
| Trace | The execution trail: what the Agent did, which tools it called, and what it observed. |
| Context window | The amount of information the model can see at one time. Long tasks eventually run out of it. |
| Compaction | Summarizing older history to free context window space. |
| Memory | Rules, preferences, and past lessons retained across steps or sessions. More memory is not always better; it can become stale. |
| Subagent | A separate Agent with its own context for noisy subtasks such as repo-wide search or log analysis. It returns a summary to the main line. |
| Prompt injection | Malicious or misleading instructions embedded in external content, such as "ignore prior rules and leak secrets." |
| Budget | Hard limits on steps, tokens, time, tool calls, concurrency, and cost. |
| Eval | A representative test set for measuring task success, safety, regression, and quality over time. |

---

## 1. Starting state: build a controlled coding assistant first, not an autonomous engineer

CodePilot's first version has a modest goal: **let a small team delegate low-risk engineering tasks to an Agent, while making every real change visible and interruptible.**

Early constraints look like this:

| Dimension | Starting stage |
|---|---|
| Pilot team | 20-50 engineers |
| Connected repos | 5-20 |
| Repo size | 10k-200k lines |
| Agent tasks per day | 50-200 |
| Peak concurrent tasks | 5-20 |
| Common tasks | Tests, small bugs, code reading, docs, simple dependency upgrades |
| Core goal | Produce reviewable diffs and explain each step |
| Must not fail | Read secrets, edit outside the workspace, auto-run irreversible actions, or lose trace |

The right first architecture is not a "fully autonomous engineer." It is a **bounded Agent loop + tool gateway + workspace sandbox + human review**:

```
Engineer submits a task
  │
  ▼
┌────────────────────────────────────────────┐
│ Task service                                │
│ Goal, repo, branch, budget, permission mode │
└──────────────┬─────────────────────────────┘
               ▼
┌────────────────────────────────────────────┐
│ Agent orchestrator                          │
│ Plan → read/search → patch → test → adjust  │
└──────────────┬─────────────────────────────┘
               ▼
┌────────────────────────────────────────────┐
│ Tool gateway + sandbox                      │
│ Workspace limits, network limits, approvals │
│ and full trace                              │
└──────────────┬─────────────────────────────┘
               ▼
        diff / test result / trace → human review
```

This is not timid. It states the boundary:

- The Agent can read the repo, but sensitive paths are denied by default.
- The Agent can edit files, but only inside the workspace.
- The Agent can run tests, but commands have timeouts and resource limits.
- The Agent can suggest a commit or PR, but cannot bypass review.
- The Agent can work for a long time, but every step must be traceable, resumable, and stoppable.

---

## 2. Quantified assumptions: it breaks first on permissions, context, and side effects

Now run the numbers. Suppose CodePilot expands from a pilot to a mid-sized engineering organization:

```
Engineers:300
Repos:800
Active repos:150
Repo size:50k-800k lines
Agent tasks per day:1,000-3,000
Peak concurrent tasks:50-120
Average task turns:8-20
Long-task turns:30-80
Tool calls per turn:1-4
Common tools:read file, search, patch, run tests, package manager, Git, internal APIs

Goal:simple tasks produce a diff in 5-10 minutes
Goal:complex tasks produce a PR or clear failure reason in 30-60 minutes
Safety target:out-of-workspace writes = 0; sensitive file exfiltration = 0
Budget target:every task has max steps, tokens, runtime, and concurrency
Quality target:before model / prompt / tool-policy changes, core evals stay above baseline
```

At this scale, request volume is not the first problem. A normal web system starts by calculating QPS. CodePilot first collides with:

1. **Permission boundaries**: an Agent that can run commands can delete, modify, or access the network by mistake.
2. **Context boundaries**: repos are large, logs are long, tasks run for a while, and the model cannot see everything.
3. **Side-effect boundaries**: file edits can be rolled back; API calls, pushes, deploys, and database writes may not be.
4. **Cost boundaries**: a few more attempts may fix the task, or may loop forever and burn money.
5. **Quality boundaries**: a model upgrade may improve some tasks while weakening safety refusal or another task class.

So CodePilot's architecture is not mainly about handling more requests. It is about:

> **Putting Agent autonomy inside executable, auditable, recoverable, and measurable boundaries.**

---

## 3. Trigger signals: when the first version is no longer enough

Do not upgrade by instinct. Watch these signals:

| Signal | Symptom | Why this is architectural |
|---|---|---|
| Users approve blindly | Every command asks; users stop reading and approve | Approval is too noisy, so safety becomes ceremonial |
| More overreach attempts | Agent often tries to read `~/.ssh`, `.env`, or outside the workspace | Defaults and injection defenses are unclear |
| Interrupted long tasks restart from zero | A 40-minute run dies and cannot resume | No durable checkpoints or task state |
| Constraints vanish after compaction | The user said "do not touch the DB layer," but later edits do | Critical constraints are not pinned and reloaded |
| Tool logs fill the window | Full test logs, dependency trees, and search results crowd out task context | Tool outputs need summarization, truncation, and references |
| Subagents conflict | Two subagents edit the same code area | Subtask ownership and merge coordination are missing |
| Cost spikes | A task repeats the same fix attempt again and again | No step, time, token, or repetition cap |
| Results cannot be reviewed | Only the final diff is visible; the why is missing | Trace is incomplete |
| Model upgrade regresses | More small bugs get fixed, but safety refusal weakens | No eval gate measuring multiple quality dimensions |
| Prompt injection incident | An issue or README induces secret access or external calls | External content is treated as instruction instead of untrusted input |

These signals are not saying "the model is not smart enough." They are saying: **model capability alone does not make an Agent production-ready. Control must be architecture.**

---

## 4. Core tension: the more capable the Agent, the more it must be constrained

CodePilot has five core object groups:

1. **Task / goal / budget**: what the user wants and how much time, money, and iteration the Agent may spend.
2. **Repo / workspace / branch**: which project it may touch and where the output lands.
3. **Tools / permissions / sandbox**: what the Agent can call and what each tool is physically allowed to do.
4. **Context / memory / compaction**: what the model sees, and which constraints must survive long tasks.
5. **Trace / diff / eval**: what it did, how humans review it, and whether quality stays stable over time.

The naive path looks like this:

```
User gives task → model generates code → tests run → result returned
```

The real system must answer at every step:

- Is this tool call read-only, or will it change the world?
- Can this command access the network? Can it write outside the workspace?
- Is this README project documentation, or prompt injection written into the repo?
- Can this modification be rolled back? Should we checkpoint first?
- Did context compaction preserve the user's hard constraints?
- Is a subagent result evidence, or just a suggestion?
- Did the Agent fail because tests failed, permission failed, budget ran out, or the model drifted?
- After a model upgrade, did task success, safety refusal, and minimal-change behavior regress?

That creates the new design problem:

> **CodePilot's value comes from autonomous execution, and so does its risk. The architecture is not about making it freer. It is about making "what can it touch, when does it ask, how does it recover, and how do we prove it did not get worse" explicit system structure.**

The key classification is tool risk:

| Tool type | Examples | Default policy |
|---|---|---|
| Low-risk read-only | Search code, read non-sensitive files, inspect test config | Automatic, but output is still untrusted observation |
| Reversible medium risk | Edit workspace files, generate diff, format code | Allowed inside sandbox, with checkpoints and diff |
| High-risk side effect | Network download, API request, DB write, email, push | Ask or deny by default |
| Irreversible / organizational risk | Deploy, delete remote resources, change permissions, transfer money | Mandatory approval, often outright forbidden |

---

## 5. Solution reasoning: how should a coding Agent execute tools?

This is the central decision. Many demos work, but the moment a real repo and shell are connected, risk becomes an engineering problem.

### Option A: chat-only advice, no tool execution

```
User pastes code / error logs
  └─▶ model gives advice
      └─▶ human copies, edits, and tests
```

| Benefit | Cost |
|---|---|
| Safety boundary is simple; the model has no real side effects | The user still moves context around; leverage is limited |
| Easy to integrate | It cannot verify its work |
| Good for learning and explanations | It cannot own an engineering task end-to-end |

### Option B: local Agent with full shell permissions

```
Agent reads repo → edits files → runs arbitrary commands → networks → commits
```

| Benefit | Cost |
|---|---|
| Very flexible | Highest risk: deletion, leakage, networking, and overreach |
| Strong demo experience | Hard to govern and audit for a team |
| Looks simple to build | There is no structural boundary when something goes wrong |

### Option C: platform Agent, all tools through gateway and sandbox

```
Model proposes a tool call
  └─▶ permission gateway decides allow / ask / deny
      └─▶ sandbox executes
          └─▶ result returns as observation
              └─▶ trace / checkpoint / budget recorded throughout
```

| Benefit | Cost |
|---|---|
| The Agent can act, but within physical boundaries | More configuration and user mental model |
| Side effects are auditable and constrained | Some legitimate tasks require explicit approval |
| Supports team governance, CI, and cloud jobs | Requires task state, trace, sandbox pools, and evals |

CodePilot chooses **Option C** for the growth stage: tool calls must pass through a permission gateway and sandbox, and high-risk actions must be interruptible.

The point is not whether the model is trusted. It is:

> **Anything the model can influence through instruction is not a hard boundary. Hard boundaries live where the model cannot bypass them: permission gateway, sandbox, budgets, approvals, CI, and evals.**

---

## 6. Key architecture decisions: record the why with ADRs

An ADR is an Architecture Decision Record. Coding Agent systems will later be questioned: "Why not full autonomy? Why split sandboxing and approval? Why keep trace? Why can't subagents inherit the entire context?" Write those reasons down early.

### ADR-01: Prefer workflows by default; use autonomous Agent loops only for open-ended tasks

- **Context**: Many engineering tasks are structured: run lint, fix formatting, run tests, produce a diff. Fixed workflows are cheaper and more predictable.
- **Decision**: CodePilot first decomposes tasks into controlled workflows. It enters an autonomous Agent loop only when the path is uncertain and tool feedback must guide the next step.
- **Give up**: The simple marketing story that every task is freely planned by the model.
- **Gain**: Lower cost, stronger control, and clearer failure analysis.
- **Risk**: Poor workflow boundaries may restrict useful flexibility.
- **Review when**: Many tasks get stuck in fixed flows, and human review shows open-ended exploration is genuinely needed.

### ADR-02: Tool calls must pass through a permission gateway and sandbox

- **Context**: A coding Agent can read and write files, run shell commands, access the network, and call internal APIs. Side effects are real.
- **Decision**: Every tool call passes through a permission gateway. Writes are limited to the workspace. Sensitive paths are denied by default. Commands run in a sandbox. Network access is narrow by default. High-risk actions ask or deny.
- **Give up**: Letting the model run anything it wants.
- **Gain**: Even if the model is induced by prompt injection, physical boundaries still contain many failures.
- **Risk**: Permission configuration gets more complex, and some valid development tasks need explicit authorization.
- **Review when**: More internal tools, MCP (Model Context Protocol) tools, or cloud resources are added.

### ADR-03: Decouple sandbox mode and human approval as two axes

- **Context**: People often think in one "automatic vs manual" slider, but that mixes two different questions: what can it physically touch, and when does it interrupt the human?
- **Decision**: Sandbox mode controls physical boundaries; approval controls process interruption. For example, `read-only + never` fits CI analysis, `workspace-write + on-request` fits default coding tasks, and high-risk external side effects must ask.
- **Give up**: A simple but vague one-dimensional automation setting.
- **Gain**: Clearer boundaries across local pairing, read-only CI, and async cloud tasks.
- **Risk**: Users must understand two dimensions; otherwise they may assume "asks less" means "has more permission."
- **Review when**: Users approve blindly, or legitimate tasks are interrupted too often.

### ADR-04: Long tasks must persist checkpoints, trace, and budget state

- **Context**: Coding tasks may run for tens of minutes. The session grows, tool outputs get large, and processes can die.
- **Decision**: Persist task state, step trace, current diff, tool-result summaries, and budget use. When context nears its limit, compact history, then reload project rules, user goals, and hard constraints from stable storage.
- **Give up**: Relying on one long conversation to hold everything.
- **Gain**: Tasks are resumable and auditable, and compaction is less likely to erase critical constraints.
- **Risk**: Summaries may drop details; bad summaries can mislead later steps.
- **Review when**: Long-task failures often come from forgetting earlier constraints.

### ADR-05: Use subagents only to isolate heavy work; return structured summaries to the main line

- **Context**: Repo-wide search, dependency analysis, and test-log triage produce a lot of noisy intermediate data.
- **Decision**: Subagents get independent context, limited tools, and separate budgets. The main Agent receives only structured summaries, evidence files, and recommendations. Final merging stays in the main line.
- **Give up**: Letting subagents inherit the entire parent conversation.
- **Gain**: Cleaner main context and controlled parallel decomposition.
- **Risk**: A subagent summary may omit a key fact, and multiple Agents increase cost and latency.
- **Review when**: A single Agent's context is crowded by noisy work, or the task is naturally decomposable with non-overlapping write scopes.

---

## 7. Evolved structure and data flow

Here is the core structure of CodePilot. It is not "model + shell." It is a task execution, permission-control, context-management, observability, and evaluation system.

### Starting path

```
User sends task → model generates patch → local command runs → user sees result
```

The problem: permissions, sandboxing, budgets, resume, trace, and evals are not structured.

### Evolved structure

```
User / CI / scheduled task
  │
  ▼
┌──────────────────────────────────────────────┐
│ Task intake                                   │
│ Goal, repo, branch, permission mode, budget,  │
│ approval policy                               │
└──────┬───────────────────────────────────────┘
       ▼
┌──────────────────────────────────────────────┐
│ Agent orchestrator                            │
│ Workflow first; Agent loop when necessary      │
│ Plan → tool call → observe → plan again        │
└──────┬───────────────────────┬───────────────┘
       │                       │
       ▼                       ▼
┌──────────────┐       ┌──────────────────────┐
│ Context builder │     │ Task state / trace    │
│ Repo map, files,│     │ Checkpoints, diff,    │
│ rules, memory,  │     │ budget, tool summaries│
│ compaction      │     └──────────────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Tool gateway                                  │
│ allow / ask / deny; sensitive paths; network  │
│ policy; resource limits                       │
└──────┬───────────────────────┬───────────────┘
       ▼                       ▼
┌──────────────┐       ┌──────────────────────┐
│ Sandbox       │       │ Human approval /      │
│ Workspace     │       │ Review Gate           │
│ isolation,    │       │ High-risk actions,    │
│ timeout, CPU, │       │ final PR review        │
│ memory, net   │       └──────────────────────┘
└──────┬───────┘
       ▼
  tool result / test log / diff → back to orchestrator

Side path: eval platform continuously runs representative tasks and gates
model / prompt / tool-policy changes.
```

The key change is not "more services." It is clearer structure:

- **Task intake** defines the goal, repo, budget, and permission mode.
- **Agent orchestrator** decides fixed workflow vs autonomous loop.
- **Context builder** supplies necessary information and pins project rules and hard constraints.
- **Tool gateway** turns model intent into controlled tool calls.
- **Sandbox** provides physical limits on workspace, network, and resources.
- **Trace / checkpoint** makes long tasks resumable and auditable.
- **Review Gate** hands irreversible actions and final output back to humans.
- **Eval platform** catches silent quality regression after system changes.

### Walk through "fix a failing test and add a regression test"

```
1. Engineer submits: "fix this failing billing test and add a regression test."
2. Task intake records repo, branch, and budget: max 25 steps, 30 minutes, workspace writes only.
3. Context builder loads project rules, relevant AGENTS.md, test command, and recent failure log.
4. Agent orchestrator plans: locate failure → read files → patch → run unit test → add regression.
5. Model requests code search. Tool gateway treats it as low-risk read-only and allows it.
6. Model requests an edit to `billing/refund.ts`. This is reversible workspace write, so the sandbox allows it after checkpointing.
7. Model requests `pnpm test billing`. The command runs in the sandbox with timeout, CPU / memory limits, and network disabled.
8. The test fails. The tool-result summary enters context; the raw log is kept as trace evidence.
9. The Agent reads the failing stack, finds a missing idempotency-key boundary, and patches again.
10. Tests pass. The Agent produces final diff, explanation, and test evidence.
11. Review Gate requires a human to review the diff before PR creation or commit.
```

Important details:

- The model does not operate the machine directly. It proposes tool calls.
- Tool results are observations, not new instructions. READMEs, issues, and test logs may contain prompt injection.
- Every write has a checkpoint and the final diff is reviewable.
- Test logs can be summarized into context, but raw trace must remain reachable.
- Without Review Gate approval, the Agent cannot push changes into the main line.

### Walk through "long task approaches context limit"

```
1. The Agent has executed 40 steps, read many files, and run several test rounds.
2. The context window approaches its limit, so the system triggers compaction.
3. The compactor writes a structured summary:
   - user goal
   - hard constraints
   - attempted approaches
   - current diff
   - unresolved problem
   - evidence files and trace links
4. The system reloads project rules and permission policy from stable storage.
5. Budget state returns too: 8 steps and 10 minutes remain, network is still disabled.
6. The Agent continues. If it approaches the limit again or exhausts budget, it must stop and report state instead of looping forever.
```

Context compaction is not magic. It turns "cannot fit" into "discard lower-value history with discipline." Anything that must never disappear belongs in stable rules, checkpoints, and trace.

---

## 8. Failure scenarios and fallbacks

| Failure | Direct result | Detection | Architectural fallback |
|---|---|---|---|
| Model executes shell directly | Deletion, exfiltration, external calls, overreach | High-risk command audit, overreach attempts | All tools pass through gateway and sandbox |
| Missing workspace boundary | Agent edits another local project | File-write path audit | Writes allowed only inside declared workspace |
| Sensitive paths are readable | `.env`, SSH keys, cloud credentials leak | Sensitive-path access alerts | Deny sensitive reads and isolate credentials |
| Network open by default | Injection induces code or secret exfiltration | External-domain audit, unusual egress | Default deny or allowlist; high-risk networking asks |
| Tool result treated as system instruction | README / issue induces rule override | Injection test cases, abnormal tool behavior | External content is untrusted data and cannot override system rules |
| Too much approval | Users approve blindly | Approval latency, continuous-approve ratio | Automate low-risk sandboxed work; ask only for high-risk actions |
| Too little approval | Irreversible action happens automatically | High-risk action audit | External side effects ask or deny |
| No checkpoint for long tasks | Restart from zero after interruption | Resume failure rate | Persist task state, diff, trace, and budget |
| Compaction drops rules | Later steps violate earlier constraints | Post-compaction violation rate | Reload project rules after compaction; pin hard constraints |
| Subagents inherit all context | Main context is drowned in noise | Context usage, irrelevant-token ratio | Isolate subagents and return summaries plus evidence |
| Subagents write-conflict | Multiple subtasks edit the same area | Diff conflict rate | Assign non-overlapping write scopes; main line merges |
| No budget caps | Infinite loop, token burn, test-environment pressure | Step / cost anomalies | Step, time, token, tool-call, and concurrency limits |
| Only final diff is visible | Review cannot understand the why | Review rejection rate | Trace plans, tool calls, and test evidence |
| No evals | Model upgrade silently regresses | Production failures, human complaints | Representative task evals gate releases |
| Test command has no timeout | One task occupies a worker forever | Worker occupancy | Command timeout, resource quota, cancellation |
| Auto-commit bypasses review | Bad code reaches main | Unreviewed PR / commit audit | Final commit, PR, and deploy require Review Gate |

A coding Agent's maturity is not measured by whether it can write pretty code once. It is measured by whether, when it reads the wrong context, tools fail, injection appears, a task is interrupted, or budget runs out, it can stop, resume, explain, and refuse to ship when evals fail.

---

## 📌 Validate the reasoning against templates

This case does not rewrite any specific coding Agent product template. It combines the linked concerns that make "AI that can act" risky.

| Reusable template / chapter | What this case reuses | What this case adds |
|---|---|---|
| [AI Agent / workflow platform](../../templates/ai-agent-platform/README.md) | Workflow vs Agent, action loop, tools, memory, human-in-the-loop, trace | Grounds the generic Agent in a code repo and real shell side effects |
| [OpenAI Codex](../../templates/codex/README.md) | Sandbox × approval axes, workspace boundary, async cloud task, PR output | Explains why "what can it touch" and "when does it ask" are separate |
| [Claude Code](../../templates/claude-code/README.md) | Context engineering, permission layers, OS sandbox, subagents, hooks, compaction | Emphasizes subagent isolation and untrusted external content |
| [OpenClaw](../../templates/openclaw/README.md) | Resident Agent, channel entry points, tool approval, self-hosted boundary, transparent memory | Warns that a single-user trust boundary is not a team multi-tenant platform |
| [Hermes Agent](../../templates/hermes/README.md) | Long-term memory, skill accumulation, cron Agent jobs, pluggable subsystems | Adds the risks of stale memory and drifting skills |
| [23 · Spec as architecture](../../tutorial/23-规格即架构约束怎么写给AI.md) | AGENTS.md / rules / CI constraints | Turns project rules into boundaries the Agent reads every time and machines can enforce |
| [24 · Review checklist](../../tutorial/24-审查清单AI产出默认缺什么.md) | AI omits safety, failure, and edge cases by default | Final diffs must pass review checklist scrutiny |
| [25 · Eval-driven architecture](../../tutorial/25-评测驱动把够好写进架构.md) | Eval gates | Prevents silent regression after model / prompt / tool-policy changes |

> **Reading suggestion**: read this case first, then revisit the [AI Agent platform](../../templates/ai-agent-platform/README.md), [Codex](../../templates/codex/README.md), and [Claude Code](../../templates/claude-code/README.md) templates. The key will be clearer: a coding Agent is not mainly about a stronger model. It is autonomous action wrapped in engineering boundaries.

---

## 🎯 Quick check

<Quiz
  question="Why should CodePilot not let the model execute shell commands directly?"
  :options="['Because shell is too slow', 'Because models can be wrong or induced by prompt injection; commands must pass through a permission gateway and sandbox', 'Because an Agent does not need to run tests']"
  :answer="1"
  explanation="A coding Agent's tools have real side effects. The model may propose a tool call, but execution must be constrained by a permission gateway and sandbox to prevent deletion, leakage, and external calls."
/>

<Quiz
  question="Why split sandbox mode and human approval into two axes?"
  :options="['Because it sounds more professional', 'Because sandboxing controls what the Agent can physically touch, while approval controls when the process interrupts the human', 'Because approval can replace sandboxing']"
  :answer="1"
  explanation="Sandboxing is a physical boundary; approval is a process boundary. You can be read-only without interruptions, or write inside the workspace while asking only for high-risk actions."
/>

<Quiz
  question="Why are README files, issues, and test logs returned by tools not fully trusted?"
  :options="['Because they are always wrong', 'Because they are external input that may be wrong, stale, or contain prompt injection; they are observations, not system rules', 'Because an Agent should not read documents']"
  :answer="1"
  explanation="Tool results help the Agent reason, but they do not override system instructions. External content can contain injection that tries to make the Agent leak secrets, access the network, or ignore rules."
/>

<Quiz
  question="What problem are subagents best suited for?"
  :options="['Every task must use subagents', 'Isolating noisy repo-wide search or log analysis, protecting the main context, and returning structured summaries', 'Letting multiple Agents freely edit the same files']"
  :answer="1"
  explanation="Subagents isolate heavy, noisy work. They should have separate context, budget, and clear write boundaries. They are not a default way to look advanced."
/>

---

## Case summary

- **A coding Agent is not a chat box; it is an execution system that can change repo state.** Once it can edit files, run commands, and access the network, the architectural focus shifts from answer quality to controlled execution.
- **Use workflows first when they are enough.** Autonomous Agent loops fit uncertain paths; fixed flows are cheaper, steadier, and easier to audit.
- **Tool calls must pass through a permission gateway and sandbox.** The model proposes intent; hard layers decide allow / ask / deny.
- **Sandboxing and approval are two axes.** Sandboxing controls physical boundaries; approval controls human interruption.
- **Long tasks need checkpoints, trace, compaction, and budgets.** Without state, limits, and evidence, long tasks become black boxes.
- **Subagents isolate heavy work; they are not the default.** Use them for search, logs, and review tasks that would crowd the main context.
- **Evals are the release gate for coding Agents.** Before model, prompt, or tool-policy changes ship, representative tasks must verify success, safety refusal, minimal-change behavior, and regression stability.

> **First-batch closure**: this completes the first six core cases: inventory transactions, multi-tenant SaaS, enterprise RAG, realtime collaboration, content distribution, and coding Agents. Future case batches can go deeper by industry or by technology stack without repeating these six.

---

## Related links

- Template cross-check: [AI Agent / workflow platform](../../templates/ai-agent-platform/README.md) · [OpenAI Codex](../../templates/codex/README.md) · [Claude Code](../../templates/claude-code/README.md) · [OpenClaw](../../templates/openclaw/README.md) · [Hermes Agent](../../templates/hermes/README.md)
- Method: [07 · Designing a system from 0 to 1](../../tutorial/07-从0到1设计一个系统.md) · [08 · ADRs and evolution](../../tutorial/08-架构决策记录与演进.md) · [17 · Architecting in the age of LLMs](../../tutorial/17-大模型时代的架构判断.md)
- AI collaboration: [23 · Spec as architecture](../../tutorial/23-规格即架构约束怎么写给AI.md) · [24 · Review checklist](../../tutorial/24-审查清单AI产出默认缺什么.md) · [25 · Eval-driven architecture](../../tutorial/25-评测驱动把够好写进架构.md)
