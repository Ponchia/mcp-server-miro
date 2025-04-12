import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { filterItemsByContent, checkForSimilarContent } from '../utils/data-utils';
import { MiroItem } from '../types/miro-types';

/**
 * Tools for searching, finding and modifying items based on their content
 * Implements features from next-steps.md
 */

// Schema for content-based search
const searchElementsByContentSchema = z.object({
    query: z.string().describe('Text to search for.'),
    type: z.enum(['shape', 'text', 'sticky_note', 'image', 'document', 'card', 'app_card', 'preview', 'frame', 'embed'])
        .optional()
        .describe('Optional filter by item type.'),
    fuzzy_match: z.boolean()
        .optional()
        .default(true)
        .describe('Whether to use fuzzy (partial) matching or exact matching.')
});

type SearchElementsByContentParams = z.infer<typeof searchElementsByContentSchema>;

// Schema for similar content check
const checkForSimilarContentSchema = z.object({
    content: z.string().describe('The new content to check for duplicates.'),
    item_type: z.enum(['shape', 'text', 'sticky_note', 'card', 'app_card'])
        .describe('Type of item containing this content.')
});

type CheckForSimilarContentParams = z.infer<typeof checkForSimilarContentSchema>;

// New Unified Search Schema
const searchSchema = z.object({
    // Search behavior
    search_mode: z.enum(['all', 'any']).optional().default('all')
        .describe('How to combine search criteria: "all" (AND logic - items must match all criteria) or "any" (OR logic - items need to match at least one criterion)'),
    
    // Content/text search
    text_query: z.string().optional().describe('Text to search for in item content. Works across all text-based items.'),
    text_match_type: z.enum(['exact', 'contains', 'fuzzy']).optional().default('contains')
        .describe('How to match text: "exact" (perfect match), "contains" (substring), or "fuzzy" (partial/approximate match)'),
    
    // Type filters
    item_types: z.array(z.enum([
        'shape', 'text', 'sticky_note', 'image', 'document', 
        'card', 'app_card', 'preview', 'frame', 'embed', 'connector'
    ])).optional().describe('Only return items of these types. Omit to search all types.'),
    
    // Color search
    color_query: z.string().optional().describe('Search by color - accepts color names ("red", "blue") or hex values ("#FF0000")'),
    color_target: z.enum(['fill', 'border', 'text', 'any']).optional().default('any')
        .describe('Which color property to search: "fill" (background), "border", "text" (font color), or "any"'),
    
    // Spatial/area search
    area: z.object({
        x: z.number().describe('X coordinate of the top-left corner of the search area'),
        y: z.number().describe('Y coordinate of the top-left corner of the search area'),
        width: z.number().describe('Width of the search area'),
        height: z.number().describe('Height of the search area')
    }).optional().describe('Search within a specific rectangular area of the board'),
    
    // Parent/container search
    parent_id: z.string().optional().describe('Only return items contained within this parent (frame or group)'),
    
    // Connected items search
    connected_to_id: z.string().optional().describe('Only return items connected to this item by connectors'),
    connection_direction: z.enum(['from', 'to', 'any']).optional().default('any')
        .describe('Direction of connection: "from" (outgoing), "to" (incoming), or "any" (either direction)'),
    
    // Tag search
    tagged_with: z.string().optional().describe('Only return items tagged with this tag ID'),
    
    // Pagination support
    limit: z.number().optional().default(50).describe('Maximum number of results to return (1-100)'),
    
    // Results verbosity control
    include_content: z.boolean().optional().default(true).describe('Include content in results (may increase response size)'),
    include_position: z.boolean().optional().default(true).describe('Include position data in results'),
    include_style: z.boolean().optional().default(true).describe('Include style information in results'),
    
    // Sorting
    sort_by: z.enum(['position_x', 'position_y', 'created_at', 'updated_at', 'relevance']).optional().default('relevance')
        .describe('How to sort results')
});

type SearchParams = z.infer<typeof searchSchema>;

