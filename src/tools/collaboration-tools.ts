import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { normalizeGeometryValues, normalizePositionValues, normalizeStyleValues, modificationHistory } from '../utils/data-utils';

// Widget operations schema
const WidgetOperationsSchema = z.object({
    action: z.enum(['create_comment', 'get_comments', 'get_comment', 'update_comment', 'resolve_comment', 'delete_comment']).describe('The action to perform.'),
    comment_id: z.string().optional().describe('Comment ID (required for get_comment, update_comment, resolve_comment, delete_comment actions).'),
    // Create/update properties
    data: z.object({
        content: z.string().optional().describe('Comment text content.'),
        itemId: z.string().optional().describe('Associated item ID.'),
        position: z.object({
            x: z.number().describe('X position on the board.'),
            y: z.number().describe('Y position on the board.'),
        }).optional().describe('Comment position (for standalone comments).'),
        // Additional potential fields based on Miro API
        permissions: z.object({
            edit: z.boolean().optional().describe('Whether the comment can be edited.'),
            delete: z.boolean().optional().describe('Whether the comment can be deleted.'),  
        }).optional().describe('Comment permissions.'),
    }).optional().describe('Comment data.'),
    // List options
    cursor: z.string().optional().describe('Pagination cursor (for get_comments action).'),
    limit: z.string().optional().describe('Maximum results per call (for get_comments action).'),
})
.refine(
    data => !(['get_comment', 'update_comment', 'resolve_comment', 'delete_comment'].includes(data.action)) || data.comment_id, 
    { message: 'comment_id is required for get_comment, update_comment, resolve_comment, delete_comment actions', path: ['comment_id'] }
)
.refine(
    data => !(['create_comment'].includes(data.action)) || data.data, 
    { message: 'data is required for create_comment action', path: ['data'] }
)
.refine(
    data => !(['create_comment'].includes(data.action)) || data.data?.content, 
    { message: 'data.content is required for create_comment action', path: ['data', 'content'] }
);

type WidgetOperationsParams = z.infer<typeof WidgetOperationsSchema>;

// Collaboration operations schema
const CollaborationOperationsSchema = z.object({
    action: z.enum(['get_board_members', 'share_board', 'update_member', 'remove_member', 'get_organization_members']).describe('The action to perform.'),
    // Sharing and member management
    user_email: z.string().email().optional().describe('User email (for share_board).'),
    user_id: z.string().optional().describe('User ID (for update_member, remove_member).'),
    role: z.enum(['viewer', 'commenter', 'editor', 'coowner']).optional().describe('User role (for share_board, update_member).'),
    // List options
    cursor: z.string().optional().describe('Pagination cursor.'),
    limit: z.string().optional().describe('Maximum results per call.'),
})
.refine(
    data => !(['share_board'].includes(data.action)) || data.user_email, 
    { message: 'user_email is required for share_board action', path: ['user_email'] }
)
.refine(
    data => !(['share_board'].includes(data.action)) || data.role, 
    { message: 'role is required for share_board action', path: ['role'] }
)
.refine(
    data => !(['update_member', 'remove_member'].includes(data.action)) || data.user_id, 
    { message: 'user_id is required for update_member and remove_member actions', path: ['user_id'] }
);

type CollaborationOperationsParams = z.infer<typeof CollaborationOperationsSchema>;

// App Card Operation schemas
const CustomFieldSchema = z.object({
    value: z.string().optional().describe('Field value text.'),
    tooltip: z.string().optional().describe('Tooltip text.'),
    iconUrl: z.string().url().optional().describe('URL for field icon.'),
    iconShape: z.enum(['round', 'square']).optional().default('round').describe('Shape of the icon.'),
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Background hex color of the field.'),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Text color.'),
});

const AppCardDataSchema = z.object({
    title: z.string().optional().default('sample app card item').describe('Header text for the app card.'),
    description: z.string().optional().describe('Description text.'),
    fields: z.array(CustomFieldSchema).optional().describe('Array of custom fields displayed on the card.'),
    status: z.enum(['disconnected', 'connected', 'disabled']).optional().default('disconnected').describe('Connection status with the source.')
});

const AppCardStyleSchema = z.object({
    fillColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color for the app card border. Default: #2d9bf0.')
});

