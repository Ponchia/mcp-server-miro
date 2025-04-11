import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { normalizeGeometryValues, normalizePositionValues, normalizeStyleValues, modificationHistory } from '../utils/data-utils';
import { MCP_POSITIONING_GUIDE } from '../schemas/position-schema';

// Frame Operation schemas
const FrameDataSchema = z.object({
    title: z.string().optional().describe('Title of the frame.'),
});

const FrameStyleSchema = z.object({
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Frame background hex color.')
});

const FrameOperationsSchema = z.object({
    action: z.enum(['create', 'get', 'get_all', 'get_items', 'update', 'delete']).describe('The action to perform on frames.'),
    item_id: z.string().optional().describe('The frame ID (required for get, get_items, update, delete actions).'),
    data: FrameDataSchema.optional().describe('Frame data for create or update actions.'),
    style: FrameStyleSchema.optional().describe('Frame styling for create or update actions.'),
    position: z.object({
        x: z.number().describe('X-axis coordinate in pixels.'),
        y: z.number().describe('Y-axis coordinate in pixels.'),
        origin: z.enum(['center']).optional().default('center').describe('Origin point for coordinates, currently only "center" is supported.'),
        relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().default('canvas_center').describe('Coordinate system reference. Use "canvas_center" for absolute positioning on the board. Use "parent_top_left" only when positioning items inside a frame.')
    }).optional().describe('Position for create or update actions. When creating a frame, position is relative to the canvas center by default.'),
    geometry: z.object({
        width: z.number().optional().describe('Width in pixels.'),
        height: z.number().optional().describe('Height in pixels.'),
        rotation: z.number().optional().describe('Rotation angle in degrees.'),
    }).optional().describe('Dimensions for create or update actions.')
}).refine(
    data => !(['get', 'get_items', 'update', 'delete'].includes(data.action)) || data.item_id, 
    { message: 'item_id is required for get, get_items, update, and delete actions', path: ['item_id'] }
);

type FrameOperationsParams = z.infer<typeof FrameOperationsSchema>;

// Group Operation schemas
const GroupOperationsSchema = z.object({
    action: z.enum(['create', 'get_all', 'get', 'get_items', 'update', 'ungroup', 'delete']).describe('The action to perform on groups.'),
    group_id: z.string().optional().describe('The group ID (required for get, get_items, update, ungroup, delete actions).'),
    item_ids: z.array(z.string()).optional().describe('Array of item IDs (required for create and update actions).')
}).refine(
    data => !(['get', 'get_items', 'update', 'ungroup', 'delete'].includes(data.action)) || data.group_id, 
    { message: 'group_id is required for get, get_items, update, ungroup, and delete actions', path: ['group_id'] }
).refine(
    data => !(['create', 'update'].includes(data.action)) || data.item_ids, 
    { message: 'item_ids is required for create and update actions', path: ['item_ids'] }
);

type GroupOperationsParams = z.infer<typeof GroupOperationsSchema>;

// Tag Operation schemas
const TagDataSchema = z.object({
    title: z.string().min(1).max(128).describe('Tag name/title.'),
    fillColor: z.enum(['red', 'light_green', 'cyan', 'yellow', 'magenta', 'green', 'blue', 'gray', 'violet', 'dark_green', 'dark_blue', 'black']).optional().describe('Background color name. Use named colors only, not hex codes.'),
});

const TagOperationsSchema = z.object({
    action: z.enum(['create', 'get_all', 'get', 'update', 'delete']).describe('The action to perform on tags.'),
    tag_id: z.string().optional().describe('The tag ID (required for get, update, and delete actions).'),
    data: TagDataSchema.optional().describe('Tag data for create or update actions.'),
}).refine(
    data => !(['get', 'update', 'delete'].includes(data.action)) || data.tag_id, 
    { message: 'tag_id is required for get, update, and delete actions', path: ['tag_id'] }
).refine(
    data => !(['create', 'update'].includes(data.action)) || data.data, 
    { message: 'data is required for create and update actions', path: ['data'] }
);

type TagOperationsParams = z.infer<typeof TagOperationsSchema>;