// Content-based search tool
export const searchElementsByContentTool: ToolDefinition<SearchElementsByContentParams> = {
    name: 'mcp_miro_search_by_content_operations',
    description: 'Finds board items containing specific text content, enabling targeted updates to existing elements instead of creating duplicates. Use this tool to: (1) locate items with specific text phrases or keywords, (2) filter results by item type (shape, text, sticky note, etc.), (3) control matching precision with fuzzy or exact matching options. The search examines text content across all supported item types including shapes, sticky notes, text boxes, cards, and more. Fuzzy matching (default) finds partial matches and is ideal for locating items when you only remember part of the content. Exact matching requires the complete search phrase to appear in the item. Results include item IDs, types, positions, and content previews that can be used with other tools for updates or positioning. This is typically the first tool to use when you need to find and modify existing content instead of creating new elements. The response includes metadata about match count and search parameters for reference.',
    parameters: searchElementsByContentSchema,
    execute: async (args) => {
        const { query, type, fuzzy_match } = args;
        console.log(`Executing mcp_miro_search_by_content_operations with query: "${query}", type: ${type || 'any'}, fuzzy: ${fuzzy_match}`);
        
        try {
            // First, get all items from the board
            let cursor: string | null = null;
            const allItems: MiroItem[] = [];
            
            do {
                const params: Record<string, string> = { limit: '50' };
                if (cursor) params.cursor = cursor;
                if (type) params.type = type;
                
                const response = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params });
                const data = response.data;
                
                if (data.data && data.data.length > 0) {
                    allItems.push(...data.data);
                }
                
                cursor = data.cursor || null;
            } while (cursor);
            
            // Filter items by content
            const matchingItems = filterItemsByContent(allItems, query, {
                fuzzyMatch: fuzzy_match,
                itemType: type
            });
            
            console.log(`Found ${matchingItems.length} items matching query: "${query}"`);
            
            return formatApiResponse({
                items: matchingItems,
                metadata: {
                    matched_count: matchingItems.length,
                    total_count: allItems.length,
                    query,
                    fuzzy_match,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            return formatApiError(error);
        }
    }
};

// Duplication Detection tool
export const checkForSimilarContentTool: ToolDefinition<CheckForSimilarContentParams> = {
    name: 'mcp_miro_duplicate_detection_operations',
    description: 'Prevents content duplication by checking if text content already exists on the board before creating new items. Use this tool to: (1) detect exact or similar text content matches across the board, (2) identify potential duplicates using semantic similarity detection, (3) receive detailed information about any matching items including their IDs, positions, and content. The check is performed against all existing items of the specified type (shape, text, sticky note, card, app card) and uses smart matching algorithms that can detect similar content even with minor differences in wording or formatting. Results include a boolean indicating whether duplicates were found and detailed information about any matching items. This tool is essential before creating new text-based content to maintain board organization and prevent redundancy. Always use this check before creating new items with textual content that might already exist elsewhere on the board. The response includes metadata about the check performed and the total number of items scanned.',
    parameters: checkForSimilarContentSchema,
    execute: async (args) => {
        const { content, item_type } = args;
        console.log(`Executing mcp_miro_duplicate_detection_operations with content: "${content.substring(0, 30)}...", type: ${item_type}`);
        
        try {
            // Get all items of the specified type
            let cursor: string | null = null;
            const itemsOfType: MiroItem[] = [];
            
            do {
                const params: Record<string, string> = { 
                    limit: '50',
                    type: item_type
                };
                if (cursor) params.cursor = cursor;
                
                const response = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params });
                const data = response.data;
                
                if (data.data && data.data.length > 0) {
                    itemsOfType.push(...data.data);
                }
                
                cursor = data.cursor || null;
            } while (cursor);
            
            // Check for similar content
            const { duplicatesFound, similarItems } = checkForSimilarContent(
                itemsOfType,
                content,
                item_type
            );
            
            console.log(`Duplicate check for content: "${content.substring(0, 30)}...": ${duplicatesFound ? 'Duplicates found' : 'No duplicates'}`);
            
            return formatApiResponse({
                duplicates_found: duplicatesFound,
                similar_items: similarItems,
                metadata: {
                    item_count: itemsOfType.length,
                    content_preview: content.length > 50 ? content.substring(0, 47) + '...' : content,
                    item_type,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            return formatApiError(error);
        }
    }
};

// Helper function to match colors
const isColorMatch = (itemColor: string | undefined, searchColor: string | undefined, fuzzy: boolean = true): boolean => {
    if (!itemColor || !searchColor) return false;
    
    // Normalize colors
    const normalizedItemColor = itemColor.toLowerCase().replace('#', '');
    const normalizedSearchColor = searchColor.toLowerCase().replace('#', '');
    
    // Handle color names (basic version)
    const colorMap: Record<string, string> = {
        'red': 'ff0000',
        'green': '00ff00', 
        'blue': '0000ff',
        'yellow': 'ffff00',
        'purple': '800080',
        'pink': 'ffc0cb',
        'orange': 'ffa500',
        'black': '000000',
        'white': 'ffffff',
        'gray': '808080',
        'grey': '808080',
        'brown': 'a52a2a',
        'cyan': '00ffff',
        'magenta': 'ff00ff',
        'lime': '00ff00',
        'olive': '808000',
        'navy': '000080',
        'teal': '008080',
        'violet': 'ee82ee'
    };
    
    // Map color names to hex
    const mappedItemColor = colorMap[normalizedItemColor] || normalizedItemColor;
    const mappedSearchColor = colorMap[normalizedSearchColor] || normalizedSearchColor;
    
    if (fuzzy) {
        // Fuzzy match - check if the first few chars match (allows partial hex matches)
        const minLength = Math.min(mappedItemColor.length, mappedSearchColor.length);
        const checkLength = Math.min(minLength, 3); // Check at least the first 3 characters
        
        const itemColorPrefix = mappedItemColor.substring(0, checkLength);
        const searchColorPrefix = mappedSearchColor.substring(0, checkLength);
        
        return itemColorPrefix.includes(searchColorPrefix) || searchColorPrefix.includes(itemColorPrefix);
    } else {
        // Exact match
        return mappedItemColor === mappedSearchColor;
    }
};

// Helper function to check if an item is within a specified area
const isInArea = (item: MiroItem, area: { x: number; y: number; width: number; height: number }): boolean => {
    // Get item position and dimensions
    let itemX = 0, itemY = 0, itemWidth = 0, itemHeight = 0;
    
    if (item.position) {
        itemX = typeof item.position.x === 'string' 
            ? parseFloat(item.position.x) 
            : (item.position.x || 0);
            
        itemY = typeof item.position.y === 'string' 
            ? parseFloat(item.position.y) 
            : (item.position.y || 0);
    }
    
    if (item.geometry) {
        itemWidth = typeof item.geometry.width === 'string' 
            ? parseFloat(item.geometry.width) 
            : (item.geometry.width || 0);
            
        itemHeight = typeof item.geometry.height === 'string' 
            ? parseFloat(item.geometry.height) 
            : (item.geometry.height || 0);
    }
    
    // By default, consider position as center of the item
    const itemLeft = itemX - (itemWidth / 2);
    const itemRight = itemX + (itemWidth / 2);
    const itemTop = itemY - (itemHeight / 2);
    const itemBottom = itemY + (itemHeight / 2);
    
    // Area boundaries
    const areaLeft = area.x;
    const areaRight = area.x + area.width;
    const areaTop = area.y;
    const areaBottom = area.y + area.height;
    
    // Check if item overlaps with area
    // For very small items or points, just check if the center point is in the area
    if (itemWidth === 0 || itemHeight === 0) {
        return itemX >= areaLeft && itemX <= areaRight && 
               itemY >= areaTop && itemY <= areaBottom;
    }
    
    // For items with size, check if any part of the item overlaps with the area
    return !(itemRight < areaLeft || 
             itemLeft > areaRight || 
             itemBottom < areaTop || 
             itemTop > areaBottom);
};

// Search Tool implementation
export const searchTool: ToolDefinition<SearchParams> = {
    name: 'mcp_miro_unified_search',
    description: `Powerful multi-criteria search tool designed specifically for AI agents to efficiently find Miro board elements. This single tool replaces the need for multiple search operations and handles complex search tasks with a single call.

KEY CAPABILITIES:
1. Content Search: Find items by text content with three matching modes (exact, contains, fuzzy)
2. Type Filtering: Filter by one or multiple item types (shape, text, sticky_note, etc.)
3. Color Search: Find items by color (fill, border, or text) using color names or hex values
4. Area Search: Find all items within a specific rectangular region of the board
5. Parent/Container: Find all items inside a specific frame or group
6. Connectivity: Find items connected to a specific item
7. Tag Filtering: Find items with a specific tag
8. Pagination & Results Control: Limit results and control what data is returned

SEARCH MODES:
- Use search_mode: "all" (default) to find items matching ALL criteria (AND logic)
- Use search_mode: "any" to find items matching ANY criteria (OR logic)

This flexibility is critical when searching for different characteristics that rarely appear together.

EXAMPLES:
- Find all blue sticky notes: {color_query: "blue", item_types: ["sticky_note"]}
- Find text containing "Important": {text_query: "Important", item_types: ["text", "sticky_note"]}
- Find all items in top-left corner: {area: {x: 0, y: 0, width: 500, height: 500}}
- Find items inside a frame: {parent_id: "3458764624479188876"}
- Find items connected to a specific shape: {connected_to_id: "3458764624479188999"}
- Find items with "status" text OR blue fill: {text_query: "status", color_query: "blue", search_mode: "any"}

IMPORTANT: 
- For narrower results, use search_mode: "all" (default)
- For broader results, use search_mode: "any" 
- Be specific with your search criteria
- Combine multiple parameters strategically
- When using "any" mode with many criteria, consider increasing the limit parameter

The response includes matched items with their properties, position, and content, along with metadata about the search performed.`,
    parameters: searchSchema,
    execute: async (args) => {
        console.log(`Executing mcp_miro_search with params:`, JSON.stringify(args, null, 2));
        
        try {
            // 1. First, get all items from the board (possibly with type filter)
            let cursor: string | null = null;
            const allItems: MiroItem[] = [];
            const limit = Math.min(Math.max(args.limit || 50, 1), 100);
            const searchMode = args.search_mode || 'all';
            
            // Construct query params for initial API call
            const queryParams: Record<string, string | string[]> = { limit: '50' };
            
            // Apply type filter in the API call if possible
            if (args.item_types && args.item_types.length === 1) {
                queryParams.type = args.item_types[0];
            }
            
            // Fetch items from Miro API
            do {
                if (cursor) queryParams.cursor = cursor;
                
                const response = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params: queryParams });
                const data = response.data;
                
                if (data.data && data.data.length > 0) {
                    allItems.push(...data.data);
                }
                
                cursor = data.cursor || null;
                
                // Early break if we have enough items (we'll filter them later)
                if (allItems.length >= 300) break;
            } while (cursor);
            
            console.log(`Retrieved ${allItems.length} items from the board`);
            
            // 2. Apply filters based on search mode
            let filteredItems: MiroItem[] = [];
            
            if (searchMode === 'all') {
                // AND logic - items must match ALL criteria
                filteredItems = [...allItems];
                
                // Type filter (if multiple types specified)
                if (args.item_types && args.item_types.length > 0) {
                    filteredItems = filteredItems.filter(item => {
                        // Check if the item type is in the requested types
                        return args.item_types?.some(t => t === item.type);
                    });
                }
                
                // Text content filter
                if (args.text_query) {
                    filteredItems = filterByTextContent(filteredItems, args.text_query, args.text_match_type);
                }
                
                // Color filter
                if (args.color_query) {
                    filteredItems = filterByColor(filteredItems, args.color_query, args.color_target);
                }
                
                // Area filter
                if (args.area) {
                    filteredItems = filteredItems.filter(item => isInArea(item, args.area!));
                }
                
                // Parent ID filter
                if (args.parent_id) {
                    filteredItems = filteredItems.filter(item => 
                        item.parent && typeof item.parent === 'object' && 
                        'id' in item.parent && item.parent.id === args.parent_id
                    );
                }
                
                // Connected to filter
                if (args.connected_to_id) {
                    filteredItems = filterByConnections(filteredItems, allItems, args.connected_to_id, args.connection_direction);
                }
                
                // Tagged with filter
                if (args.tagged_with) {
                    const taggedItems = await getItemsWithTag(args.tagged_with);
                    filteredItems = filteredItems.filter(item => taggedItems.has(item.id));
                }
            } else {
                // OR logic - items must match ANY criteria
                const matchingSets: Set<string>[] = [];
                
                // For each criterion, we'll create a set of matching item IDs
                
                // Type filter
                if (args.item_types && args.item_types.length > 0) {
                    const typeMatches = new Set<string>();
                    allItems.forEach(item => {
                        // Check if the item type is in the requested types
                        if (args.item_types?.some(t => t === item.type)) {
                            typeMatches.add(item.id);
                        }
                    });
                    if (typeMatches.size > 0) matchingSets.push(typeMatches);
                }
                
                // Text content filter
                if (args.text_query) {
                    const textMatches = new Set<string>();
                    filterByTextContent(allItems, args.text_query, args.text_match_type).forEach(item => {
                        textMatches.add(item.id);
                    });
                    if (textMatches.size > 0) matchingSets.push(textMatches);
                }
                
                // Color filter
                if (args.color_query) {
                    const colorMatches = new Set<string>();
                    filterByColor(allItems, args.color_query, args.color_target).forEach(item => {
                        colorMatches.add(item.id);
                    });
                    if (colorMatches.size > 0) matchingSets.push(colorMatches);
                }
                
                // Area filter
                if (args.area) {
                    const areaMatches = new Set<string>();
                    allItems.filter(item => isInArea(item, args.area!)).forEach(item => {
                        areaMatches.add(item.id);
                    });
                    if (areaMatches.size > 0) matchingSets.push(areaMatches);
                }
                
                // Parent ID filter
                if (args.parent_id) {
                    const parentMatches = new Set<string>();
                    allItems.filter(item => 
                        item.parent && typeof item.parent === 'object' && 
                        'id' in item.parent && item.parent.id === args.parent_id
                    ).forEach(item => {
                        parentMatches.add(item.id);
                    });
                    if (parentMatches.size > 0) matchingSets.push(parentMatches);
                }
                
                // Connected to filter
                if (args.connected_to_id) {
                    const connectedItems = filterByConnections(allItems, allItems, args.connected_to_id, args.connection_direction);
                    const connectionMatches = new Set<string>();
                    connectedItems.forEach(item => {
                        connectionMatches.add(item.id);
                    });
                    if (connectionMatches.size > 0) matchingSets.push(connectionMatches);
                }
                
                // Tagged with filter
                if (args.tagged_with) {
                    const taggedItems = await getItemsWithTag(args.tagged_with);
                    if (taggedItems.size > 0) matchingSets.push(taggedItems);
                }
                
                // If we have any matches at all, union all matching item IDs
                const matchingIds = new Set<string>();
                matchingSets.forEach(set => {
                    set.forEach(id => matchingIds.add(id));
                });
                
                // Filter all items to include only those with IDs in our matching set
                filteredItems = allItems.filter(item => matchingIds.has(item.id));
                
                // If no criteria were specified, return all items
                if (matchingSets.length === 0) {
                    filteredItems = [...allItems];
                }
            }
            
            console.log(`Filtered to ${filteredItems.length} items using mode "${searchMode}"`);
            
            // 3. Sort items if needed
            if (args.sort_by) {
                switch (args.sort_by) {
                    case 'position_x':
                        filteredItems.sort((a, b) => {
                            const ax = typeof a.position?.x === 'string' 
                                ? parseFloat(a.position.x || '0') 
                                : (a.position?.x || 0);
                            const bx = typeof b.position?.x === 'string' 
                                ? parseFloat(b.position.x || '0') 
                                : (b.position?.x || 0);
                            return ax - bx;
                        });
                        break;
                    case 'position_y':
                        filteredItems.sort((a, b) => {
                            const ay = typeof a.position?.y === 'string' 
                                ? parseFloat(a.position.y || '0') 
                                : (a.position?.y || 0);
                            const by = typeof b.position?.y === 'string' 
                                ? parseFloat(b.position.y || '0') 
                                : (b.position?.y || 0);
                            return ay - by;
                        });
                        break;
                    case 'created_at':
                        // We don't have creation date in the data model, so we'll use a simple ID comparison
                        // as a proxy (assuming newer items have higher IDs)
                        filteredItems.sort((a, b) => a.id.localeCompare(b.id));
                        break;
                    case 'updated_at':
                        // Similar issue, no update timestamp available
                        filteredItems.sort((a, b) => b.id.localeCompare(a.id)); // Reverse sort by ID
                        break;
                    case 'relevance':
                    default:
                        // For relevance, we prioritize exact text matches if text_query was provided
                        if (args.text_query) {
                            const query = args.text_query.toLowerCase();
                            
                            filteredItems.sort((a, b) => {
                                const contentA = getItemContent(a)?.toLowerCase() || '';
                                const contentB = getItemContent(b)?.toLowerCase() || '';
                                
                                // Exact matches come first
                                const aExactMatch = contentA === query;
                                const bExactMatch = contentB === query;
                                
                                if (aExactMatch && !bExactMatch) return -1;
                                if (!aExactMatch && bExactMatch) return 1;
                                
                                // Then starts-with matches
                                const aStartsWithMatch = contentA.startsWith(query);
                                const bStartsWithMatch = contentB.startsWith(query);
                                
                                if (aStartsWithMatch && !bStartsWithMatch) return -1;
                                if (!aStartsWithMatch && bStartsWithMatch) return 1;
                                
                                // Then contains matches
                                return 0;
                            });
                        }
                        break;
                }
            }
            
            // 4. Limit results
            const limitedResults = filteredItems.slice(0, limit);
            
            // 5. Format the response based on include flags
            const formattedResults = limitedResults.map(item => {
                const result: Record<string, unknown> = {
                    id: item.id,
                    type: item.type
                };
                
                // Include position if requested
                if (args.include_position) {
                    result.position = item.position;
                    
                    if (item.geometry) {
                        result.geometry = item.geometry;
                    }
                    
                    if (item.parent) {
                        result.parent = item.parent;
                    }
                }
                
                // Include content if requested
                if (args.include_content) {
                    result.content_summary = getItemContent(item);
                    
                    if (item.data) {
                        result.data = item.data;
                    }
                }
                
                // Include style if requested
                if (args.include_style && item.style) {
                    result.style = item.style;
                }
                
                return result;
            });
            
            // Prepare metadata about the search
            const metadata = {
                total_items: allItems.length,
                filtered_count: filteredItems.length,
                returned_count: formattedResults.length,
                search_criteria: { ...args },
                timestamp: new Date().toISOString()
            };
            
            return formatApiResponse({
                items: formattedResults,
                metadata
            });
            
        } catch (error) {
            return formatApiError(error);
        }
    }
};