const AppCardItemSchema = z.object({
    data: AppCardDataSchema.describe('Data for the app card.'),
    style: AppCardStyleSchema.optional().describe('Styling for the app card.'),
    position: z.object({
        x: z.number().describe('X-axis coordinate.'),
        y: z.number().describe('Y-axis coordinate.'),
        origin: z.enum(['center']).optional().describe('Origin point for coordinates.'),
        relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().describe('Coordinate system reference.')
    }).optional().describe('Position on the board.'),
    geometry: z.object({
        width: z.number().optional().describe('Width in pixels.'),
        height: z.number().optional().describe('Height in pixels.'),
        rotation: z.number().optional().describe('Rotation angle in degrees.'),
    }).optional().describe('Dimensions and rotation.'),
    parent: z.object({ id: z.string().optional() }).optional().describe('Parent frame ID.')
}).passthrough();

type AppCardItemParams = z.infer<typeof AppCardItemSchema>;

// Widget operations tool (comments, feedback)
export const widgetOperationsTool: ToolDefinition<WidgetOperationsParams> = {
    name: 'mcp_miro_widget_operations',
    description: 'Manages comments on Miro boards for team feedback and collaboration. Use this tool to: (1) create_comment - add a new comment, either standalone or attached to an item, (2) get_comments - retrieve all comments on the board with pagination support, (3) get_comment - fetch a specific comment by ID, (4) update_comment - modify an existing comment\'s text content, (5) resolve_comment - mark comments as resolved in feedback workflows, (6) delete_comment - permanently remove comments. For creating comments, provide content text and either a position or itemId to attach it to. Comments can be created as standalone objects positioned anywhere on the board or attached directly to existing items.',
    parameters: WidgetOperationsSchema,
    execute: async (args) => {
        const { action, comment_id, data, cursor, limit } = args;
        let url = '';
        let method = '';
        const queryParams: Record<string, string> = {};
        let body = null;

        // Construct the URL based on action
        switch (action) {
            case 'create_comment':
                url = `/v2/boards/${miroBoardId}/comments`;
                method = 'post';
                body = data;
                break;
            case 'get_comments':
                url = `/v2/boards/${miroBoardId}/comments`;
                method = 'get';
                if (cursor) queryParams.cursor = cursor;
                if (limit) queryParams.limit = limit;
                break;
            case 'get_comment':
                url = `/v2/boards/${miroBoardId}/comments/${comment_id}`;
                method = 'get';
                break;
            case 'update_comment':
                url = `/v2/boards/${miroBoardId}/comments/${comment_id}`;
                method = 'patch';
                body = { data };
                break;
            case 'resolve_comment':
                url = `/v2/boards/${miroBoardId}/comments/${comment_id}/resolve`;
                method = 'put';
                break;
            case 'delete_comment':
                url = `/v2/boards/${miroBoardId}/comments/${comment_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing widget_operations (${action}): ${method.toUpperCase()} ${url}`);
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
            } else if (method === 'put') {
                response = await miroClient.put(url);
                // Track resolution as a modification
                if (comment_id) {
                    const modifiedItemData = { id: comment_id, type: 'comment', status: 'resolved' };
                    modificationHistory.trackModification(modifiedItemData);
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
                    return `Comment ${comment_id} deleted successfully (Status: ${response.status}).`;
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
    }
};

// Collaboration operations tool (members, sharing)
export const collaborationOperationsTool: ToolDefinition<CollaborationOperationsParams> = {
    name: 'mcp_miro_collaboration_operations',
    description: 'Manages board access, permissions, and team collaboration settings. Use this tool to: (1) get_board_members - list all current users with access to the board, (2) share_board - invite new users by email with specific roles (viewer, commenter, editor, coowner), (3) update_member - change an existing member\'s permission level, (4) remove_member - revoke a user\'s access entirely, (5) get_organization_members - retrieve organization-wide user list for reference. When sharing with new users, you must specify both user_email and role parameters. User roles control what actions members can perform: viewers can only view, commenters can add feedback, editors can modify content, and coowners have full control including permissions management.',
    parameters: CollaborationOperationsSchema,
    execute: async (args) => {
        const { action, user_email, user_id, role, cursor, limit } = args;
        let url = '';
        let method = '';
        const queryParams: Record<string, string> = {};
        let body = null;

        // Construct the URL based on action
        switch (action) {
            case 'get_board_members':
                url = `/v2/boards/${miroBoardId}/members`;
                method = 'get';
                if (cursor) queryParams.cursor = cursor;
                if (limit) queryParams.limit = limit;
                break;
            case 'share_board':
                url = `/v2/boards/${miroBoardId}/members`;
                method = 'post';
                body = { 
                    emails: [user_email],
                    role: role
                };
                break;
            case 'update_member':
                url = `/v2/boards/${miroBoardId}/members/${user_id}`;
                method = 'patch';
                body = { role };
                break;
            case 'remove_member':
                url = `/v2/boards/${miroBoardId}/members/${user_id}`;
                method = 'delete';
                break;
            case 'get_organization_members':
                url = `/v2/organizations/members`;
                method = 'get';
                if (cursor) queryParams.cursor = cursor;
                if (limit) queryParams.limit = limit;
                break;
        }

        console.log(`Executing collaboration_operations (${action}): ${method.toUpperCase()} ${url}`);
        if (body) {
            console.log(`With body: ${JSON.stringify(body)}`);
        }

        try {
            let response;

            if (method === 'get') {
                response = await miroClient.get(url, { params: queryParams });
            } else if (method === 'post') {
                response = await miroClient.post(url, body);
            } else if (method === 'patch') {
                response = await miroClient.patch(url, body);
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    return `Member ${user_id} removed successfully (Status: ${response.status}).`;
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
    }
};

// App card creation tool
export const appCardOperationsTool: ToolDefinition<AppCardItemParams> = {
    name: 'mcp_miro_app_card_operations',
    description: 'Creates interactive app cards that represent external data sources or applications on the board. App cards are specialized containers that visually represent connected applications with rich formatting and custom fields. Use this tool when you need to display structured data like status updates, metrics, or external content. Each app card can include: (1) title and description text, (2) custom fields with icons, tooltips, and color formatting, (3) connection status indicators, and (4) styled containers with custom colors. Cards support customizable fields shown as icon+text pairs with individual styling. App cards can be positioned anywhere on the board or nested inside frames, and their dimensions can be specified. They are ideal for integrating external system information in a visually consistent format.',
    parameters: AppCardItemSchema,
    execute: async (args) => {
        const url = `/v2/boards/${miroBoardId}/app_cards`;
        console.log(`Executing app_card_operations: POST ${url}`);
        
        // Normalize style, geometry, and position values
        const normalizedStyle = normalizeStyleValues(args.style);
        const normalizedGeometry = normalizeGeometryValues(args.geometry);
        const normalizedPosition = normalizePositionValues(args.position);
        
        // If we have parent-relative positioning, we need to translate coordinates
        if (normalizedPosition && args.parent?.id) {
            try {
                // Get parent item to retrieve its dimensions
                const parentResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${args.parent.id}`);
                const parentGeometry = parentResponse.data.geometry;
                
                if (parentGeometry) {
                    // Get reference system that was stored during normalization
                    const refSystem = normalizedPosition.__refSystem as string || 'parent_top_left';
                    
                    // Get parent dimensions
                    const parentWidth = parentGeometry.width || 0;
                    const parentHeight = parentGeometry.height || 0;
                    
                    console.log(`Translating app card coordinates from ${refSystem} to parent_top_left`);
                    console.log(`Parent dimensions: ${parentWidth}x${parentHeight}`);
                    
                    // Original coordinates
                    const x = normalizedPosition.x as number;
                    const y = normalizedPosition.y as number;
                    
                    // Transform coordinates based on reference system
                    if (refSystem === 'parent_center') {
                        normalizedPosition.x = x + (parentWidth / 2);
                        normalizedPosition.y = y + (parentHeight / 2);
                    } 
                    else if (refSystem === 'parent_bottom_right') {
                        normalizedPosition.x = parentWidth - x;
                        normalizedPosition.y = parentHeight - y;
                    } 
                    else if (refSystem === 'parent_percentage') {
                        normalizedPosition.x = (x / 100) * parentWidth;
                        normalizedPosition.y = (y / 100) * parentHeight;
                    }
                }
            } catch (error) {
                console.error(`Error translating app card parent-relative coordinates: ${error}`);
            }
        }
        
        // Create clean body object without using spread operators
        const body: Record<string, unknown> = {};
        
        // Add data if available
        if (args.data) {
            body.data = args.data;
        }
        
        // Clean up position metadata and add to body if available
        if (normalizedPosition) {
            // Create a clean position object without metadata
            body.position = {
                x: normalizedPosition.x,
                y: normalizedPosition.y,
                origin: normalizedPosition.origin || 'center'
            };
        }
        
        // Add style if available
        if (normalizedStyle) {
            body.style = normalizedStyle;
        }
        
        // Add geometry if available
        if (normalizedGeometry) {
            body.geometry = normalizedGeometry;
        }
        
        // Add parent if available and has id
        if (args.parent && typeof args.parent === 'object' && 'id' in args.parent) {
            body.parent = args.parent;
        }
        
        console.log(`With body: ${JSON.stringify(body)}`);
        try {
            const response = await miroClient.post(url, body);
            console.log(`API Call Successful: ${response.status}`);
            
            // Track creation in history
            if (response.data) {
                modificationHistory.trackCreation(response.data);
            }
            
            return formatApiResponse(response.data);
        } catch (error) {
            return formatApiError(error);
        }
    }
}; 