// Tag-Item Operation schemas
const TagItemOperationsSchema = z.object({
    action: z.enum(['attach', 'detach', 'get_items_with_tag']).describe('The tag operation to perform.'),
    tag_id: z.string().describe('The tag ID.'),
    item_id: z.string().optional().describe('The item ID (required for attach and detach actions).'),
}).refine(
    data => !(['attach', 'detach'].includes(data.action)) || data.item_id, 
    { message: 'item_id is required for attach and detach actions', path: ['item_id'] }
);

type TagItemOperationsParams = z.infer<typeof TagItemOperationsSchema>;

// Update frame operations tool with enhanced positioning guide
export const frameOperationsTool: ToolDefinition<FrameOperationsParams> = {
    name: 'mcp_miro_frame_operations',
    description: `Creates and manages containment areas (frames) that visually organize content on Miro boards. Use this tool to: (1) create - add new rectangular containers with customizable size, position, and background color, (2) get - retrieve a specific frame's details, (3) get_all - list all frames on the board, (4) get_items - list all items contained within a specific frame, (5) update - modify an existing frame's properties, (6) delete - remove a frame entirely. Frames are rectangular containers that visually group related items and can have titles for labeling sections of your board. When items are placed inside a frame, they become children of that frame and move with it when the frame is repositioned.

${MCP_POSITIONING_GUIDE}

FRAME-SPECIFIC NOTES: Frame deletion will not delete its contained items - they will remain on the board but will no longer be contained within the frame. Frames cannot be nested inside other frames via API.`,
    parameters: FrameOperationsSchema,
    execute: async (args) => {
        const { action, item_id, ...requestBody } = args;
        let url = '';
        let method = '';
        let body = null;
        let queryParams = {};

        // Normalize geometry values
        const normalizedGeometry = normalizeGeometryValues(requestBody.geometry);
        
        // Normalize position values but preserve relativeTo for validation
        let positionHasRelativeTo = false;
        let relativeTo = 'canvas_center';  // Default value
        
        if (requestBody.position && 'relativeTo' in requestBody.position) {
            positionHasRelativeTo = true;
            relativeTo = requestBody.position.relativeTo as string;
        }
        
        // Normalize position values
        const normalizedPosition = normalizePositionValues(requestBody.position);
        
        // Add validation warning for parent_top_left without parent
        if (positionHasRelativeTo && relativeTo === 'parent_top_left' && action === 'create') {
            console.warn(`Warning: relativeTo="parent_top_left" is specified for a frame, but frames cannot be parented to other frames. Using canvas_center instead.`);
            // Force relativeTo to be canvas_center for frames
            if (normalizedPosition) {
                (normalizedPosition as Record<string, unknown>).relativeTo = 'canvas_center';
            }
        }
        
        // Normalize style values
        const normalizedStyle = normalizeStyleValues(requestBody.style);

        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/frames`;
                method = 'post';
                body = {
                    ...(requestBody.data && { data: requestBody.data }),
                    ...(normalizedStyle && { style: normalizedStyle }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                    ...(normalizedGeometry && { geometry: normalizedGeometry }),
                };
                break;
            case 'get_all':
                // Get all frames on the board by using the items endpoint with type=frame
                url = `/v2/boards/${miroBoardId}/items`;
                method = 'get';
                queryParams = { type: 'frame' };
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/frames/${item_id}`;
                method = 'get';
                break;
            case 'get_items':
                // Use the items endpoint with parent_item_id parameter instead of the nested path
                url = `/v2/boards/${miroBoardId}/items`;
                method = 'get';
                // Add query parameters
                queryParams = { parent_item_id: item_id };
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/frames/${item_id}`;
                method = 'patch';
                body = {
                    ...(requestBody.data && { data: requestBody.data }),
                    ...(normalizedStyle && { style: normalizedStyle }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                    ...(normalizedGeometry && { geometry: normalizedGeometry }),
                };
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/frames/${item_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing frame_operations (${action}): ${method.toUpperCase()} ${url}`);
        if (body) {
            console.log(`With body: ${JSON.stringify(body)}`);
        }

        try {
            let response;

            if (method === 'get') {
                response = await miroClient.get(url, { params: queryParams });
            } else if (method === 'post') {
                response = await miroClient.post(url, body);
                // Track creation in history
                if (response.data) {
                    modificationHistory.trackCreation(response.data);
                }
            } else if (method === 'patch') {
                response = await miroClient.patch(url, body);
                // Track modification in history
                if (response.data) {
                    modificationHistory.trackModification(response.data);
                }
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    return `Frame ${item_id} deleted successfully (Status: ${response.status}).`;
                }
            }

            if (!response) {
                throw new Error(`Invalid method: ${method}`);
            }

            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            // Enhance error reporting for positioning issues
            if (error && typeof error === 'object' && 'response' in error) {
                const errorResponse = (error as { 
                    response: { 
                        status: number; 
                        data?: { 
                            message?: string; 
                            error?: string; 
                        } 
                    } 
                }).response;
                if (errorResponse?.status === 400) {
                    const errorData = errorResponse.data;
                    const errorMessage = errorData?.message || errorData?.error || JSON.stringify(errorData);
                    
                    // Check for position-related errors
                    if (typeof errorMessage === 'string' && 
                        (errorMessage.includes('position') || errorMessage.includes('outside of parent'))) {
                        
                        return formatApiError(error, `Position Error: ${errorMessage}. For frames, use "relativeTo": "canvas_center". When positioning items inside frames, use "relativeTo": "parent_top_left" and ensure coordinates are within the frame's bounds.`);
                    }
                }
            }
            
            return formatApiError(error);
        }
    },
};

