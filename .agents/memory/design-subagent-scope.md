---
name: Design subagent scope risk
description: An async DESIGN subagent given a full-app creative brief (all routes/pages/hooks) under-delivered — only set up theme/CSS and left pages as scaffolds.
---

When delegating a large multi-page app build to an async DESIGN subagent with a broad brief, it may interpret "design" narrowly and only touch the theme/CSS layer (e.g. `index.css`, base tokens) while leaving actual page components as placeholders.

**Why:** Observed on the M-PESA Business Loans build — a subagent tasked with building all customer/admin pages, routing, and data wiring for a role-based app returned only a themed `index.css` and an unchanged placeholder `App.tsx`. No page components were created.

**How to apply:** For large multi-page feature builds, prefer breaking work into smaller, concrete, individually-verifiable deliverables (one page/feature per delegation) rather than one sweeping "build the whole frontend" brief. Always inspect the subagent's actual file diffs before assuming the work is done — don't trust the completion summary alone. If scope was clearly missed, take over and build directly rather than re-delegating the same broad brief.
