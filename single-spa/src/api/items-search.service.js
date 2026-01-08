/**
 * API Service for Item Search operations
 * Uses the internal GetNextjsItemsRequest endpoint
 */

const API_BASE_URL = "/api";

/**
 * Search request payload
 * @typedef {Object} SearchItemsRequest
 * @property {string} _type - Always "GetNextjsItemsRequest"
 * @property {number} page - Page number (0-indexed)
 * @property {number} limit - Items per page (max 40)
 * @property {string} sort - Sort order (e.g., "relevance_descending", "newest")
 * @property {string} query - Search query
 * @property {string} type - Item type filter ("all", "clothing", "furniture", etc.)
 * @property {string[]} rarity - Rarity filters (e.g., ["rare", "epic"])
 */

/**
 * Creates a search request payload
 * @param {Object} options - Search options
 * @returns {SearchItemsRequest}
 */
export const createSearchRequest = ({
    query = "",
    page = 0,
    limit = 40,
    sort = "relevance_descending",
    type = "all",
    rarity = [],
}) => ({
    _type: "GetNextjsItemsRequest",
    page,
    limit,
    sort,
    query,
    type,
    rarity,
});

/**
 * Search for items using the internal API
 * @param {Object} options - Search options
 * @returns {Promise<Object>} Search results with items array
 */
export const searchItems = async (options) => {
    const payload = createSearchRequest(options);
    
    try {
        const response = await fetch(`${API_BASE_URL}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Search failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Search error:", error);
        throw error;
    }
};

/**
 * Get item image URL from item data
 * @param {Object} item - Item data from API
 * @returns {string} CDN URL for item image
 */
export const getItemImageUrl = (item) => {
    // The item should have a disp_id or similar identifier
    const itemId = item.disp_id || item.id || item.item_id;
    return `https://cdn.highrisegame.com/avatar/${itemId}.png`;
};

/**
 * Transform API item to simplified format for Design Forge
 * @param {Object} item - Raw item from API
 * @returns {Object} Simplified item
 */
export const transformItem = (item) => ({
    id: item.disp_id || item.id || item.item_id,
    name: item.name || item.display_name || item.disp_id,
    category: item.category || item.type,
    rarity: item.rarity || "common",
    imageUrl: getItemImageUrl(item),
});
