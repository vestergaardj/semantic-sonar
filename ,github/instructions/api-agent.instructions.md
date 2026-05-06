# API Agent Instructions

**Trigger**: Tasks in `api/**`, Azure Functions, HTTP routes, middleware, auth, or backend business logic.

---

## Project API Structure

```
api/
├── src/
│   ├── functions/           # One file per Azure Function
│   │   ├── getItem.ts
│   │   └── createItem.ts
│   ├── lib/
│   │   ├── cosmos/          # Cosmos client + repositories (see cosmos-agent)
│   │   ├── middleware/
│   │   │   ├── auth.ts      # MSAL token validation
│   │   │   ├── validate.ts  # Zod request validation
│   │   │   └── errors.ts    # Centralized error handler
│   │   └── utils/
│   └── contracts/           # Re-exports from docs/contracts/
├── host.json
└── local.settings.json.example   # Never commit local.settings.json
```

---

## Function Structure

Every Azure Function follows this pattern:

```typescript
// api/src/functions/getItem.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAuth } from '../lib/middleware/auth';
import { handleError } from '../lib/middleware/errors';
import { itemRepository } from '../lib/cosmos/repositories/item-repository';
import type { GetItemResponse } from '../../../docs/contracts/api-schema';

async function handler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  const user = await requireAuth(req);          // throws 401 if invalid
  const id = req.params.id;
  const partitionKey = user.tenantId;           // derive partition key from auth context

  const item = await itemRepository.findById(id, partitionKey);
  if (!item) return { status: 404, jsonBody: { error: 'Not found' } };

  const response: GetItemResponse = {           // always type the response
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
  };

  return { status: 200, jsonBody: response };
}

app.http('getItem', {
  methods: ['GET'],
  authLevel: 'anonymous',                       // Auth handled in middleware, not Functions runtime
  route: 'items/{id}',
  handler: (req, ctx) => handleError(() => handler(req, ctx), ctx),
});
```

---

## Auth Middleware

```typescript
// api/src/lib/middleware/auth.ts
import { HttpRequest } from '@azure/functions';
import { ConfidentialClientApplication } from '@azure/msal-node';

export interface AuthUser {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
}

export async function requireAuth(req: HttpRequest): Promise<AuthUser> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) throw { status: 401, message: 'Missing authorization header' };

  // Validate JWT against Azure AD JWKS
  // Returns decoded claims
  const claims = await validateAzureAdToken(token);

  return {
    userId: claims.oid,
    tenantId: claims.tid,
    email: claims.preferred_username,
    roles: claims.roles ?? [],
  };
}

export function requireRole(user: AuthUser, role: string): void {
  if (!user.roles.includes(role)) {
    throw { status: 403, message: `Role '${role}' required` };
  }
}
```

---

## Validation Middleware (Zod)

```typescript
// api/src/lib/middleware/validate.ts
import { z, ZodSchema } from 'zod';
import { HttpRequest } from '@azure/functions';

export async function validateBody<T>(req: HttpRequest, schema: ZodSchema<T>): Promise<T> {
  const body = await req.json().catch(() => null);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw {
      status: 400,
      message: 'Validation failed',
      details: result.error.flatten().fieldErrors,
    };
  }
  return result.data;
}

// Co-locate schemas with contracts:
// docs/contracts/api-schema.ts exports both the TS interface AND the Zod schema
```

---

## Error Handler Middleware

```typescript
// api/src/lib/middleware/errors.ts
import { HttpResponseInit, InvocationContext } from '@azure/functions';

export async function handleError(
  fn: () => Promise<HttpResponseInit>,
  ctx: InvocationContext
): Promise<HttpResponseInit> {
  try {
    return await fn();
  } catch (e: unknown) {
    if (isAppError(e)) {
      return { status: e.status, jsonBody: { error: e.message, details: e.details } };
    }
    ctx.error('Unhandled error', e);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

interface AppError { status: number; message: string; details?: unknown }
function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'status' in e && 'message' in e;
}
```

---

## API Contract Rules

- **Never invent request/response types inline** — always import from `docs/contracts/api-schema.ts`
- **Always version** routes if the contract changes: `api/v2/items` not silent breaking changes
- **Return consistent error shape**: `{ error: string, details?: unknown }`
- **Use 422** for semantic validation errors (valid JSON, invalid business logic), **400** for malformed requests

---

## CORS + host.json

```json
// host.json
{
  "version": "2.0",
  "extensions": {
    "http": {
      "routePrefix": "api"
    }
  },
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "maxTelemetryItemsPerSecond": 20 }
    }
  }
}
```

---

## Do Not

- ❌ Access `process.env` directly — always use `ENV` from `docs/contracts/env-contract.ts`
- ❌ Return stack traces to clients — log server-side, return generic message
- ❌ Put business logic in function handler files — extract to service classes
- ❌ Use `authLevel: 'function'` or `'admin'` keys for user-facing APIs — use MSAL/JWT
- ❌ Commit `local.settings.json` — it contains secrets
