import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { MiroItem, MiroFrame, MiroGroup, MiroTag, MiroComment, MiroConnector, HierarchyItem, BoardState } from '../types/miro-types';
import { generateContentSummary, modificationHistory } from '../utils/data-utils';

// Define schemas
const completeBoardSchema = z.object({
    include_item_content: z.boolean().optional().default(true).describe('Whether to include the full content of each item.'),
    include_comments: z.boolean().optional().default(false).describe('Whether to include comments.'),
    include_tags: z.boolean().optional().default(true).describe('Whether to include tags.'),
    include_history: z.boolean().optional().default(true).describe('Whether to include modification history.'),
    include_content_summaries: z.boolean().optional().default(true).describe('Whether to include content summaries for text items.'),
    include_connectivity: z.boolean().optional().default(false).describe('Whether to include detailed connectivity maps (increases payload size).'),
    max_items: z.number().optional().default(500).describe('Maximum number of items to include in response (use 0 for unlimited).'),
    item_types: z.array(z.string()).optional().describe('Filter to specific item types (e.g., ["text", "sticky_note"]).')
});

const itemTreeSchema = z.object({
    item_id: z.string().optional().describe('ID of the specific item to retrieve. If not provided, type must be specified.'),
    type: z.enum(['frame', 'shape', 'text', 'sticky_note', 'image', 'document', 'embed', 'card', 'app_card']).optional().describe('Filter by item type. Only used when item_id is not provided.'),
    max_depth: z.number().min(1).max(10).optional().default(5).describe('Maximum depth to traverse the hierarchy. Default: 5'),
    include_connectors: z.boolean().optional().default(true).describe('Whether to include connector information for items.'),
    include_tags: z.boolean().optional().default(true).describe('Whether to include tags associated with items.'),
    include_content_summaries: z.boolean().optional().default(true).describe('Whether to include content summaries for text items.'),
}).refine(
    data => data.item_id !== undefined || data.type !== undefined, 
    { message: 'Either item_id or type must be provided', path: ['item_id'] }
);

// Type definitions for the parameters
type CompleteBoardParams = z.infer<typeof completeBoardSchema>;
type ItemTreeParams = z.infer<typeof itemTreeSchema>;

// Update metadata interface to include new properties
interface BoardMetadata {
    timestamp: string;
    itemCount: number;
    frameCount: number;
    groupCount: number;
    connectorCount: number;
    tagCount: number;
    commentCount: number;
    hasItemLimit?: boolean;
    itemLimit?: number;
    limitReached?: boolean;
    includeItemContent?: boolean;
    includeComments?: boolean;
    includeTags?: boolean;
    includeHistory?: boolean;
    includeConnectivity?: boolean;
}

