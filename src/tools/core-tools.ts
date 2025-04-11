import { z } from 'zod';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { normalizePositionValues, validateChildPosition } from '../utils/data-utils';
import { ToolDefinition } from '../types/tool-types';
import { PositionSchema, MCP_POSITIONING_GUIDE } from '../schemas/position-schema';
import { SIMPLIFIED_POSITIONING_GUIDE } from './content-tools';

// Use the centralized position schema
export const PositionChangeSchema = PositionSchema;

export const GeometrySchema = z.object({
     width: z.number().optional().describe('Width in pixels.'),
     height: z.number().optional().describe('Height in pixels.'),
     rotation: z.number().optional().describe('Rotation angle in degrees.')
});

// Bulk item creation schema
const BulkItemsSchema = z.object({
    items: z.array(
        z.object({
            type: z.string().describe('Type of item that you want to create.'),
            data: z.record(z.unknown()).optional().describe('Contains data information applicable for each item type.'),
            style: z.record(z.unknown()).optional().describe('Contains information about item-specific styles.'),
            position: PositionChangeSchema.optional().describe('Contains location information about the item.'),
            geometry: GeometrySchema.optional().describe('Contains geometrical information about the item.'),
            parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame this item must be attached to.')
        })
    ).max(20).describe('Array of items to create (max 20)')
});

type BulkItemCreationParams = z.infer<typeof BulkItemsSchema>;

