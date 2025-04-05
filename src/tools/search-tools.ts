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