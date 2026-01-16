import { useQuery } from "@tanstack/react-query";
import { fetchItem } from "./items.service.js";

/**
 * React Query hooks for Item operations
 */

/**
 * Hook to fetch an item by display ID
 * @param {string} dispId - The display ID of the item
 * @returns {Object} React Query result object
 */
export const useItemQuery = (dispId) => {
    return useQuery({
        queryKey: ["item", dispId],
        queryFn: () => fetchItem(dispId),
        enabled: !!dispId && dispId.trim().length > 0,
        retry: 2,
        retryDelay: 1000,
    });
}; 