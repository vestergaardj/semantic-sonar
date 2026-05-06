# Multi-Agent Architecture — Quick Reference

This project uses scoped instruction files so GitHub Copilot (and other AI agents) stay focused and don't mix up conventions across the stack.

## How It Works

1. **Copilot reads `.github/copilot-instructions.md` automatically** on every session
2. That file routes to the right domain-specific instruction file
3. Domain files contain patterns, rules, and examples specific to that layer
4. `docs/contracts/` contains the shared types that all agents must respect

## Files at a Glance

```
.github/
├── copilot-instructions.md                        ← Copilot reads this automatically
└── instructions/
    ├── orchestrator-agent.instructions.md         ← Cross-domain features
    ├── bicep-agent.instructions.md                ← Azure infra / Bicep
    ├── cosmos-agent.instructions.md               ← Cosmos DB
    ├── api-agent.instructions.md                  ← Azure Functions / API
    ├── nextjs-agent.instructions.md               ← Next.js frontend
    └── cicd-agent.instructions.md                 ← GitHub Actions

docs/
├── contracts/
│   ├── api-schema.ts                              ← Request/response types + Zod schemas
│   ├── cosmos-schemas.ts                          ← Cosmos document interfaces
│   ├── env-contract.ts                            ← All environment variables
│   └── azure-naming.md                            ← Resource naming conventions
└── agents/
    ├── README.md                                   ← This file
    └── prompt-templates.md                        ← Copy-paste prompts for common tasks
```

## The Golden Rules

1. **Contracts first** — define types in `docs/contracts/` before writing implementation
2. **No local type invention** — never define API or Cosmos types in individual files
3. **No direct `process.env`** — always use `env-contract.ts`
4. **Dependency order** — Bicep → Cosmos → API → Next.js (never reverse this)
5. **One agent per domain** — don't ask Copilot to do infra + frontend in a single prompt

## Quick Start

For a new feature, open `docs/agents/prompt-templates.md` and copy the **New Feature (Full Stack)** prompt into Copilot Chat.