// Bulk creation tool
export const bulkItemCreationTool: ToolDefinition<BulkItemCreationParams> = {
    name: 'mcp_miro_bulk_item_creation',
    description: `Creates multiple items on a Miro board simultaneously in a single API call (up to 20 items maximum). This is ideal for efficiently building complex diagrams, charts, or layouts with many related elements. All item types are supported including shapes, sticky notes, text, images, and more. Each item in the batch can have its own type, data properties, styling, position, and dimensions. Items can be positioned relative to the canvas center or within parent frames. This tool uses atomic operations - if any single item fails validation, the entire batch will fail and no items will be created, ensuring visual consistency. Use this when you need to create multiple related items at once, such as flowchart nodes, dashboard elements, or diagram components that form a cohesive visual.

${SIMPLIFIED_POSITIONING_GUIDE}`,
    parameters: BulkItemsSchema,
    execute: async (args) => {
        const { items } = args;
        const url = `/v2/boards/${miroBoardId}/items/bulk`;
        console.log(`Executing mcp_miro_bulk_item_creation: POST ${url}`);
        console.log(`Creating ${items.length} items in bulk`);
        
        // Normalize each item's position to handle enhanced reference points
        const normalizedItems = items.map(item => {
            // Create a shallow copy of the item
            const normalizedItem = { ...item };
            
            // If there's a position, normalize it
            if (normalizedItem.position) {
                normalizedItem.position = normalizePositionValues(normalizedItem.position) as typeof normalizedItem.position;
                
                // Check if parent present and position needs validation
                if (normalizedItem.parent?.id && normalizedItem.position) {
                    // Helper function to ensure valid parent position (same as in content-tools.ts)
                    const ensureValidParentPosition = (position: Record<string, unknown>) => {
                        // If using parent_center, ensure origin is center (required)
                        if (position.__refSystem === 'parent_center' || position.relativeTo === 'parent_center') {
                            if (position.origin !== 'center') {
                                console.log('Auto-correcting: Setting origin to "center" for parent_center reference (required)');
                                position.origin = 'center';
                            }
                        }
                        
                        // If using parent_top_left, ensure coordinates are positive
                        if (position.__refSystem === 'parent_top_left' || position.relativeTo === 'parent_top_left') {
                            const x = position.x as number;
                            const y = position.y as number;
                            
                            if (x < 0 || y < 0) {
                                console.log(`Auto-correcting: Converting negative coordinates (${x},${y}) to positive for parent_top_left`);
                                position.x = Math.max(0, x);
                                position.y = Math.max(0, y);
                            }
                        }
                        
                        return position;
                    };

                    // Apply the enhanced position validation
                    const position = normalizedItem.position as Record<string, unknown>;
                    const validPosition = ensureValidParentPosition(position);
                    normalizedItem.position = validPosition as typeof normalizedItem.position;
                    
                    // Get parent ID to retrieve its geometry later if needed
                    const parentId = normalizedItem.parent.id;
                    console.log(`Item with parent ${parentId} using enhanced positioning with reference system: ${position.__refSystem || 'unknown'}`);
                    
                    // Provide clearer guidance based on the reference system
                    if (position.__refSystem === 'parent_center' || position.relativeTo === 'parent_center') {
                        console.log(`Using parent_center positioning: Make sure origin is set to "center"`);
                    } else if (position.__refSystem === 'parent_top_left' || position.relativeTo === 'parent_top_left') {
                        console.log(`Using parent_top_left positioning: Using positive coordinates relative to frame's top-left corner`);
                    } else {
                        console.log(`Bulk creation: For complex frame positioning, single-item creation offers more precision`);
                    }
                }
                
                // Clean up position data - ensure only API-compatible properties remain
                const position = normalizedItem.position as Record<string, unknown>;
                const cleanedPosition: Record<string, unknown> = {
                    x: position.x,
                    y: position.y,
                    origin: position.origin || 'center'
                };
                normalizedItem.position = cleanedPosition as typeof normalizedItem.position;
            }
            
            // Sanitize style objects - remove unsupported properties
            if (normalizedItem.style) {
                // Create a clean style object with only supported properties
                const sanitizedStyle: Record<string, unknown> = {};
                
                // Copy only known supported style properties
                const supportedStyleProps = [
                    'fillColor', 'fillOpacity', 
                    'borderColor', 'borderOpacity', 'borderStyle', 'borderWidth',
                    'color', 'fontFamily', 'fontSize', 'textAlign', 'textAlignVertical'
                ];
                
                for (const prop of supportedStyleProps) {
                    if (prop in normalizedItem.style) {
                        sanitizedStyle[prop] = normalizedItem.style[prop];
                    }
                }
                
                // Replace the style object with the sanitized version
                normalizedItem.style = sanitizedStyle;
            }
            
            return normalizedItem;
        });
        
        try {
            const response = await miroClient.post(url, normalizedItems);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            // Enhanced error handling for parent positioning issues
            const axiosError = error as {
                response?: {
                    status: number;
                    data?: {
                        message?: string;
                    };
                };
            };
            if (axiosError?.response?.status === 400 && axiosError?.response?.data?.message?.includes('parent')) {
                return formatApiError(error, `Error creating bulk items with parent frames. Possible causes:
1. Parent frame ID might be invalid
2. Position is outside parent frame boundaries
3. Missing origin="center" for parent_center reference

POSITIONING RECOMMENDATIONS:
- For items in frames, use the simplified positioning guide:
  a) CENTER: {"x": 0, "y": 0, "relativeTo": "parent_center", "origin": "center"}
  b) TOP-LEFT: {"x": 10, "y": 10, "relativeTo": "parent_top_left"}
- For complex positioning needs, use individual item creation instead of bulk creation`);
            }
            return formatApiError(error);
        }
    },
};

// Core tools for board and general item operations

// Tool: Board Operations
const updateBoardSchema = z.object({
    name: z.string().min(1).max(60).optional().describe('Name for the board.'),
    description: z.string().min(0).max(300).optional().describe('Description of the board.'),
    policy: z.object({
        permissionsPolicy: z.object({
            collaborationToolsStartAccess: z.enum(['all_editors', 'board_owners_and_coowners']).optional().describe('Defines who can start/stop collaboration tools.'),
            copyAccess: z.enum(['anyone', 'team_members', 'team_editors', 'board_owner']).optional().describe('Defines who can copy the board/content.'),
            sharingAccess: z.enum(['team_members_with_editing_rights', 'owner_and_coowners']).optional().describe('Defines who can change sharing/invite users.')
        }).optional(),
        sharingPolicy: z.object({
            access: z.enum(['private', 'view', 'edit', 'comment']).optional().describe('Defines the public-level access to the board.'),
            inviteToAccountAndBoardLinkAccess: z.enum(['viewer', 'commenter', 'editor', 'no_access']).optional().describe('Defines the user role when inviting via link.'),
            organizationAccess: z.enum(['private', 'view', 'comment', 'edit']).optional().describe('Defines the organization-level access.'),
            teamAccess: z.enum(['private', 'view', 'comment', 'edit']).optional().describe('Defines the team-level access.')
        }).optional()
    }).optional().describe('Board policy settings.'),
});

