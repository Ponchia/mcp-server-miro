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
    item_types: z.array(z.string()).optional().describe('Filter to specific item types (e.g., ["text", "sticky_note"]).'),
    frame_id: z.string().optional().describe('ID of a specific frame to analyze. Only returns items within this frame.'),
    search_term: z.string().optional().describe('Search term to filter items by content or attributes.'),
    connection_analysis: z.boolean().optional().default(false).describe('Perform detailed analysis of connections to detect potential duplicates or orphaned connectors.')
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
    frameId?: string;
    searchTerm?: string;
    filteredItemCount?: number;
}

// Connection analysis interface
interface ConnectionAnalysis {
    duplicateConnections: Array<{
        items: [string, string],
        connectorIds: string[]
    }>;
    orphanedConnectors: string[];
    potentialIssues: string[];
    itemsWithManyConnections: Array<{
        itemId: string,
        connectionCount: number,
        connectorIds: string[]
    }>;
}

// Tool: Board State Operations
export const boardStateOperationsTool: ToolDefinition<CompleteBoardParams> = {
    name: 'mcp_miro_board_state_operations',
    description: 'Captures a comprehensive snapshot of board content with powerful filtering and analysis capabilities. Use this tool to: (1) Get complete board state or focus on specific sections by frame ID, item types, or search terms, (2) Analyze board structure including frames, groups, tags, and connectors with optional connectivity maps, (3) Detect duplicate connections, orphaned connectors, and other structural issues, (4) Retrieve modification history showing recently created or updated items. This enhanced tool provides precise control over what content to retrieve through multiple filtering mechanisms: limit response to specific frames, filter by item types, search for content matching specific terms, or focus on analyzing connection patterns. For large boards, you can limit items returned or focus on subsets of content to improve efficiency. The tool helps detect potential issues like duplicate connections between the same items or connectors that might be problematic. Response includes both raw data and helpful metadata with statistics to guide further operations. Use filtering options to reduce payload size when working with large complex boards.',
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
            item_types,
            frame_id,
            search_term,
            connection_analysis
        } = args;

        try {
            // Step 1: Get board info
            const boardResponse = await miroClient.get(`/v2/boards/${miroBoardId}`);
            const boardInfo = boardResponse.data;
            
            // Step 2: If frame_id is provided, first verify it exists
            let frameInfo = null;
            if (frame_id) {
                try {
                    const frameResponse = await miroClient.get(`/v2/boards/${miroBoardId}/frames/${frame_id}`);
                    frameInfo = frameResponse.data;
                    console.log(`Found frame: ${frameInfo.id}`);
                } catch (error) {
                    return formatApiError(error, `Frame with ID ${frame_id} not found or not accessible.`);
                }
            }

            // Step 3: Get all items (paginate if needed)
            let allItems: MiroItem[] = [];
            let cursor: string | null = null;
            let itemCount = 0;
            const hasItemLimit = max_items > 0;
            
            // Build query parameters with all available filters
            const queryParams: Record<string, string | string[]> = { limit: '50' };
            if (item_types && item_types.length > 0) queryParams.type = item_types;
            
            // If frame_id is specified, we'll filter items after retrieval
            // (Miro API doesn't support direct filtering by parent frame)

            do {
                if (cursor) queryParams.cursor = cursor;
                
                const itemsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items`, { params: queryParams });
                const itemsData = itemsResponse.data;
                
                if (itemsData.data && itemsData.data.length > 0) {
                    let newItems = itemsData.data;
                    
                    // Apply frame filtering if frame_id is provided
                    if (frame_id) {
                        newItems = newItems.filter(item => 
                            item.parent && 
                            typeof item.parent === 'object' && 
                            'id' in item.parent && 
                            item.parent.id === frame_id
                        );
                    }
                    
                    // Apply search term filtering if provided
                    if (search_term && search_term.trim() !== '') {
                        const searchLower = search_term.toLowerCase();
                        newItems = newItems.filter((item: MiroItem) => {
                            // Search in item ID
                            if (item.id.toLowerCase().includes(searchLower)) return true;
                            
                            // Search in item type
                            if (item.type.toLowerCase().includes(searchLower)) return true;
                            
                            // Search in data content if available
                            if (item.data && typeof item.data === 'object') {
                                if ('content' in item.data && 
                                    typeof item.data.content === 'string' && 
                                    item.data.content.toLowerCase().includes(searchLower)) {
                                    return true;
                                }
                                
                                // Search in title if available
                                if ('title' in item.data && 
                                    typeof item.data.title === 'string' && 
                                    item.data.title.toLowerCase().includes(searchLower)) {
                                    return true;
                                }
                            }
                            
                            return false;
                        });
                    }
                    
                    // Apply item limit if set
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

            // Step 4: Get full content only for text-containing items if requested
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

            // Step 5: Find frame relationships
            // Use more efficient algorithm to avoid duplicating items
            const boardFrames: MiroFrame[] = [];
            
            // First get all frames (possibly filtered by frame_id)
            const frames = frame_id 
                ? allItems.filter(item => item.type === 'frame' && item.id === frame_id) as MiroFrame[]
                : allItems.filter(item => item.type === 'frame') as MiroFrame[];
            
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

            // Step 6: Get groups (summarized version)
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
                            
                            // Filter groups based on frame_id if specified
                            if (frame_id) {
                                // Only include the group if at least one of its items is in the specified frame
                                const hasItemsInFrame = childItemIds.some((itemId: string) => {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    const item = allItems.find((i: any) => i.id === itemId);
                                    return item && item.parent && typeof item.parent === 'object' && 
                                           'id' in item.parent && item.parent.id === frame_id;
                                });
                                
                                if (hasItemsInFrame) {
                                    boardGroups.push({
                                        ...group,
                                        childItemIds
                                    });
                                }
                            } else {
                                boardGroups.push({
                                    ...group,
                                    childItemIds
                                });
                            }
                        } catch (error) {
                            console.error(`Error getting items for group ${group.id}: ${error}`);
                            
                            // Still include the group with empty children if not filtering by frame
                            if (!frame_id) {
                                boardGroups.push({
                                    ...group,
                                    childItemIds: []
                                });
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error getting groups: ${error}`);
            }

            // Step 7: Get comments if requested (limit to essential data)
            const boardComments: MiroComment[] = [];
            if (include_comments) {
                try {
                    const commentsResponse = await miroClient.get(`/v2/boards/${miroBoardId}/comments`);
                    if (commentsResponse.data.data) {
                        // Extract only essential comment data
                        const allComments = commentsResponse.data.data.map((comment: {
                            id: string;
                            data?: {
                                content?: string;
                                author?: string;
                                itemId?: string;
                                position?: {x: number; y: number};
                                createdAt?: string;
                            };
                        }) => ({
                            id: comment.id,
                            content: comment.data?.content,
                            author: comment.data?.author,
                            itemId: comment.data?.itemId,
                            position: comment.data?.position,
                            createdAt: comment.data?.createdAt
                        }));
                        
                        // Filter comments by frame_id if specified
                        if (frame_id) {
                            // Include comments attached to items in this frame
                            // and standalone comments positioned inside the frame
                            const frameItems = new Set(allItems
                                .filter(item => item.parent && typeof item.parent === 'object' && 
                                       'id' in item.parent && item.parent.id === frame_id)
                                .map(item => item.id));
                            
                            const frameGeometry = frameInfo ? {
                                x: frameInfo.position.x,
                                y: frameInfo.position.y,
                                width: frameInfo.geometry.width,
                                height: frameInfo.geometry.height
                            } : null;
                            
                            boardComments.push(...allComments.filter((comment: MiroComment) => {
                                // Include if comment is attached to an item in this frame
                                if (comment.itemId && frameItems.has(comment.itemId)) {
                                    return true;
                                }
                                
                                // Include if comment position is inside the frame bounds
                                if (!comment.itemId && comment.position && frameGeometry) {
                                    const { x, y } = comment.position;
                                    return x >= frameGeometry.x - frameGeometry.width/2 && 
                                           x <= frameGeometry.x + frameGeometry.width/2 &&
                                           y >= frameGeometry.y - frameGeometry.height/2 &&
                                           y <= frameGeometry.y + frameGeometry.height/2;
                                }
                                
                                return false;
                            }));
                        } else {
                            boardComments.push(...allComments);
                        }
                    }
                } catch (error) {
                    console.error(`Error getting comments: ${error}`);
                }
            }

            // Step 8: Get tags if requested (optimized)
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
                            
                            // If filtering by frame_id, only include tagged items in this frame
                            let relevantTaggedItems = taggedItems;
                            if (frame_id) {
                                const frameItems = new Set(allItems
                                    .filter(item => item.parent && typeof item.parent === 'object' && 
                                           'id' in item.parent && item.parent.id === frame_id)
                                    .map(item => item.id));
                                
                                relevantTaggedItems = taggedItems.filter((item: MiroItem) => 
                                    frameItems.has(item.id));
                            }
                            
                            // Store relationship mapping instead of duplicating items
                            const itemIds = relevantTaggedItems.map((item: MiroItem) => item.id);
                            
                            // Only add the tag if it has relevant items (when filtering by frame)
                            if (!frame_id || itemIds.length > 0) {
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
                            }
                        } catch (error) {
                            console.error(`Error getting items for tag ${tag.id}: ${error}`);
                            
                            // Still include the tag with empty items if not filtering by frame
                            if (!frame_id) {
                                boardTags.push({
                                    ...tag,
                                    itemIds: []
                                });
                            }
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

            // Step 9: Build connectivity maps and analyze connections
            const boardConnectors = allItems.filter(item => item.type === 'connector') as MiroConnector[];
            
            const connectivityMap: Record<string, string[]> = {};
            const connectivityDetails: Record<string, {to: string[], from: string[], bidirectional: string[]}> = {};
            
            // Initialize connection analysis data structures
            const connectionDuplicates: Map<string, string[]> = new Map(); // Maps "itemA-itemB" to array of connector IDs
            const connectorEndpoints: Map<string, [string, string]> = new Map(); // Maps connector ID to [startItemId, endItemId]
            const orphanedConnectors: string[] = [];
            const itemConnectionCounts: Map<string, { count: number, connectorIds: string[] }> = new Map();
            
            // Process connectors for connectivity and analysis
            if (include_connectivity || connection_analysis) {
                // Identify all connected items first
                const connectedItemIds = new Set<string>();
                
                boardConnectors.forEach(connector => {
                    const startItemId = connector.startItem?.id;
                    const endItemId = connector.endItem?.id;
                    
                    // Record all known endpoints
                    if (startItemId && endItemId) {
                        connectorEndpoints.set(connector.id, [startItemId, endItemId]);
                        
                        // Check for orphaned connectors (referencing non-existent items)
                        const startExists = allItems.some(item => item.id === startItemId);
                        const endExists = allItems.some(item => item.id === endItemId);
                        
                        if (!startExists || !endExists) {
                            orphanedConnectors.push(connector.id);
                        }
                        
                        // Track connection counts per item
                        if (startExists) {
                            connectedItemIds.add(startItemId);
                            
                            if (!itemConnectionCounts.has(startItemId)) {
                                itemConnectionCounts.set(startItemId, { count: 0, connectorIds: [] });
                            }
                            itemConnectionCounts.get(startItemId)!.count++;
                            itemConnectionCounts.get(startItemId)!.connectorIds.push(connector.id);
                        }
                        
                        if (endExists) {
                            connectedItemIds.add(endItemId);
                            
                            if (!itemConnectionCounts.has(endItemId)) {
                                itemConnectionCounts.set(endItemId, { count: 0, connectorIds: [] });
                            }
                            itemConnectionCounts.get(endItemId)!.count++;
                            itemConnectionCounts.get(endItemId)!.connectorIds.push(connector.id);
                        }
                        
                        // Check for duplicate connections
                        const connectionKey = [startItemId, endItemId].sort().join('-');
                        if (!connectionDuplicates.has(connectionKey)) {
                            connectionDuplicates.set(connectionKey, []);
                        }
                        connectionDuplicates.get(connectionKey)!.push(connector.id);
                    }
                });
                
                // Initialize connectivity maps for connected items
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
                        if (connectivityMap[fromId] && !connectivityMap[fromId].includes(toId)) {
                            connectivityMap[fromId].push(toId);
                        }
                        if (connectivityMap[toId] && !connectivityMap[toId].includes(fromId)) {
                            connectivityMap[toId].push(fromId);
                        }
                        
                        // Add to detailed directional maps
                        if (connectivityDetails[fromId] && !connectivityDetails[fromId].to.includes(toId)) {
                            connectivityDetails[fromId].to.push(toId);
                        }
                        if (connectivityDetails[toId] && !connectivityDetails[toId].from.includes(fromId)) {
                            connectivityDetails[toId].from.push(fromId);
                        }
                    }
                });
                
                // Identify bidirectional connections
                for (const itemId in connectivityDetails) {
                    const details = connectivityDetails[itemId];
                    details.to.forEach(toId => {
                        if (details.from.includes(toId) && !details.bidirectional.includes(toId)) {
                            details.bidirectional.push(toId);
                            
                            // Add to the other side's bidirectional list too if it exists
                            if (connectivityDetails[toId] && !connectivityDetails[toId].bidirectional.includes(itemId)) {
                                connectivityDetails[toId].bidirectional.push(itemId);
                            }
                        }
                    });
                }
            }
            
            // Create connection analysis results
            let connectionAnalysisResults: ConnectionAnalysis | undefined;
            
            if (connection_analysis) {
                // Find actual duplicate connections (more than one connector between same items)
                const duplicateConnections = Array.from(connectionDuplicates.entries())
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    .filter(([_duplicateKey, connectorIds]) => connectorIds.length > 1)
                    .map(([key, connectorIds]) => {
                        const [item1, item2] = key.split('-');
                        return {
                            items: [item1, item2] as [string, string],
                            connectorIds
                        };
                    });
                
                // Find items with many connections (potential issues)
                const manyConnectionsThreshold = 10;
                const itemsWithManyConnections = Array.from(itemConnectionCounts.entries())
                    .filter(([_, data]) => data.count >= manyConnectionsThreshold)
                    .map(([itemId, data]) => ({
                        itemId,
                        connectionCount: data.count,
                        connectorIds: data.connectorIds
                    }))
                    .sort((a, b) => b.connectionCount - a.connectionCount);
                
                // Generate human-readable issue descriptions
                const potentialIssues: string[] = [];
                
                if (duplicateConnections.length > 0) {
                    potentialIssues.push(`Found ${duplicateConnections.length} cases of duplicate connections between the same items.`);
                }
                
                if (orphanedConnectors.length > 0) {
                    potentialIssues.push(`Found ${orphanedConnectors.length} connectors referencing non-existent items.`);
                }
                
                if (itemsWithManyConnections.length > 0) {
                    potentialIssues.push(`Found ${itemsWithManyConnections.length} items with ${manyConnectionsThreshold}+ connections (maximum: ${itemsWithManyConnections[0]?.connectionCount || 0} connections).`);
                }
                
                connectionAnalysisResults = {
                    duplicateConnections,
                    orphanedConnectors,
                    potentialIssues,
                    itemsWithManyConnections
                };
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
                    duplicateConnections: connection_analysis ? connectionAnalysisResults?.duplicateConnections.length || 0 : undefined,
                    orphanedConnectors: connection_analysis ? orphanedConnectors.length : undefined
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
                    includeConnectivity: include_connectivity,
                    frameId: frame_id,
                    searchTerm: search_term,
                    filteredItemCount: allItems.length
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
            
            if (connection_analysis && connectionAnalysisResults) {
                boardState.connectionAnalysis = connectionAnalysisResults;
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