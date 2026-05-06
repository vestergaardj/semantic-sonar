# Copilot Agent Instructions

This project uses a **multi-agent architecture**. Before generating code, identify which domain(s) the task touches and apply the corresponding instruction file.

## Stack Overview
- **Infrastructure**: Azure + Bicep (IaC)
- **Backend**: Node.js / TypeScript REST or HTTP-triggered Azure Functions API
- **Database**: Azure Cosmos DB (NoSQL)
- **Frontend**: Next.js (App Router, TypeScript)
- **Auth**: Azure AD / MSAL
- **CI/CD**: GitHub Actions
- **Analytics**: Power BI / DAX (measures, calculated columns, time intelligence)

---

## Agent Routing — Read the Right Instructions First

| Domain touched | Load this file |
|---|---|
| `infra/**`, `*.bicep`, `*.bicepparam` | `.github/instructions/bicep-agent.instructions.md` |
| `api/**`, Azure Functions, routes | `.github/instructions/api-agent.instructions.md` |
| Cosmos DB queries, containers, indexes | `.github/instructions/cosmos-agent.instructions.md` |
| `app/**`, `components/**`, `*.tsx` | `.github/instructions/nextjs-agent.instructions.md` |
| Cross-layer feature (touches 2+ domains) | `.github/instructions/orchestrator-agent.instructions.md` |
| GitHub Actions, deployment pipelines | `.github/instructions/cicd-agent.instructions.md` |
| DAX measures, Power BI, Analysis Services | `.github/instructions/dax-agent.instructions.md` |

---

## Shared Contracts (Always Respect These)

- **API contracts** live in `docs/contracts/api-schema.ts` — never invent types independently
- **Cosmos document schemas** live in `docs/contracts/cosmos-schemas.ts`
- **Environment variables** are defined in `docs/contracts/env-contract.ts` — do not introduce new `process.env.*` references without adding them here first
- **Azure resource naming** follows the convention in `docs/contracts/azure-naming.md`

---

## Multi-Agent Task Pattern

When a task spans multiple domains, structure your work like this:

```
1. Read orchestrator instructions
2. Define/confirm the shared contract (API shape, document schema, env vars)
3. Work domain by domain — Bicep → Cosmos → API → Next.js
4. Never let two domains invent the same type independently
5. Validate that env vars referenced in code exist in infra outputs
```

---

## General Rules (All Agents)

- Always use **TypeScript** with strict mode
- No `any` — use `unknown` + type guards if needed
- All secrets come from **Azure Key Vault** references or environment variables — never hardcode
- Prefer **named exports** over default exports
- Write **JSDoc** on all exported functions
- Every new feature needs a corresponding test file
