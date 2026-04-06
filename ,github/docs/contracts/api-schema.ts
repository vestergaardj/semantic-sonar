/**
 * API Contract — Source of Truth
 *
 * All request/response types for the API layer.
 * Both the Azure Functions API and Next.js frontend import from here.
 * Never define API types locally in either project — always use this file.
 *
 * Co-locate Zod schemas here so validation and types stay in sync.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// Items — replace with your actual domain entities
// ---------------------------------------------------------------------------

export const CreateItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['active', 'draft']).default('draft'),
});

export type CreateItemRequest = z.infer<typeof CreateItemSchema>;

export const UpdateItemSchema = CreateItemSchema.partial();
export type UpdateItemRequest = z.infer<typeof UpdateItemSchema>;

export interface ItemResponse {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'draft' | 'archived';
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}

export type GetItemResponse = ItemResponse;
export type CreateItemResponse = ItemResponse;
export type UpdateItemResponse = ItemResponse;
export type ListItemsResponse = PaginatedResponse<ItemResponse>;