// Helper function for filtering by text content
function filterByTextContent(items: MiroItem[], query: string, matchType: 'exact' | 'contains' | 'fuzzy' = 'contains'): MiroItem[] {
    return items.filter(item => {
        const content = getItemContent(item);
        if (!content) return false;
        
        if (matchType === 'exact') {
            return content.toLowerCase() === query.toLowerCase();
        } else if (matchType === 'contains') {
            return content.toLowerCase().includes(query.toLowerCase());
        } else { // fuzzy
            return content.toLowerCase().includes(query.toLowerCase()) || 
                    query.toLowerCase().includes(content.toLowerCase());
        }
    });
}

// Helper function for filtering by color
function filterByColor(items: MiroItem[], colorQuery: string, colorTarget: 'fill' | 'border' | 'text' | 'any' = 'any'): MiroItem[] {
    const fuzzyColorMatch = true; // Could make this a parameter
    
    return items.filter(item => {
        const style = item.style || {};
        
        if (colorTarget === 'fill' || colorTarget === 'any') {
            if (isColorMatch(style.fillColor as string, colorQuery, fuzzyColorMatch)) {
                return true;
            }
        }
        
        if (colorTarget === 'border' || colorTarget === 'any') {
            if (isColorMatch(style.borderColor as string, colorQuery, fuzzyColorMatch)) {
                return true;
            }
        }
        
        if (colorTarget === 'text' || colorTarget === 'any') {
            if (isColorMatch(style.color as string, colorQuery, fuzzyColorMatch)) {
                return true;
            }
        }
        
        return false;
    });
}

