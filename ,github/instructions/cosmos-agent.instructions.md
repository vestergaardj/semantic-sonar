# Cosmos DB Agent Instructions

**Trigger**: Tasks involving Cosmos DB queries, container design, indexing, partition keys, or anything in `api/lib/cosmos/**` or `docs/contracts/cosmos-schemas.ts`.

---

## Client Setup

Use a **singleton** client — never instantiate `CosmosClient` per request:

```typescript
// api/lib/cosmos/client.ts
import { CosmosClient } from '@azure/cosmos';
import { ENV } from '../../contracts/env-contract';

let _client: CosmosClient | null = null;

export function getCosmosClient(): CosmosClient {
  if (!_client) {
    _client = new CosmosClient({
      endpoint: ENV.COSMOS_ENDPOINT,
      key: ENV.COSMOS_KEY,
      // Use connection policy for production resilience:
      connectionPolicy: {
        requestTimeout: 10000,
        retryOptions: { maxRetryAttemptCount: 3, fixedRetryIntervalInMilliseconds: 500 }
      }
    });
  }
  return _client;
}

export function getContainer(containerId: string) {
  return getCosmosClient()
    .database(ENV.COSMOS_DATABASE_ID)
    .container(containerId);
}
```

---

## Document Schema Rules

Every document interface **must** live in `docs/contracts/cosmos-schemas.ts`:

```typescript
// docs/contracts/cosmos-schemas.ts

/** Base fields present on every Cosmos document */
export interface CosmosDocument {
  id: string;
  partitionKey: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  _ts?: number;        // Cosmos system timestamp (read-only)
  _etag?: string;      // For optimistic concurrency
  ttl?: number;        // Optional TTL in seconds
}

export interface ItemDocument extends CosmosDocument {
  // domain fields here
  name: string;
  status: 'active' | 'archived';
}
```

---

## Partition Key Strategy

This is the most important design decision. Follow these rules:

| Scenario | Strategy |
|---|---|
| Multi-tenant app | `/tenantId` — all tenant data co-located |
| User-owned data | `/userId` |
| Time-series / append-heavy | `/YYYY-MM` or synthetic key to avoid hot partitions |
| Small lookup/reference data | `/type` (e.g., `'config'`, `'template'`) |

**Never use `/id` as partition key** — it prevents efficient cross-item queries and wastes RUs.

```typescript
// Always pass partitionKey explicitly in queries and operations:
const { resource } = await container.item(id, partitionKeyValue).read<ItemDocument>();
```

---

## Query Patterns

### Point Read (cheapest — 1 RU)
```typescript
// Use when you have both id AND partition key
const { resource } = await container
  .item(id, partitionKeyValue)
  .read<ItemDocument>();
```

### Query with partition key (efficient)
```typescript
const { resources } = await container.items
  .query<ItemDocument>({
    query: 'SELECT * FROM c WHERE c.status = @status AND c.partitionKey = @pk',
    parameters: [
      { name: '@status', value: 'active' },
      { name: '@pk', value: partitionKeyValue }
    ]
  })
  .fetchAll();
```

### Cross-partition query (expensive — avoid in hot paths)
```typescript
// Only when truly needed; always add a comment explaining why
const { resources } = await container.items
  .query<ItemDocument>(
    { query: 'SELECT * FROM c WHERE c.type = @type', parameters: [...] },
    { enableCrossPartitionQuery: true }  // ← explicit opt-in
  )
  .fetchAll();
```

---

## Optimistic Concurrency (Use for Updates)

```typescript
async function updateItem(id: string, pk: string, patch: Partial<ItemDocument>) {
  const item = container.item(id, pk);
  const { resource: existing, etag } = await item.read<ItemDocument>();

  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };

  await item.replace(updated, {
    accessCondition: { type: 'IfMatch', condition: etag! }  // 412 if concurrent write
  });
}
```

---

## Error Handling

```typescript
import { ErrorResponse } from '@azure/cosmos';

function isCosmosError(e: unknown, statusCode: number): boolean {
  return e instanceof ErrorResponse && e.statusCode === statusCode;
}

// Usage:
try {
  await container.item(id, pk).read();
} catch (e) {
  if (isCosmosError(e, 404)) { /* not found */ }
  if (isCosmosError(e, 412)) { /* optimistic concurrency failed */ }
  if (isCosmosError(e, 429)) { /* throttled — retry with backoff */ }
  throw e; // re-throw unknown errors
}
```

---

## Repository Pattern

Wrap all Cosmos operations in a repository — never query directly from route handlers:

```typescript
// api/lib/cosmos/repositories/item-repository.ts
export class ItemRepository {
  private container = getContainer('items');

  async findById(id: string, partitionKey: string): Promise<ItemDocument | null> { ... }
  async findByStatus(status: string, partitionKey: string): Promise<ItemDocument[]> { ... }
  async create(doc: Omit<ItemDocument, '_ts' | '_etag'>): Promise<ItemDocument> { ... }
  async update(id: string, pk: string, patch: Partial<ItemDocument>): Promise<ItemDocument> { ... }
  async delete(id: string, pk: string): Promise<void> { ... }
}

// Singleton export
export const itemRepository = new ItemRepository();
```

---

## Do Not

- ❌ Run cross-partition queries in request hot paths
- ❌ Use `SELECT *` when you only need specific fields — project with `SELECT c.id, c.name`
- ❌ Store large blobs (>1MB) in Cosmos — use Blob Storage + store the URL
- ❌ Forget to handle 429 (throttling) — the SDK retries but log when it happens
- ❌ Use `upsert` when you need optimistic concurrency — they are mutually exclusive
