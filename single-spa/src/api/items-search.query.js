import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { searchItems } from "./items-search.service.js";

/**
 * React Query hook for searching items
 * @param {Object} options - Search options
 * @returns {Object} React Query result
 */
export const useItemSearch = (options) => {
    const { query, type, rarity, sort, enabled = true } = options;
    
    return useQuery({
        queryKey: ["items-search", query, type, rarity, sort],
        queryFn: () => searchItems({ query, type, rarity, sort, page: 0, limit: 40 }),
        enabled: enabled && (!!query?.trim() || !!type),
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

/**
 * React Query hook for paginated item search
 * @param {Object} options - Search options  
 * @returns {Object} React Query infinite query result
 */
export const useInfiniteItemSearch = (options) => {
    const { query, type, rarity, sort, enabled = true } = options;
    
    return useInfiniteQuery({
        queryKey: ["items-search-infinite", query, type, rarity, sort],
        queryFn: ({ pageParam = 0 }) => searchItems({ 
            query, 
            type, 
            rarity, 
            sort, 
            page: pageParam, 
            limit: 40 
        }),
        getNextPageParam: (lastPage, allPages) => {
            // If we got a full page, there might be more
            if (lastPage?.items?.length === 40) {
                return allPages.length;
            }
            return undefined;
        },
        enabled: enabled && (!!query?.trim() || !!type),
        staleTime: 5 * 60 * 1000,
    });
};