// Helper function for filtering by connections
function filterByConnections(
    items: MiroItem[], 
    allItems: MiroItem[], 
    connectedToId: string, 
    direction: 'from' | 'to' | 'any' = 'any'
): MiroItem[] {
    // First find all connectors
    const connectors = allItems.filter(item => item.type === 'connector');
    
    // Find all connected item IDs based on direction
    const connectedItemIds = new Set<string>();
    
    for (const connector of connectors) {
        if (!connector.data) continue;
        
        const connectorData = connector.data as Record<string, unknown>;
        const startItem = connectorData.startItem as { id?: string } | undefined;
        const endItem = connectorData.endItem as { id?: string } | undefined;
        
        const startItemId = startItem?.id;
        const endItemId = endItem?.id;
        
        if (!startItemId || !endItemId) continue;
        
        if (direction === 'from' || direction === 'any') {
            // Items that our target connects to (outgoing)
            if (startItemId === connectedToId) {
                connectedItemIds.add(endItemId);
            }
        }
        
        if (direction === 'to' || direction === 'any') {
            // Items that connect to our target (incoming)
            if (endItemId === connectedToId) {
                connectedItemIds.add(startItemId);
            }
        }
    }
    
    // Filter items to only those connected to the target
    return items.filter(item => connectedItemIds.has(item.id));
}