// Fully implemented group operations tool
export const groupOperationsTool: ToolDefinition<GroupOperationsParams> = {
    name: 'mcp_miro_group_operations',
    description: 'Binds multiple items together so they can be moved, copied, or manipulated as a single unit. Use this tool to: (1) create - form a new group from an array of item IDs, (2) get_all - list all groups on the board, (3) get - retrieve a specific group\'s details, (4) get_items - list all items contained in a specific group, (5) update - modify which items belong to a group, (6) ungroup - break a group apart while keeping the individual items, (7) delete - remove both the group and all its items entirely. Groups differ from frames in that they don\'t have visual containers or titles - they\'re invisible logical collections that keep items bound together during manipulation. Items can only belong to one group at a time. Unlike frames, grouped items maintain their absolute positions on the board. Groups are ideal for connecting related elements that need to move together during board reorganization but don\'t require a visual container. The ungroup operation preserves all items while delete removes everything.',
    parameters: GroupOperationsSchema,
    execute: async (args) => {
        const { action, group_id, item_ids } = args;
        let url = '';
        let method = '';
        let body = null;
        const queryParams: Record<string, string> = {};

        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/groups`;
                method = 'post';
                body = { data: { items: item_ids } };
                break;
            case 'get_all':
                url = `/v2/boards/${miroBoardId}/groups`;
                method = 'get';
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/groups/${group_id}`;
                method = 'get';
                break;
            case 'get_items':
                url = `/v2/boards/${miroBoardId}/groups/${group_id}/items`;
                method = 'get';
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/groups/${group_id}`;
                method = 'put';
                body = { data: { items: item_ids } };
                break;
            case 'ungroup':
                url = `/v2/boards/${miroBoardId}/groups/${group_id}/ungroup`;
                method = 'delete';
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/groups/${group_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing group_operations (${action}): ${method.toUpperCase()} ${url}`);
        if (body) {
            console.log(`With body: ${JSON.stringify(body)}`);
        }

        try {
            let response;

            if (method === 'get') {
                if (Object.keys(queryParams).length > 0) {
                    response = await miroClient.get(url, { params: queryParams });
                } else {
                    response = await miroClient.get(url);
                }
            } else if (method === 'post') {
                response = await miroClient.post(url, body);
                // Track creation in history
                if (response.data) {
                    modificationHistory.trackCreation(response.data);
                }
            } else if (method === 'put') {
                response = await miroClient.put(url, body);
                // Track modification in history
                if (response.data) {
                    modificationHistory.trackModification(response.data);
                }
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    const successMsg = action === 'ungroup' 
                        ? `Items in group ${group_id} ungrouped successfully (Status: ${response.status}).`
                        : `Group ${group_id} deleted successfully (Status: ${response.status}).`;
                    return successMsg;
                }
            }

            if (!response) {
                throw new Error(`Invalid method: ${method}`);
            }

            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Fully implemented tag operations tool
export const tagOperationsTool: ToolDefinition<TagOperationsParams> = {
    name: 'mcp_miro_tag_operations',
    description: 'Creates and manages categorization labels (tags) that can be applied to multiple items across a board. Use this tool to: (1) create - define a new tag with a name and color, (2) get_all - list all tags on the board, (3) get - retrieve a specific tag\'s details, (4) update - modify a tag\'s name or color, (5) delete - remove a tag entirely. Tags are visual labels with text and background color that identify related items across a board regardless of position. Unlike groups or frames, tags don\'t affect item positioning - they provide pure categorization and filtering capabilities. Tags support 12 predefined colors (not hex codes): red, light_green, cyan, yellow, magenta, green, blue, gray, violet, dark_green, dark_blue, and black. The maximum tag name length is 128 characters. Creating or updating tags only defines the tag - to attach tags to items, use the tag_item_operations tool. Tags are ideal for implementing cross-cutting categorization, status indicators, or priority levels across diverse board content.',
    parameters: TagOperationsSchema,
    execute: async (args) => {
        const { action, tag_id, data } = args;
        let url = '';
        let method = '';
        let body = null;

        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/tags`;
                method = 'post';
                body = data;
                break;
            case 'get_all':
                url = `/v2/boards/${miroBoardId}/tags`;
                method = 'get';
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}`;
                method = 'get';
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}`;
                method = 'patch';
                body = data;
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing tag_operations (${action}): ${method.toUpperCase()} ${url}`);
        if (body) {
            console.log(`With body: ${JSON.stringify(body)}`);
        }

        try {
            let response;

            if (method === 'get') {
                response = await miroClient.get(url);
            } else if (method === 'post') {
                response = await miroClient.post(url, body);
                // Track creation in history
                if (response.data) {
                    modificationHistory.trackCreation(response.data);
                }
            } else if (method === 'patch') {
                response = await miroClient.patch(url, body);
                // Track modification in history
                if (response.data) {
                    modificationHistory.trackModification(response.data);
                }
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    return `Tag ${tag_id} deleted successfully (Status: ${response.status}).`;
                }
            }

            if (!response) {
                throw new Error(`Invalid method: ${method}`);
            }

            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
};

