import { z } from "zod";

/**
 * Zod validation schemas for Item operations
 */

/**
 * Schema for GetItemRequest validation
 */
export const getItemRequestSchema = z.object({
    _type: z.literal("GetItemRequest"),
    disp_id: z.string().min(1, "Display ID is required"),
});

/**
 * Schema for GetItemResponse validation
 */
export const getItemResponseSchema = z.object({
    item: z.record(z.any()),
    metadata: z.record(z.any()).default({}),
    users: z.record(z.any()).default({}),
    read_only: z.boolean().default(false),
});

/**
 * Validates a GetItemRequest payload
 * @param {Object} data - The request data to validate
 * @returns {Object} The validated data
 */
export const validateGetItemRequest = (data) => {
    return getItemRequestSchema.parse(data);
};

/**
 * Validates a GetItemResponse payload
 * @param {Object} data - The response data to validate
 * @returns {Object} The validated data
 */
export const validateGetItemResponse = (data) => {
    return getItemResponseSchema.parse(data);
}; 