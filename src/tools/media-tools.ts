import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { normalizeGeometryValues, normalizePositionValues, modificationHistory } from '../utils/data-utils';
import { MCP_POSITIONING_GUIDE } from '../schemas/position-schema';

// Schema definitions for media operations
const MediaItemSchema = z.object({
    action: z.enum(['create', 'get', 'get_all', 'update', 'delete']).describe('The action to perform.'),
    type: z.enum(['image', 'document', 'embed', 'preview']).describe('The type of media item.'),
    item_id: z.string().optional().describe('Item ID (required for get, update, delete actions).'),
    data: z.object({
        // Common URL property for all media types
        url: z.string().url().describe('URL of the media content.'),
        // Optional properties - not available for embed type
        title: z.string().optional().describe('Title for the item (not supported for embed type).'),
        altText: z.string().optional().describe('Alt text (for images).'),
        // Embed-specific properties
        mode: z.enum(['inline', 'modal']).optional().describe('Display mode (for embeds).'),
        previewUrl: z.string().url().optional().describe('Preview image URL (for embeds).'),
    }).optional().describe('Media data based on type.'),
    position: z.object({
        x: z.number().describe('X-axis coordinate.'),
        y: z.number().describe('Y-axis coordinate.'),
        origin: z.enum(['center']).optional().describe('Origin point for coordinates.'),
        relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().describe('Coordinate system reference.')
    }).optional().describe('Position on the board.'),
    geometry: z.object({
        width: z.number().optional().describe('Width in pixels.'),
        height: z.number().optional().describe('Height in pixels.'),
        rotation: z.number().optional().describe('Rotation angle in degrees (not available for embeds).'),
    }).optional().describe('Dimensions and rotation (fixed ratio for most media types).'),
    parent: z.object({ id: z.string() }).optional().describe('Parent frame ID.')
}).refine(
    data => !(['get', 'update', 'delete'].includes(data.action)) || data.item_id, 
    { message: 'item_id is required for get, update, and delete actions', path: ['item_id'] }
).refine(
    data => !(['create'].includes(data.action)) || data.data, 
    { message: 'data is required for create action', path: ['data'] }
).refine(
    data => !(['create'].includes(data.action)) || data.data?.url, 
    { message: 'data.url is required for create action', path: ['data', 'url'] }
).refine(
    data => !(data.type === 'embed' && data.data?.title), 
    { message: 'title is not supported for embed type', path: ['data', 'title'] }
);

type MediaItemOperationsParams = z.infer<typeof MediaItemSchema>;

// Fully implemented media item operations tool
export const mediaItemOperationsTool: ToolDefinition<MediaItemOperationsParams> = {
    name: 'mcp_miro_media_item_operations',
    description: `Adds and manages visual media content on Miro boards with the following operations: (1) create - place new media by URL, (2) get - retrieve a specific media item's details, (3) get_all - list all media of a particular type, (4) update - modify existing media properties, (5) delete - remove media items. Supports four distinct media types: images (photos, diagrams, icons, logos), documents (PDFs shown as thumbnails), embeds (interactive web content), and previews (URL link previews).

${MCP_POSITIONING_GUIDE}

MEDIA-SPECIFIC NOTES:
• Images provide visual illustration and maintain aspect ratio
• Documents display multipage content that users can browse
• Embeds show interactive web content in inline or modal mode
• Previews display link metadata with thumbnails
• All media requires a valid URL source

For creation, the data.url parameter is required. Images and documents maintain their aspect ratio automatically, so typically only specify width. Use this tool to add visual elements like screenshots, logos, diagrams, webpage previews, or PDF documentation to enhance board content with rich media.`,
    parameters: MediaItemSchema,
    execute: async (args) => {
        const { action, type, item_id, data, position, geometry, parent } = args;
        let url = '';
        let method = '';
        let body = null;
        let queryParams: Record<string, string> = {};

        // Process data fields for different media types
        const processedData = data ? { ...data } : undefined;
        if (processedData && type === 'embed' && 'title' in processedData) {
            // Remove title field for embed type as it's not supported by Miro API
            delete processedData.title;
        }

        // Normalize geometry values
        let processedGeometry = normalizeGeometryValues(geometry);
        
        // Handle geometry constraints for media items with fixed aspect ratio
        if (['image', 'document', 'preview'].includes(type) && processedGeometry) {
            // For items with fixed aspect ratio, only include one dimension (width or height)
            if (processedGeometry.width && processedGeometry.height) {
                // Keep only width for the fixed aspect ratio
                const { width } = processedGeometry;
                processedGeometry = { width };
            }
        }
        
        // Normalize position values
        const normalizedPosition = normalizePositionValues(position);

        // Construct the URL based on action and type
        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/${type}s`;
                method = 'post';
                body = {
                    ...(processedData && { data: processedData }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                    ...(processedGeometry && { geometry: processedGeometry }),
                    ...(parent && { parent }),
                };
                break;
            case 'get_all':
                url = `/v2/boards/${miroBoardId}/items`;
                method = 'get';
                queryParams = { type };
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/${type}s/${item_id}`;
                method = 'get';
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/${type}s/${item_id}`;
                method = 'patch';
                body = {
                    ...(processedData && { data: processedData }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                    ...(processedGeometry && { geometry: processedGeometry }),
                    ...(parent && { parent }),
                };
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/${type}s/${item_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing media_item_operations (${action} ${type}): ${method.toUpperCase()} ${url}`);
        if (body) {
            console.log(`With body: ${JSON.stringify(body)}`);
        }
        if (Object.keys(queryParams).length > 0) {
            console.log(`With query params: ${JSON.stringify(queryParams)}`);
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
            } else if (method === 'patch') {
                response = await miroClient.patch(url, body);
                // Track modification in history
                if (response.data) {
                    modificationHistory.trackModification(response.data);
                }
            } else if (method === 'delete') {
                response = await miroClient.delete(url);
                if (response.status === 204) {
                    return `${type} item ${item_id} deleted successfully (Status: ${response.status}).`;
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