// Fully implemented tag-item operations tool
export const tagItemOperationsTool: ToolDefinition<TagItemOperationsParams> = {
    name: 'mcp_miro_tag_item_operations',
    description: 'Associates or disassociates tags with specific items on a Miro board. Use this tool to: (1) attach - apply an existing tag to a specific item, making the tag visible on that item, (2) detach - remove a tag from a specific item without deleting the tag itself, (3) get_items_with_tag - retrieve all items currently tagged with a specific tag. Tags must be created first using the tag_operations tool before they can be attached to items. Multiple different tags can be attached to the same item, creating multi-dimensional categorization. When tags are attached to items, they appear visually on those items in the Miro UI with their specified color and name. This tool only manages the relationships between tags and items - it doesn\'t create or modify the tags themselves. Use this for implementing filtering systems, marking status across different board elements, or creating visual categorization schemes that cut across different item types and board sections.',
    parameters: TagItemOperationsSchema,
    execute: async (args) => {
        const { action, tag_id, item_id } = args;
        let url = '';
        let method = '';

        switch (action) {
            case 'attach':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}/items/${item_id}`;
                method = 'post';
                break;
            case 'detach':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}/items/${item_id}`;
                method = 'delete';
                break;
            case 'get_items_with_tag':
                url = `/v2/boards/${miroBoardId}/tags/${tag_id}/items`;
                method = 'get';
                break;
        }

        console.log(`Executing tag_item_operations (${action}): ${method.toUpperCase()} ${url}`);

        try {
            let response;

            if (method === 'get') {
                response = await miroClient.get(url);
            } else if (method === 'post') {
                response = await miroClient.post(url);
                // Mark modified items for tag attachment
                if (response.data && item_id) {
                    // When attaching a tag to an item, track the item as modified
                    const modifiedItemData = { id: item_id, type: 'unknown', tags: [tag_id] };
                    modificationHistory.trackModification(modifiedItemData);
                }
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    return `Tag ${tag_id} removed from item ${item_id} successfully (Status: ${response.status}).`;
                }
            }

            if (!response) {
                throw new Error(`Invalid method: ${method}`);
            }

            console.log(`API Call Successful: ${response.status}`);
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    },
}; 