/**
 * Cosmos DB Document Schemas — Source of Truth
 *
 * All Cosmos document interfaces live here.
 * The partition key field must always be explicit and documented.
 * Never define document types locally in repositories — import from here.
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Fields present on every document stored in Cosmos DB */
export interface CosmosDocument {
  /** Cosmos document ID — use crypto.randomUUID() to generate */
  id: string;

  /**
   * Partition key value for this document.
   * The field name 'partitionKey' is used by convention across all containers.
   * The VALUE varies per container — see each interface's JSDoc.
   */
  partitionKey: string;

  /** ISO 8601 — set on create, never update */
  createdAt: string;

  /** ISO 8601 — update on every write */
  updatedAt: string;

  /** Cosmos system timestamp (Unix seconds). Read-only — do not set manually. */
  _ts?: number;

  /** ETag for optimistic concurrency. Read-only — do not set manually. */
  _etag?: string;

  /**
   * Optional TTL in seconds. Set to -1 to use container default.
   * Only works if container has defaultTtl configured in Bicep.
   */
  ttl?: number;
}

// ---------------------------------------------------------------------------
// Items container
// Container name: 'items'
// Partition key path: /partitionKey
// Partition key value: tenantId (e.g. 'tenant-abc-123')
// ---------------------------------------------------------------------------

export interface ItemDocument extends CosmosDocument {
  /**
   * Partition key = tenantId
   * All items for a tenant are co-located.
   * Query pattern: always filter by partitionKey = tenantId
   */
  partitionKey: string; // tenantId

  name: string;
  description?: string;
  status: 'active' | 'draft' | 'archived';

  /** ID of the user who created this item */
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Add more document interfaces below as new containers are added.
// Always document the partition key value pattern in JSDoc.
// ---------------------------------------------------------------------------
