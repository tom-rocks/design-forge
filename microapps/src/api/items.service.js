import { createGetItemRequest, isGetItemResponse } from "./items.model.js";

/**
 * API Service for Item operations
 */

const API_BASE_URL = "/api";

/**
 * Makes a POST request to the API
 * @param {string} endpoint - The API endpoint
 * @param {Object} payload - The request payload
 * @returns {Promise<Object>} The API response
 */
const makeApiRequest = async (endpoint, payload) => {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("API request error:", error);
        throw error;
    }
};

/**
 * Fetches an item by its display ID
 * @param {string} dispId - The display ID of the item
 * @returns {Promise<Object>} The item response
 */
export const fetchItem = async (dispId) => {
    if (!dispId || typeof dispId !== "string") {
        throw new Error("Invalid disp_id provided");
    }

    const requestPayload = createGetItemRequest(dispId);
    const response = await makeApiRequest("", requestPayload);

    if (!isGetItemResponse(response)) {
        throw new Error("Invalid response format from API");
    }

    return response;
}; 