type UpdateBoardParams = z.infer<typeof updateBoardSchema>;

export const boardOperationsTool: ToolDefinition<UpdateBoardParams> = {
    name: 'mcp_miro_board_operations',
    description: 'Configures global board settings including name, description, and access permissions. Use this tool to: (1) update board identity - change the name (up to 60 chars) or description (up to 300 chars) to better reflect board purpose, (2) manage permission policies - control who can use collaboration tools, copy content, or share the board with others, (3) set sharing policies - configure board access at organization, team, and public levels. Permissions can be set for different user types from view-only to full editing rights. Changes affect the entire board and all its content. This tool is essential when preparing boards for different audiences, transitioning from draft to final state, or adjusting access as project requirements change.',
    parameters: updateBoardSchema,
    execute: async (args) => {
        const url = `/v2/boards/${miroBoardId}`;
        console.log(`Executing mcp_miro_board_operations: PATCH ${url}`);
        console.log(`With body: ${JSON.stringify(args)}`);
        try {
            const response = await miroClient.patch(url, args);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Tool: Item List Operations
const listBoardItemsSchema = z.object({
    limit: z.string().optional().describe('Maximum number of results per call (10-50). Default: 10.'),
    type: z.enum(['shape', 'text', 'sticky_note', 'image', 'document', 'card', 'app_card', 'preview', 'frame', 'embed']).optional().describe('Filter items by type.'),
    cursor: z.string().optional().describe('Pagination cursor for the next set of results.'),
});

type ListBoardItemsParams = z.infer<typeof listBoardItemsSchema>;

export const itemListOperationsTool: ToolDefinition<ListBoardItemsParams> = {
    name: 'mcp_miro_item_list_operations',
    description: 'Retrieves information about all items on a Miro board as a paginated flat collection. This tool is essential for understanding existing board content before making changes. Use it to: (1) get an inventory of all board elements with their properties, positions, and content, (2) filter results by specific item types like shapes, sticky notes, frames, etc., (3) retrieve items in manageable batches with pagination support (10-50 items per call). The response includes item IDs, coordinates, content, and their relationships to other elements. This is typically the first tool to use before modifying an existing board to discover what elements exist and understand the board structure. Results are returned as JSON that can be used to plan further operations.',
    parameters: listBoardItemsSchema,
    execute: async (args) => {
        const url = `/v2/boards/${miroBoardId}/items`;
        console.log(`Executing mcp_miro_item_list_operations: GET ${url}`);
        console.log(`With query params: ${JSON.stringify(args)}`);
        try {
            const response = await miroClient.get(url, { params: args });
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Tool: Item Position Operations
const updateItemPositionOrParentSchema = z.object({
    item_id: z.string().describe('Unique identifier (ID) of the item to update.'),
    position: PositionChangeSchema.optional().describe('Updated position.'),
    parent: z.object({ id: z.string().optional() }).optional().describe('Updated parent frame ID.'),
    data: z.record(z.unknown()).optional().describe('Contains data information applicable for each item type.')
}).passthrough();

type UpdateItemPositionOrParentParams = z.infer<typeof updateItemPositionOrParentSchema>;

export const itemPositionOperationsTool: ToolDefinition<UpdateItemPositionOrParentParams> = {
    name: 'mcp_miro_update_item_position_or_parent',
    description: `Moves items to new positions or reassigns them to different parent frames on a Miro board. Use this tool to: (1) reposition items by specifying new X/Y coordinates, (2) organize items by placing them inside frames, (3) extract items from frames by removing their parent assignment. Position coordinates can be specified relative to different reference points. This tool handles special cases like connector positioning limitations and frame nesting restrictions automatically. Each item can exist in only one position and can have at most one parent. When moving items into frames, the tool validates compatibility and prevents unsupported operations like placing frames inside other frames.

${MCP_POSITIONING_GUIDE}

LIMITATIONS: Connectors cannot be assigned to parent frames. Frames cannot be nested inside other frames via API.`,
    parameters: updateItemPositionOrParentSchema,
    execute: async (args) => {
        const { item_id, ...requestBody } = args;
        
        // First, check if this is a parent assignment and get the item type
        if (requestBody.parent && requestBody.parent.id) {
            try {
                // Get the item type
                const itemResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${item_id}`);
                const itemType = itemResponse.data.type;
                
                // Check if we need to handle this item specially
                // Some item types cannot be directly parented to frames
                if (itemType === 'connector') {
                    return `Cannot assign connectors to a parent frame. Operation aborted.`;
                }
                
                // Check for frame inside frame - not supported by API
                if (itemType === 'frame') {
                    try {
                        // Get parent type to confirm it's a frame
                        const parentResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${requestBody.parent.id}`);
                        const parentType = parentResponse.data.type;
                        
                        if (parentType === 'frame') {
                            console.log('Attempting to position a frame within a frame. The API does not support this although the UI does.');
                            return `Cannot position a frame within another frame using the API (error 3.0206). This is a limitation of the Miro API, even though the UI allows it. Try positioning the frame on the canvas instead.`;
                        }
                    } catch (parentError) {
                        console.error(`Error checking parent type: ${parentError}`);
                    }
                }
            } catch (error) {
                console.error(`Error checking item compatibility: ${error}`);
                // Continue with the operation even if the check fails
            }
        }
        
        const url = `/v2/boards/${miroBoardId}/items/${item_id}`;
        console.log(`Executing mcp_miro_update_item_position_or_parent: PATCH ${url}`);
        
        // Check if we need parent geometry for position validation
        let parentGeometry;
        let referenceSystem;
        
        if (requestBody.position && requestBody.parent?.id) {
            try {
                // Get parent item to retrieve its dimensions
                const parentResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${requestBody.parent.id}`);
                parentGeometry = parentResponse.data.geometry;
                
                // Check for reference system in the position
                if (requestBody.position.relativeTo) {
                    referenceSystem = requestBody.position.relativeTo;
                } else if ('__relativeTo' in requestBody.position) {
                    referenceSystem = requestBody.position.__relativeTo;
                }
                
                // Validate position based on reference system and parent geometry
                if (referenceSystem && typeof referenceSystem === 'string' && referenceSystem.startsWith('parent_')) {
                    const validationResult = validateChildPosition(
                        requestBody.position, 
                        parentGeometry, 
                        referenceSystem
                    );
                    
                    if (!validationResult.valid) {
                        return validationResult.message || 'Invalid position for parent-child relationship';
                    }
                }
            } catch (error) {
                console.error(`Error validating parent-child positioning: ${error}`);
                // Continue with the operation even if validation fails
            }
        }
        
        // Normalize position values
        const normalizedPosition = normalizePositionValues(requestBody.position);
        
        // If we have parent-relative positioning, we need to translate coordinates
        if (normalizedPosition && requestBody.parent?.id && parentGeometry) {
            // Check what reference system was being used (stored during normalization)
            const refSystem = normalizedPosition.__refSystem as string || 'parent_top_left';
            
            // Get parent dimensions
            const parentWidth = parentGeometry.width || 0;
            const parentHeight = parentGeometry.height || 0;
            
            console.log(`Translating coordinates from ${refSystem} to parent_top_left (API format)`);
            console.log(`Parent dimensions: ${parentWidth}x${parentHeight}`);
            
            // Original coordinates
            const x = normalizedPosition.x as number;
            const y = normalizedPosition.y as number;
            
            // Transform coordinates based on reference system
            if (refSystem === 'parent_center') {
                // Convert from parent center to parent top-left
                normalizedPosition.x = x + (parentWidth / 2);
                normalizedPosition.y = y + (parentHeight / 2);
                console.log(`Translated from parent_center: (${x},${y}) -> (${normalizedPosition.x},${normalizedPosition.y})`);
            } 
            else if (refSystem === 'parent_bottom_right') {
                // Convert from parent bottom-right to parent top-left
                normalizedPosition.x = parentWidth - x;
                normalizedPosition.y = parentHeight - y;
                console.log(`Translated from parent_bottom_right: (${x},${y}) -> (${normalizedPosition.x},${normalizedPosition.y})`);
            } 
            else if (refSystem === 'parent_percentage') {
                // Convert from percentage to absolute values based on parent dimensions
                normalizedPosition.x = (x / 100) * parentWidth;
                normalizedPosition.y = (y / 100) * parentHeight;
                console.log(`Translated from parent_percentage: (${x}%,${y}%) -> (${normalizedPosition.x},${normalizedPosition.y})`);
            }
            
            // Remove all internal tracking properties before API call
            delete normalizedPosition.__refSystem;
            delete normalizedPosition.__isPercentageX;
            delete normalizedPosition.__isPercentageY;
            delete normalizedPosition.__originalX;
            delete normalizedPosition.__originalY;
            
            // parent_top_left is already in the format Miro expects, no translation needed
        }
        
        // Handle data conversion if necessary
        const patchData: Record<string, unknown> = {
            ...(normalizedPosition && { position: normalizedPosition }),
            ...(requestBody.parent && { parent: requestBody.parent }),
        };
        
        // Handle data.content -> data.title conversion for frames
        if (requestBody.data) {
            try {
                // Get the item type to check if it's a frame
                const itemResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${item_id}`);
                const itemType = itemResponse.data.type;
                
                if (itemType === 'frame' && requestBody.data.content && !requestBody.data.title) {
                    console.log('Converting content to title for frame');
                    patchData.data = {
                        ...requestBody.data,
                        title: requestBody.data.content
                    };
                    // Remove the content property if it exists in data
                    if (patchData.data && typeof patchData.data === 'object') {
                        const dataObj = patchData.data as Record<string, unknown>;
                        delete dataObj.content;
                    }
                } else {
                    patchData.data = requestBody.data;
                }
            } catch (error) {
                console.error(`Error checking item type for data conversion: ${error}`);
                // Continue with the operation even if the check fails
                patchData.data = requestBody.data;
            }
        }
        
        console.log(`With body: ${JSON.stringify(patchData)}`);
        try {
            const response = await miroClient.patch(url, patchData);
            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Tool: Item Deletion Operations
const deleteItemSchema = z.object({
    item_id: z.string().describe('Unique identifier (ID) of the item to delete.')
});

type DeleteItemParams = z.infer<typeof deleteItemSchema>;

export const itemDeletionOperationsTool: ToolDefinition<DeleteItemParams> = {
    name: 'mcp_miro_item_deletion_operations',
    description: 'Permanently removes any item from a Miro board using its unique identifier. This operation is immediate and irreversible - deleted items cannot be recovered. Use this tool when you need to clean up a board by removing outdated, incorrect, or unnecessary elements. It works with all item types including shapes, sticky notes, frames, connectors, and media. When an item is deleted, all connections to it (like connector lines) may become orphaned or are automatically removed depending on the item type. For frames, deleting the frame does not delete the items inside it - they will remain on the board but will no longer be contained within the frame. Always verify the item ID before deletion to avoid removing critical content.',
    parameters: deleteItemSchema,
    execute: async (args) => {
        const url = `/v2/boards/${miroBoardId}/items/${args.item_id}`;
        console.log(`Executing mcp_miro_item_deletion_operations: DELETE ${url}`);
        try {
            const response = await miroClient.delete(url);
            console.log(`API Call Successful: ${response.status}`);
            // 204 No Content on successful deletion
            return `Item ${args.item_id} deleted successfully (Status: ${response.status}).`;
        } catch (error) {
            return formatApiError(error);
        }
    },
}; 