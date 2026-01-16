/**
 * API Models for Item operations
 */

/**
 * GetItemRequest model
 * @typedef {Object} GetItemRequest
 * @property {string} _type - Request type, always "GetItemRequest"
 * @property {string} disp_id - Display ID of the item to fetch
 */

/**
 * GetItemResponse model
 * @typedef {Object} GetItemResponse
 * @property {Object} item - The item data
 * @property {Object} metadata - Additional metadata about the item
 * @property {Object} users - User-related data
 * @property {boolean} read_only - Whether the item is read-only
 */

/**
 * Creates a GetItemRequest payload
 * @param {string} dispId - The display ID of the item
 * @returns {GetItemRequest} The request payload
 */
export const createGetItemRequest = (dispId) => ({
    _type: "GetItemRequest",
    disp_id: dispId,
});

/**
 * Type guard to check if response is GetItemResponse
 * @param {any} response - The response to check
 * @returns {boolean} True if response is valid GetItemResponse
 */
export const isGetItemResponse = (response) => {
    return (
        response &&
        typeof response === "object" &&
        "item" in response &&
        "metadata" in response &&
        "users" in response &&
        "read_only" in response
    );
}; 