// Helper function to get items with a specific tag
async function getItemsWithTag(tagId: string): Promise<Set<string>> {
    const taggedItemIds = new Set<string>();
    
    try {
        // Get items with this tag
        const tagItemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/tags/${tagId}/items`);
        const taggedItems = tagItemsResponse.data.data || [];
        
        // Build a set of tagged item IDs for faster lookup
        for (const taggedItem of taggedItems) {
            taggedItemIds.add(taggedItem.id);
        }
    } catch (error) {
        console.error(`Error getting items with tag ${tagId}: ${error}`);
    }
    
    return taggedItemIds;
}

// Helper function to extract content from different item types
function getItemContent(item: MiroItem): string | undefined {
    if (!item) return undefined;
    
    switch (item.type) {
        case 'text':
        case 'sticky_note':
        case 'shape':
            return item.data?.content as string | undefined;
        case 'card':
        case 'app_card': {
            const title = item.data?.title as string | undefined;
            const description = item.data?.description as string | undefined;
            if (title && description) return `${title}: ${description}`;
            return title || description;
        }
        case 'document':
        case 'image':
        case 'frame': {
            return item.data?.title as string | undefined;
        }
        case 'connector': {
            // Combine all captions
            const captions = item.data?.captions as Array<{content: string}> | undefined;
            if (captions && captions.length > 0) {
                return captions.map(c => c.content).join(' ');
            }
            return undefined;
        }
        default:
            return undefined;
    }
} 