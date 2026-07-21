# Lab-Standard-Initiative — Capabilities Guide

The capability stack wired into this repo. Stack: pnpm workspaces · Node 24 ·
TypeScript 5.9 · Express 5 API · React 19 + Vite storefront · Drizzle/pg ·
OpenAPI 3.1 codegen. `/start-project` copied this from the global template and
tailored it to this repo.

Three layers, all global — `/start-project` wires *this repo* into them:

1. **Superpowers** — discipline skills (user scope)
2. **GSD** — plan → execute pipeline (`gsd:*` plugin skills)
3. **Agent framework** — parallel subagents and swarms (built-in)

---

## 1. Superpowers — discipline skills

Process skills that govern *how* work gets done. Invoke via the `Skill` tool;
they override default behavior but never override user instructions.

| Skill | Use when |
|---|---|
| `superpowers:brainstorming` | Before any creative/build work — explore intent before implementing. |
| `superpowers:writing-plans` | Turn a spec into a written, multi-step plan before touching code. |
| `superpowers:executing-plans` | Execute a written plan with review checkpoints. |
| `superpowers:subagent-driven-development` | Execute plan tasks via subagents in the current session. |
| `superpowers:test-driven-development` | Write tests before implementation (rigid — follow exactly). |
| `superpowers:systematic-debugging` | Any bug or unexpected behavior, before proposing a fix. |
| `superpowers:verification-before-completion` | Before claiming work done — evidence before assertions. |
| `superpowers:dispatching-parallel-agents` | 2+ independent tasks with no shared state. |
| `superpowers:requesting-code-review` / `receiving-code-review` | Review handoffs. |
| `superpowers:using-git-worktrees` | Isolated parallel work on the same repo. |
| `superpowers:finishing-a-development-branch` | Implementation done — decide merge / PR / cleanup. |
| `superpowers:writing-skills` | Create or edit skills. |

Process skills go first: "build X" → brainstorm then implement; "fix bug" →
debug then patch.

## 2. GSD — plan/execute pipeline

The `gsd:*` plugin skills drive a project from kickoff through shipped phases.
Lifecycle commands (run `/gsd:help` for the full list):

```text
/gsd:new-project       # greenfield: deep context → PROJECT.md → roadmap
/gsd:map-codebase      # existing repo: parallel mappers → .planning/codebase/
/gsd:plan-phase 1      # plan a phase before executing
/gsd:execute-phase 1   # execute a phase, wave-based parallel
/gsd:progress          # anytime: where am I, what's next
/gsd:debug             # systematic debugging with persistent state
/gsd:review            # review work
/gsd:ship              # ship a completed phase
```

Planning artifacts live under `.planning/` (roadmap, phases, codebase maps,
research). A repo with `.planning/` / `ROADMAP.md` / `PROJECT.md` is already
grounded — use `/gsd:progress`, not `/start-project`.

Supporting agents (spawned automatically by GSD commands): `gsd-codebase-mapper`,
`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-debugger`, and others.

## 3. Agent framework — parallel subagents & swarms

Built-in concurrency for fan-out work:

- **`Explore`** — read-only search agent. Fan out one per top-level area to map a
  repo fast; returns conclusions, not file dumps.
- **`Plan`** — architect agent for implementation plans.
- **`general-purpose`** — multi-step research and search.
- **Workflow tool** — deterministic multi-agent orchestration for large swarms
  ("use a workflow"): pipelines, fan-out/verify, loop-until-dry.

Discipline for hand-rolled parallel work: `superpowers:dispatching-parallel-agents`.
For dozens of agents with structured phases, reach for the Workflow tool.

---

## This repo at a glance

Existing TypeScript monorepo — workspaces under `artifacts/*`, `lib/*`, `scripts`.
Root strategy docs (`SPRINT-PLAN-CRITICAL-BLOCKERS.md`, `PRODUCT-GAP-AUDIT.md`,
`OPS-READINESS.md`, `CODE-REVIEW.md`, `TECHNICAL_CONTEXT.md`) and `CLAUDE.md`
already capture much of the context a GSD codebase map would produce. See
`CLAUDE.md` for layout, dev commands, API surface, and gotchas.

## Recommended kickoff sequence

```text
/start-project          # wire this repo into the stack (you are here)
/gsd:map-codebase       # existing repo: build .planning/codebase/ maps
/gsd:plan-phase 1       # plan the first phase
/gsd:execute-phase 1    # execute it
/gsd:progress           # anytime: where am I, what's next
```