// Tool: Board State Operations
export const boardStateOperationsTool: ToolDefinition<CompleteBoardParams> = {
    name: 'mcp_miro_board_state_operations',
    description: 'Captures a complete snapshot of all board content and relationships for comprehensive understanding or analysis. Use this tool to: (1) retrieve all board items with their properties, content, positions, and connections, (2) analyze board structure including frames, groups, tags, and connectors, (3) gather statistics about item types, connectivity, and organization, (4) access modification history showing recently created or updated items. This tool provides the most comprehensive view of a Miro board with configurable detail levels via parameters. You can include or exclude item content details, comments, tag relationships, modification history, and connectivity maps to control response size and focus. The board state includes a structural summary with counts by item type, connection statistics, and hierarchical relationships. For large boards, you can limit the number of items returned. This tool is ideal for gaining a complete understanding of complex boards before making changes, analyzing relationships between items, or accessing board-wide statistics. Response includes both the raw data and helpful metadata to navigate the content.',
    parameters: completeBoardSchema,
    execute: async (args) => {
        console.log(`Executing mcp_miro_board_state_operations with params: ${JSON.stringify(args)}`);
        const { 
            include_item_content, 
            include_comments, 
            include_tags, 
            include_history, 
            include_content_summaries,
            include_connectivity,
            max_items,
            item_types
        } = args;

        try {
            // Step 1: Get board info
            const boardResponse = await miroClient.get(`/v2/boards/${miroBoardId}`);
            const boardInfo = boardResponse.data;

            // Step 2: Get all items (paginate if needed)
            let allItems: MiroItem[] = [];
            let cursor: string | null = null;
            let itemCount = 0;
            const hasItemLimit = max_items > 0;

            do {
                const params: Record<string, string | string[]> = { limit: '50' };
                if (cursor) params.cursor = cursor;
                if (item_types && item_types.length > 0) params.type = item_types;
                
                const itemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params });
                const itemsData = itemsResponse.data;
                
                if (itemsData.data && itemsData.data.length > 0) {
                    // Apply item limit if set
                    const newItems = itemsData.data;
                    if (hasItemLimit && itemCount + newItems.length > max_items) {
                        // Add only up to the max items limit
                        allItems = [...allItems, ...newItems.slice(0, max_items - itemCount)];
                        itemCount = max_items;
                        break;
                    } else {
                        allItems = [...allItems, ...newItems];
                        itemCount += newItems.length;
                    }
                }
                
                cursor = itemsData.cursor || null;
            } while (cursor && (!hasItemLimit || itemCount < max_items));

            // Step 3: Get full content only for text-containing items if requested
            if (include_item_content) {
                // Identify item types that typically contain meaningful text content
                const textItemTypes = ['shape', 'text', 'sticky_note', 'card', 'app_card'];
                
                for (let i = 0; i < allItems.length; i++) {
                    const item = allItems[i];
                    
                    // Only get detailed content for text-containing items
                    const shouldGetDetails = !item_types || 
                        textItemTypes.includes(item.type) || 
                        item_types.includes(item.type);
                    
                    if (shouldGetDetails) {
                        try {
                            let itemEndpoint;
                            switch (item.type) {
                                case 'sticky_note':
                                    itemEndpoint = 'sticky_notes';
                                    break;
                                default:
                                    itemEndpoint = `${item.type}s`; // For most item types, just add 's'
                                    break;
                            }
                            
                            const itemResponse = await miroClient.get(`/v2/boards/${miroBoardId}/${itemEndpoint}/${item.id}`);
                            
                            // Merge the detailed data with the item instead of adding a separate property
                            allItems[i] = {
                                ...item,
                                ...itemResponse.data
                            };
                        } catch (error) {
                            console.error(`Error getting details for item ${item.id}: ${error}`);
                        }
                    }
                }
            }
            
            // Add content summaries if requested (regardless of detailed content)
            if (include_content_summaries) {
                for (let i = 0; i < allItems.length; i++) {
                    const summary = generateContentSummary(allItems[i]);
                    if (summary) {
                        allItems[i].content_summary = summary;
                    }
                }
            }

            // Step 4: Find frame relationships
            // Use more efficient algorithm to avoid duplicating items
            const boardFrames: MiroFrame[] = [];
            
            // First get all frames
            const frames = allItems.filter(item => item.type === 'frame') as MiroFrame[];
            
            // Then find child relationships without duplicating the items
            for (const frame of frames) {
                // Get only item IDs for child relationships to avoid duplicating objects
                const childItemIds = allItems
                    .filter(item => 
                        item.parent && 
                        typeof item.parent === 'object' && 
                        'id' in item.parent && 
                        item.parent.id === frame.id
                    )
                    .map(item => item.id);
                
                boardFrames.push({
                    ...frame,
                    childItemIds // Store just IDs instead of duplicating the full items
                });
            }

            // Step 5: Get groups (summarized version)
            const boardGroups: MiroGroup[] = [];
            try {
                const groupsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/groups`);
                if (groupsResponse.data.data && groupsResponse.data.data.length > 0) {
                    const groupsData = groupsResponse.data.data;
                    
                    for (const group of groupsData) {
                        try {
                            const groupItemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/groups/${group.id}/items`);
                            // Store just IDs instead of duplicating the items
                            const childItemIds = (groupItemsResponse.data.data || []).map((item: MiroItem) => item.id);
                            
                            boardGroups.push({
                                ...group,
                                childItemIds
                            });
                        } catch (error) {
                            console.error(`Error getting items for group ${group.id}: ${error}`);
                            boardGroups.push({
                                ...group,
                                childItemIds: []
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error getting groups: ${error}`);
            }

            // Step 6: Get comments if requested (limit to essential data)
            const boardComments: MiroComment[] = [];
            if (include_comments) {
                try {
                    const commentsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/comments`);
                    if (commentsResponse.data.data) {
                        // Extract only essential comment data
                        boardComments.push(...commentsResponse.data.data.map((comment: any) => ({
                            id: comment.id,
                            content: comment.data?.content,
                            author: comment.data?.author,
                            itemId: comment.data?.itemId,
                            position: comment.data?.position,
                            createdAt: comment.data?.createdAt
                        })));
                    }
                } catch (error) {
                    console.error(`Error getting comments: ${error}`);
                }
            }

            // Step 7: Get tags if requested (optimized)
            const boardTags: MiroTag[] = [];
            const itemTags: Record<string, string[]> = {}; // Maps item IDs to tag IDs
            
            if (include_tags) {
                try {
                    const tagsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/tags`);
                    const tagsData = tagsResponse.data.data || [];
                    
                    for (let i = 0; i < tagsData.length; i++) {
                        const tag = tagsData[i];
                        try {
                            const tagItemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/tags/${tag.id}/items`);
                            const taggedItems = tagItemsResponse.data.data || [];
                            
                            // Store relationship mapping instead of duplicating items
                            const itemIds = taggedItems.map((item: MiroItem) => item.id);
                            
                            // Update the mapping from items to tags
                            itemIds.forEach((itemId: string) => {
                                if (!itemTags[itemId]) {
                                    itemTags[itemId] = [];
                                }
                                itemTags[itemId].push(tag.id);
                            });
                            
                            boardTags.push({
                                ...tag,
                                itemIds // Just store IDs, not the full items
                            });
                        } catch (error) {
                            console.error(`Error getting items for tag ${tag.id}: ${error}`);
                            boardTags.push({
                                ...tag,
                                itemIds: []
                            });
                        }
                    }
                    
                    // Add tag IDs to items to avoid separate lookups
                    allItems.forEach(item => {
                        if (itemTags[item.id] && itemTags[item.id].length > 0) {
                            item.tagIds = itemTags[item.id];
                        }
                    });
                } catch (error) {
                    console.error(`Error getting tags: ${error}`);
                }
            }

            // Step 8: Build connectivity maps (only if requested)
            const boardConnectors = allItems.filter(item => item.type === 'connector') as MiroConnector[];
            
            let connectivityMap: Record<string, string[]> = {};
            let connectivityDetails: Record<string, {to: string[], from: string[], bidirectional: string[]}> = {};
            
            if (include_connectivity) {
                // Initialize maps only for items with connections
                const connectedItemIds = new Set<string>();
                
                // Identify all connected items first
                boardConnectors.forEach(connector => {
                    if (connector.startItem?.id) connectedItemIds.add(connector.startItem.id);
                    if (connector.endItem?.id) connectedItemIds.add(connector.endItem.id);
                });
                
                // Initialize maps only for connected items to save memory
                connectedItemIds.forEach(id => {
                    connectivityMap[id] = [];
                    connectivityDetails[id] = {
                        to: [],
                        from: [],
                        bidirectional: []
                    };
                });
                
                // Populate connectivity maps
                boardConnectors.forEach(connector => {
                    if (connector.startItem?.id && connector.endItem?.id) {
                        const fromId = connector.startItem.id;
                        const toId = connector.endItem.id;
                        
                        // Add to general connectivity map (undirected)
                        if (!connectivityMap[fromId].includes(toId)) {
                            connectivityMap[fromId].push(toId);
                        }
                        if (!connectivityMap[toId].includes(fromId)) {
                            connectivityMap[toId].push(fromId);
                        }
                        
                        // Add to detailed directional maps
                        if (!connectivityDetails[fromId].to.includes(toId)) {
                            connectivityDetails[fromId].to.push(toId);
                        }
                        if (!connectivityDetails[toId].from.includes(fromId)) {
                            connectivityDetails[toId].from.push(fromId);
                        }
                        
                        // Check for bidirectional connections
                        if (connectivityDetails[fromId].from.includes(toId) && 
                            connectivityDetails[toId].to.includes(fromId)) {
                            if (!connectivityDetails[fromId].bidirectional.includes(toId)) {
                                connectivityDetails[fromId].bidirectional.push(toId);
                            }
                            if (!connectivityDetails[toId].bidirectional.includes(fromId)) {
                                connectivityDetails[toId].bidirectional.push(fromId);
                            }
                        }
                    }
                });
            }
            
            // Create board structure summary
            const structuralSummary = {
                totalItems: allItems.length,
                itemsByType: {} as Record<string, number>,
                connectedItemsCount: Object.keys(connectivityMap).filter(id => 
                    connectivityMap[id] && connectivityMap[id].length > 0).length,
                isolatedItemsCount: allItems.length - Object.keys(connectivityMap).filter(id => 
                    connectivityMap[id] && connectivityMap[id].length > 0).length,
                connectionStats: {
                    totalConnections: boardConnectors.length,
                    bidirectionalPairs: include_connectivity ? 
                        Object.values(connectivityDetails)
                            .reduce((count, detail) => count + detail.bidirectional.length, 0) / 2 : 0, // Divide by 2 to avoid counting twice
                    maxConnections: include_connectivity ? 
                        Math.max(...Object.values(connectivityMap).map(conns => conns ? conns.length : 0), 0) : 0,
                }
            };
            
            // Calculate items by type
            allItems.forEach(item => {
                if (!structuralSummary.itemsByType[item.type]) {
                    structuralSummary.itemsByType[item.type] = 0;
                }
                structuralSummary.itemsByType[item.type]++;
            });
            
            // Construct final board state object (with optimization options)
            const boardState: Partial<BoardState> = {
                board: boardInfo,
                items: allItems,
                frames: boardFrames,
                groups: boardGroups,
                tags: boardTags,
                metadata: {
                    timestamp: new Date().toISOString(),
                    itemCount: allItems.length,
                    frameCount: boardFrames.length,
                    groupCount: boardGroups.length,
                    connectorCount: boardConnectors.length,
                    tagCount: boardTags.length,
                    commentCount: boardComments.length,
                    hasItemLimit: hasItemLimit,
                    itemLimit: max_items,
                    limitReached: hasItemLimit && itemCount >= max_items,
                    includeItemContent: include_item_content,
                    includeComments: include_comments,
                    includeTags: include_tags,
                    includeHistory: include_history,
                    includeConnectivity: include_connectivity
                } as BoardMetadata
            };
            
            // Only add optional data if requested
            if (include_comments) {
                boardState.comments = boardComments;
            }
            
            if (include_connectivity) {
                boardState.connectors = boardConnectors;
                boardState.connectivity = {
                    map: connectivityMap,
                    details: connectivityDetails
                };
            }
            
            boardState.summary = structuralSummary;
            
            // Add history awareness if requested (optimized to limit size)
            if (include_history) {
                boardState.history = {
                    recently_created: modificationHistory.getRecentlyCreated().slice(0, 10),
                    recently_modified: modificationHistory.getRecentlyModified().slice(0, 10),
                };
            }

            console.log(`Board state compiled successfully with ${allItems.length} items`);
            return formatApiResponse(boardState);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Tool: Hierarchy Operations
