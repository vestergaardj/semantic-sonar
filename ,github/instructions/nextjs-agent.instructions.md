# Next.js Agent Instructions

**Trigger**: Tasks in `app/**`, `components/**`, `*.tsx`, `*.ts` in the frontend, or anything related to the Next.js layer.

---

## Project Frontend Structure

```
app/
├── (auth)/
│   └── login/page.tsx
├── (app)/                        # Protected routes group
│   ├── layout.tsx                # Auth guard lives here
│   ├── dashboard/page.tsx
│   └── items/
│       ├── page.tsx              # List view
│       ├── [id]/page.tsx         # Detail view
│       └── [id]/edit/page.tsx
├── api/                          # Next.js API routes (BFF layer only — not business logic)
│   └── auth/[...nextauth]/route.ts
├── layout.tsx                    # Root layout (providers, fonts)
└── globals.css
components/
├── ui/                           # Primitive/design system components
├── features/                     # Domain-specific components
│   └── items/
│       ├── ItemCard.tsx
│       ├── ItemList.tsx
│       └── ItemForm.tsx
└── providers/                    # Context providers
lib/
├── api-client/                   # Typed fetch wrappers (never fetch() inline)
│   └── items-api.ts
├── auth/                         # MSAL / NextAuth config
└── utils/
```

---

## Data Fetching Rules

### Server Components (default — prefer these)
```typescript
// app/(app)/items/page.tsx
import { getItems } from '@/lib/api-client/items-api';

export default async function ItemsPage() {
  // Fetch on the server — no loading state needed, no useEffect
  const items = await getItems();
  return <ItemList items={items} />;
}
```

### Client Components (only when you need interactivity)
```typescript
'use client';
// Only add 'use client' when you need: useState, useEffect, event handlers, browser APIs
```

### Server Actions (mutations — prefer over API routes for form submissions)
```typescript
// app/(app)/items/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import type { CreateItemRequest } from '@/docs/contracts/api-schema';

export async function createItemAction(data: CreateItemRequest) {
  const res = await fetch(`${process.env.API_BASE_URL}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create item');
  revalidatePath('/items');                        // invalidate cache
}
```

---

## API Client Layer

Never call `fetch()` directly in components. Use typed wrappers:

```typescript
// lib/api-client/items-api.ts
import type { GetItemResponse, CreateItemRequest, CreateItemResponse } from '@/docs/contracts/api-schema';
import { apiClient } from './base-client';

export async function getItem(id: string): Promise<GetItemResponse> {
  return apiClient.get<GetItemResponse>(`/items/${id}`);
}

export async function createItem(data: CreateItemRequest): Promise<CreateItemResponse> {
  return apiClient.post<CreateItemResponse>('/items', data);
}
```

```typescript
// lib/api-client/base-client.ts
import { getSession } from 'next-auth/react';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function getAuthHeader() {
  const session = await getSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
}

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}/api${path}`, {
      headers: { ...(await getAuthHeader()) },
      next: { revalidate: 60 },               // ISR — tune per endpoint
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<T>;
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<T>;
  },
};
```

---

## Auth Pattern (MSAL + NextAuth)

```typescript
// app/(app)/layout.tsx — Protected route guard
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth/auth-options';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return <>{children}</>;
}
```

---

## Component Rules

```typescript
// ✅ Good component
interface ItemCardProps {
  item: GetItemResponse;                    // Always type props from contracts
  onDelete?: (id: string) => void;
}

export function ItemCard({ item, onDelete }: ItemCardProps) {
  return (
    <article>
      <h2>{item.name}</h2>
      {onDelete && (
        <button onClick={() => onDelete(item.id)} type="button">
          Delete
        </button>
      )}
    </article>
  );
}
```

- Named exports only (no `export default` for components)
- Props interface name = `{ComponentName}Props`
- Types always imported from `docs/contracts/api-schema.ts`
- No inline `fetch()` — always use `lib/api-client/`

---

## Environment Variables

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Client + server (public) |
| `NEXTAUTH_SECRET` | Server only |
| `NEXTAUTH_URL` | Server only |
| `AZURE_AD_CLIENT_ID` | Server only |
| `AZURE_AD_CLIENT_SECRET` | Server only |
| `AZURE_AD_TENANT_ID` | Server only |

Never use `NEXT_PUBLIC_` prefix for secrets. Always add new vars to `docs/contracts/env-contract.ts`.

---

## Do Not

- ❌ Fetch data inside `useEffect` — use Server Components or React Query instead
- ❌ Put business logic in components — extract to `lib/` or use Server Actions
- ❌ Use `any` for API responses — import types from contracts
- ❌ Inline styles — use Tailwind classes or CSS modules
- ❌ Access `process.env` in client components — only `NEXT_PUBLIC_*` vars are available there
- ❌ Create API routes in Next.js for business logic — those belong in the Azure Functions API
