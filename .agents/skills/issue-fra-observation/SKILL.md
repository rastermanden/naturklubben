---
name: issue-fra-observation
description: >-
  Use when the user describes a bug, missing feature or idea in a few loose
  words (often Danish) and wants it as a GitHub issue: rewrite it into Problem /
  Forventet / Done-tjek and create it.
---
# Issue fra observation

Turn a short, loose observation into a precise, buildable GitHub issue, so whoever builds it (human or agent) knows exactly when it is done.

## Steps
1. **Pin the repo and account.** Use the repo and credentials this assistant already uses for the project. Never post as a different account than the project's own, and keep any anonymity rules the project has.
2. **Reproduce if cheap.** If the site or app is public, check quickly that the problem exists, and note where it happens (page, device, input). Do not invent details you did not see or get from the user.
3. **Check for duplicates.** List open issues and search titles for the same problem. If one exists, comment the new detail there instead of creating a new issue.
4. **Write the issue in the user's language** (Danish by default for Danish input):
   - **Title:** what is wrong, concrete, under ~80 characters. Example: "Søgeresultater bliver hængende: intet ryd-kryds".
   - **## Problem:** what happens now, as bullet points, in the user's own terms.
   - **## Forventet:** the desired behaviour, specific enough to build. Fill obvious gaps a good product person would (keyboard, mobile/touch, screen readers, empty states), but don't add new scope.
   - **## Done-tjek:** 3–6 checkboxes that can be verified true or false. If the project has an automated verification skill or test suite, add a box saying a check for this is added there and it passes.
5. **Label it** with one of the project's existing labels (for example fejl, forbedring, data, drift). Create a label only if none fit.
6. **Create the issue** via the API (or the connector or web UI if there's no token), then send the user the link and one line on what you added to their wording.
7. **Hand it off** if a builder agent is working on the project: send it the issue number, its place in the queue, and the rule that its commit ends with "Fixes #N".

## Rules
- Keep the user's intent. Rewriting is for clarity, not for changing what they asked for.
- One problem per issue. Split a message that mixes unrelated problems into several issues.
- No personal names, emails or identifiers in the issue unless the user asked for them.