export const hierarchyOperationsTool: ToolDefinition<ItemTreeParams> = {
    name: 'mcp_miro_hierarchy_operations',
    description: 'Explores parent-child relationships and connections between specific items on a Miro board. Use this tool to: (1) examine the hierarchical structure of frames and their contained items, (2) understand how specific items connect to other elements through connector lines, (3) discover tagged items and their categorization, (4) follow relationships to a configurable depth to understand complex dependencies. Unlike board_state_operations which provides a complete snapshot, this tool focuses on exploring specific parts of the board in greater depth. You can start from a specific item ID to explore its relationships, or query by item type to explore all items of a particular category. The tool returns a nested tree structure showing parent-child relationships, attached tags, incoming and outgoing connections, and bidirectional links. For each item, you\'ll receive connection statistics and content summaries to help identify relevant elements. Parameters let you control the maximum depth of exploration (1-10 levels), whether to include connector information, whether to include tag data, and whether to include content summaries for each item. Always provide either an item_id or type parameter to specify your starting point.',
    parameters: itemTreeSchema,
    execute: async (args) => {
        console.log(`Executing mcp_miro_hierarchy_operations with params: ${JSON.stringify(args)}`);
        
        // Validate required parameters manually to provide better error messages
        if (!args.item_id && !args.type) {
            return formatApiError(new Error('Missing required parameter: Either item_id or type must be provided'));
        }
        
        const { item_id, type, max_depth, include_connectors, include_tags, include_content_summaries } = args;
        
        try {
            // Step 1: Get initial item(s)
            let rootItems: MiroItem[] = [];
            
            if (item_id) {
                // Get a specific item by ID
                try {
                    // We don't know the type, so we need to first check what type it is
                    const itemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { 
                        params: { limit: '50' }
                    });
                    
                    // Find the item in the response
                    const foundItem = itemsResponse.data.data?.find((item: MiroItem) => item.id === item_id);
                    
                    if (!foundItem) {
                        return formatApiError(new Error(`Item with ID ${item_id} not found`));
                    }
                    
                    // Now get the detailed item data based on its type
                    let itemEndpoint;
                    switch (foundItem.type) {
                        case 'sticky_note':
                            itemEndpoint = 'sticky_notes';
                            break;
                        default:
                            itemEndpoint = `${foundItem.type}s`; // For most item types, just add 's'
                            break;
                    }
                    
                    const itemResponse = await miroClient.get(`/v2/boards/${miroBoardId}/${itemEndpoint}/${item_id}`);
                    rootItems = [{ ...foundItem, details: itemResponse.data }];
                    
                    // Add content summary if requested
                    if (include_content_summaries) {
                        const summary = generateContentSummary(rootItems[0]);
                        if (summary) {
                            rootItems[0].content_summary = summary;
                        }
                    }
                } catch (error) {
                    return formatApiError(error);
                }
            } else if (type) {
                // Get items of a specific type
                try {
                    const itemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { 
                        params: { type, limit: '50' }
                    });
                    
                    rootItems = itemsResponse.data.data || [];
                    
                    // Get detailed information for each item
                    let itemEndpoint;
                    switch (type) {
                        case 'sticky_note':
                            itemEndpoint = 'sticky_notes';
                            break;
                        default:
                            itemEndpoint = `${type}s`; // For most item types, just add 's'
                            break;
                    }
                    
                    for (let i = 0; i < rootItems.length; i++) {
                        try {
                            const itemResponse = await miroClient.get(`/v2/boards/${miroBoardId}/${itemEndpoint}/${rootItems[i].id}`);
                            rootItems[i] = { ...rootItems[i], details: itemResponse.data };
                            
                            // Add content summary if requested
                            if (include_content_summaries) {
                                const summary = generateContentSummary(rootItems[i]);
                                if (summary) {
                                    rootItems[i].content_summary = summary;
                                }
                            }
                        } catch (error) {
                            console.error(`Error getting details for item ${rootItems[i].id}: ${error}`);
                        }
                    }
                } catch (error) {
                    return formatApiError(error);
                }
            }
            
            // Step 2: Get all items on the board to determine parent-child relationships
            const allItems: MiroItem[] = [];
            let cursor: string | null = null;
            
            do {
                const params: Record<string, string> = { limit: '50' };
                if (cursor) params.cursor = cursor;
                
                const itemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params });
                const itemsData = itemsResponse.data;
                
                if (itemsData.data && itemsData.data.length > 0) {
                    const newItems = itemsData.data;
                    
                    // Add content summaries if requested
                    if (include_content_summaries) {
                        for (const item of newItems) {
                            const summary = generateContentSummary(item);
                            if (summary) {
                                item.content_summary = summary;
                            }
                        }
                    }
                    
                    allItems.push(...newItems);
                }
                
                cursor = itemsData.cursor || null;
            } while (cursor);
            
            // Get all connectors for relationship mapping if requested
            let connectors: MiroConnector[] = [];
            if (include_connectors) {
                connectors = allItems.filter(item => item.type === 'connector') as MiroConnector[];
            }
            
            // Get all tags if requested
            const itemTags: Record<string, MiroTag[]> = {};
            if (include_tags) {
                try {
                    const tagsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/tags`);
                    const tagsData = tagsResponse.data.data || [];
                    
                    for (const tag of tagsData) {
                        try {
                            const tagItemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/tags/${tag.id}/items`);
                            const taggedItems = tagItemsResponse.data.data || [];
                            
                            // Map tags to items
                            for (const taggedItem of taggedItems) {
                                if (!itemTags[taggedItem.id]) {
                                    itemTags[taggedItem.id] = [];
                                }
                                itemTags[taggedItem.id].push(tag);
                            }
                        } catch (error) {
                            console.error(`Error getting items for tag ${tag.id}: ${error}`);
                        }
                    }
                } catch (error) {
                    console.error(`Error getting tags: ${error}`);
                }
            }
            
            // Helper function to recursively build the hierarchy
            const buildItemHierarchy = (items: MiroItem[], depth: number): HierarchyItem[] => {
                if (depth > max_depth) {
                    return items.map(item => ({ 
                        ...item, 
                        tags: [], 
                        connectors: [],
                        connected_items: { to: [], from: [], bidirectional: [], all: [] },
                        connection_info: {
                            is_connected_to_any: false,
                            connected_item_count: 0,
                            sends_connections_to_count: 0,
                            receives_connections_from_count: 0,
                            has_bidirectional_connections: false,
                            bidirectional_connection_count: 0
                        },
                        children: [] 
                    }));
                }
                
                return items.map(item => {
                    // Find child items by parent relationship
                    const children = allItems.filter(childItem => 
                        childItem.parent && 
                        typeof childItem.parent === 'object' && 
                        'id' in childItem.parent && 
                        childItem.parent.id === item.id
                    );
                    
                    // Create connectivity information for this item
                    const connectedItems = {
                        to: [] as string[],
                        from: [] as string[],
                        bidirectional: [] as string[],
                        all: [] as string[]
                    };
                    
                    // Find all connectors for this item and build connectivity maps
                    const currentItemConnectors = include_connectors ? connectors.filter(conn => {
                        const startItemId = conn.startItem?.id;
                        const endItemId = conn.endItem?.id;
                        
                        if (startItemId === item.id && endItemId) {
                            // This item connects to another item
                            if (!connectedItems.to.includes(endItemId)) {
                                connectedItems.to.push(endItemId);
                            }
                            if (!connectedItems.all.includes(endItemId)) {
                                connectedItems.all.push(endItemId);
                            }
                        }
                        
                        if (endItemId === item.id && startItemId) {
                            // Another item connects to this item
                            if (!connectedItems.from.includes(startItemId)) {
                                connectedItems.from.push(startItemId);
                            }
                            if (!connectedItems.all.includes(startItemId)) {
                                connectedItems.all.push(startItemId);
                            }
                        }
                        
                        return startItemId === item.id || endItemId === item.id;
                    }) : [];
                    
                    // Find bidirectional connections
                    connectedItems.to.forEach(toId => {
                        if (connectedItems.from.includes(toId) && !connectedItems.bidirectional.includes(toId)) {
                            connectedItems.bidirectional.push(toId);
                        }
                    });
                    
                    // Get tag information for current item
                    const itemTagList = include_tags ? (itemTags[item.id] || []) : [];
                    
                    // Generate connection summary information
                    const connectionInfo = {
                        is_connected_to_any: connectedItems.all.length > 0,
                        connected_item_count: connectedItems.all.length,
                        sends_connections_to_count: connectedItems.to.length,
                        receives_connections_from_count: connectedItems.from.length,
                        has_bidirectional_connections: connectedItems.bidirectional.length > 0,
                        bidirectional_connection_count: connectedItems.bidirectional.length
                    };
                    
                    // Process children recursively
                    const childrenWithDetails = children.map(child => {
                        // Add tag information if available
                        const childTags = include_tags ? (itemTags[child.id] || []) : [];
                        
                        // Find connectors associated with this child
                        const childConnectors = include_connectors ? connectors.filter(conn => {
                            const startItemId = conn.startItem?.id;
                            const endItemId = conn.endItem?.id;
                            return startItemId === child.id || endItemId === child.id;
                        }) : [];
                        
                        return {
                            ...child,
                            tags: childTags,
                            connectors: childConnectors
                        };
                    });
                    
                    // Recursively build hierarchy for children
                    const childrenHierarchy = buildItemHierarchy(childrenWithDetails, depth + 1);
                    
                    return {
                        ...item,
                        tags: itemTagList,
                        connectors: currentItemConnectors,
                        connected_items: connectedItems,
                        connection_info: connectionInfo,
                        children: childrenHierarchy
                    };
                });
            };
            
            // Build the hierarchy starting from root items
            const hierarchy = buildItemHierarchy(rootItems, 1);
            
            // Construct the final result
            const result = {
                items: hierarchy,
                metadata: {
                    timestamp: new Date().toISOString(),
                    rootItemCount: rootItems.length,
                    totalItemCount: allItems.length,
                    maxDepth: max_depth,
                    includeConnectors: include_connectors,
                    includeTags: include_tags,
                    includeContentSummaries: include_content_summaries
                }
            };
            
            console.log(`Item tree built successfully with ${rootItems.length} root items`);
            return formatApiResponse(result);
        } catch (error) {
            return formatApiError(error);
        }
    },
};