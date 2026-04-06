# Orchestrator Agent Instructions

**Trigger**: Task touches 2+ domains (infra + API, API + DB, full-stack feature, etc.)

---

## Your Role

You coordinate work across agents. You own the **shared contracts** and resolve conflicts before implementation begins.

---

## Step 1 — Decompose the Task

Break any feature into these questions:

1. **Does this need new Azure resources?** → Bicep agent
2. **Does this change the Cosmos schema or add a container?** → Cosmos agent first (schema drives everything)
3. **Does this add/change API endpoints?** → API agent (after schema is settled)
4. **Does this change the UI or add pages?** → Next.js agent (after API contract is settled)
5. **Does this need new env vars or secrets?** → Update `env-contract.ts` before coding begins

---

## Step 2 — Define Contracts First

Before writing any implementation code, define or update:

### API Contract
```typescript
// docs/contracts/api-schema.ts
export interface CreateItemRequest {
  name: string;
  // ...
}

export interface CreateItemResponse {
  id: string;
  createdAt: string;
  // ...
}
```

### Cosmos Schema
```typescript
// docs/contracts/cosmos-schemas.ts
export interface ItemDocument {
  id: string;
  partitionKey: string; // always make explicit
  // ...
  _ts?: number;         // Cosmos system fields optional
}
```

### Env Vars
```typescript
// docs/contracts/env-contract.ts — add before using in code
export const ENV = {
  COSMOS_ENDPOINT: process.env.COSMOS_ENDPOINT!,
  // ...
} as const;
```

---

## Step 3 — Agent Execution Order

Always follow this dependency order to avoid contract mismatches:

```
Bicep Agent          (provisions resources, outputs connection strings)
       ↓
Cosmos Agent         (creates containers with correct partition keys/indexes)
       ↓
API Agent            (implements endpoints using confirmed schema)
       ↓
Next.js Agent        (builds UI against confirmed API contract)
       ↓
CI/CD Agent          (wires deployment pipeline)
```

---

## Step 4 — Merge Checklist

Before considering a cross-cutting feature complete:

- [ ] All types are imported from `docs/contracts/` — no locally invented duplicates
- [ ] Every `process.env.*` in code has a corresponding entry in `env-contract.ts`
- [ ] Every env var in `env-contract.ts` has a corresponding Bicep output or Key Vault secret
- [ ] API response shapes match what Next.js is consuming
- [ ] Cosmos partition key in code matches the container definition in Bicep
- [ ] New containers have indexing policy defined (not just default)
- [ ] GitHub Actions pipeline updated if new env vars or resources were added

---

## Conflict Resolution Rules

| Conflict | Resolution |
|---|---|
| Two agents define the same type differently | `docs/contracts/` wins — update both implementations |
| Infra output name doesn't match env var name | Fix the Bicep output name to match `env-contract.ts` |
| API returns field that Next.js doesn't expect | API contract in `docs/contracts/api-schema.ts` is source of truth |
| Partition key mismatch between Bicep and API | Bicep container definition wins — API must adapt |
