---
name: projekt-workflow
description: >-
  Use when starting or running any software project with a builder agent
  (website, app, tool): sets up and runs the owner's working loop of vision, issues
  with Done-tjek, builder, verify, independent review, publish gate and daily
  triage.
---
# Projekt-workflow (poteto-style)

A reusable loop for building a project with AI agents while the human stays in charge of direction and quality. Written to work for any project.

## Roles
- **Lead (this assistant):** owns the plan, writes issues, is the publish gate, reports to the user in short, skimmable steps.
- **Builder:** a cloud coding agent working in the repo, in /poteto-mode.
- **Verifier:** a project verify skill (one command, exit 0 = pass) that the builder keeps extending.
- **Reviewers:** independent subagents or other models (/interrogate), never the builder reviewing itself.
- **Judge (optional):** a judgment model such as TypeSafe Jev (see the typesafe-ai skill) that picks reviewers and sorts findings. Decisions stay in code.
- **Triage:** a daily routine for new issues and comments.

## Setup (once per project)
0. **Builder contract** at the top of AGENTS.md: JOB, SOURCES, JUDGMENT (what counts as done), OUTPUT, FORBIDDEN. If you can't fill in FORBIDDEN, the role isn't clear yet.
1. **VISION.md** in the repo root: why the project exists, who it's for, 5–10 principles, and "every issue and change is checked against this". Draft it from what the user has said and let the user approve it.
2. **Verify skill** (`/create-verification-skill`): one command that builds the project the way production builds it (clean environment, same dependencies as CI), drives the real UI, and exits 0 or 1. Prove it works by breaking it on purpose, and have 1–2 adversarial subagents try to make it pass when it shouldn't.
3. **Issue templates** with a "Passer det med VISION.md?" checkbox, and an easy "report a bug" link for users.
4. **Rules files** (AGENTS.md, .cursor/rules) pointing to VISION.md and the verify command.
5. **Daily triage routine:** new issues are rated by the judge (spam, label, vision fit, urgency), fixed rules decide what happens, and the user gets a short report. Comment publicly only with the user's standing permission.

## The loop (every change)
1. **Observation → issue.** Use the issue-fra-observation skill: Problem / Forventet / Done-tjek, a label and the vision fit. Define done before building.
2. **Hand to the builder** with the issue numbers and their order. Each commit ends with "Fixes #N" and adds a verify check for its Done-tjek.
   - **Before building each issue, run /blast-radius** on the planned change and note what else it could break and how that was checked.
   - **Run /unslop on any new user-facing text** (UI copy, explanations, meta descriptions) before committing.
   - **Source check before building:** every number taken from an outside source (paper, table, register) is stored with its exact table/row/page, and an independent reviewer checks it against the original before the page is built. Paired figures (e.g. sensitivity and specificity) must come from the same row.
   - **Data invariants in verify:** encode domain rules as checks (e.g. "a label that says one item may only sit next to one item's number", "aliases need a word boundary"), not just "the page renders".
   - **Handoff at the end of every builder run** (kept outside a public repo): TASK, STATUS, OUTPUT, SOURCES, REVIEWS (every finding verbatim, including dropped ones), DONE-EVIDENCE (raw fresh command output per Done-tjek item), DECISIONS, UNCERTAINTIES, DO-NOT-ASSUME. No handoff means not done.
   - **UI issues:** run Impeccable (design skill) audit/critique on the affected pages before the fix, and its polish/harden checks after. Its findings become issues like any other review finding.
3. **Verify** must exit 0. **Judge "done" from evidence, not summaries:** the judge (yes/no per Done-tjek item) reads only the fresh command output in DONE-EVIDENCE; ≥0.7 is met, 0.3–0.7 means ask for evidence, under 0.3 is not shown.
4. **Pick reviewers with the judge.** The judge answers yes/no probabilities for the diff (touches data? UI? security? CI?) plus a risk score. Rules in code pick the reviewer focuses (each area ≥ 0.5 gets a reviewer, and an identity-leak check always runs) and the number of models (2, or 3 when risk ≥ 1.2 on a 0–2 scale). Without a judge, use at least 2 reviewers with different focus.
5. **Independent review** by those reviewers, on different models where possible. The builder keeps a finding only if it can reproduce it. A data/statistics reviewer is mandatory whenever a diff touches numbers, data or calculations, however small.
6. **Sort findings with the judge.** For each finding, the judge rates whether it is concrete (names a mechanism visible in the code) or speculative, and how severe it is. Rules: concrete ≥ 0.6 and severity ≥ 0.5 become an issue; 0.3–0.6 are rechecked; under 0.3 are dropped, with the reason noted. A choice with clear criteria works much better than a bare yes/no.
7. **Every confirmed finding becomes an issue before it's fixed**, and its fix commit references it ("Fixes #N"). Out-of-scope findings become issues too; never just drop them.
8. **Review the fixes** with a fresh independent reviewer before publishing.
9. **Publish gate (the lead):** don't publish unless the report shows an independent review of that exact diff covering the reviewers the judge picked. Check commits for identity and secret leaks (author, emails, home paths, tokens). Then publish.
10. **Wait for green in production CI** before saying "live". "It works on my machine" isn't done. If CI fails, send it back to the builder, and make verify catch that class of bug next time.
11. **Run /correct after each round:** look at what the reviews found, find the repeated mistake classes, and fix each at the highest level that works (architecture, types, lint/CI, verify, tests; docs last).
12. **Spot-check live** against the Done-tjek, confirm the issues closed, then report to the user with links.

## Extra models
- A second model (e.g. DeepSeek) is a cheap second opinion for review and feature ideas. Check every finding against the real code before it becomes an issue.
- Never put personal API keys in a public repo or in CI. Run judge calls from the lead's own machine.

## Communicating with the user
- One short update per milestone: what just happened, why that step exists, and what's next.
- Lead with what the user needs to do, if anything.
- Admit gaps plainly (e.g. a skipped review or untracked fixes) and fix the process so they can't repeat.
