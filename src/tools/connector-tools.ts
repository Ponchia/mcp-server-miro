import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { modificationHistory } from '../utils/data-utils';
import { MCP_POSITIONING_GUIDE } from '../schemas/position-schema';

// Schema definitions for connector operations
const ConnectorOperationsSchema = z.object({
    action: z.enum(['create', 'get', 'get_all', 'update', 'delete']).describe('The action to perform.'),
    connector_id: z.string().optional().describe('Connector ID (required for get, update, delete actions).'),
    // Create/update properties
    startItem: z.object({
        id: z.string().describe('Item ID where connector starts.'),
        position: z.object({
            x: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative X position (e.g., "50%").'),
            y: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative Y position (e.g., "0%").'),
        }).optional().describe('Relative position on start item.'),
        snapTo: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional().describe('Side to snap to on start item.'),
    }).optional().describe('Start item connection details.'),
    endItem: z.object({
        id: z.string().describe('Item ID where connector ends.'),
        position: z.object({
            x: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative X position (e.g., "50%").'),
            y: z.string().regex(/^\d{1,3}(\.\d+)?%$/).describe('Relative Y position (e.g., "0%").'),
        }).optional().describe('Relative position on end item.'),
        snapTo: z.enum(['auto', 'top', 'right', 'bottom', 'left']).optional().describe('Side to snap to on end item.'),
    }).optional().describe('End item connection details.'),
    shape: z.enum(['straight', 'elbowed', 'curved']).optional().default('curved').describe('Connector path type.'),
    captions: z.array(z.object({
        content: z.string().max(200).describe('Caption text (supports inline HTML).'),
        position: z.string().regex(/^\d{1,3}(\.\d+)?%$/).optional().describe('Position along connector.'),
        textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical alignment.'),
    })).max(20).optional().describe('Text captions on the connector.'),
    style: z.object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Caption text color.'),
        strokeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Connector line color.'),
        strokeStyle: z.enum(['normal', 'dotted', 'dashed']).optional().describe('Line style.'),
        strokeWidth: z.string().optional().describe('Line thickness.'),
        startStrokeCap: z.enum(['none', 'stealth', 'rounded_stealth', 'diamond', 'filled_diamond', 'oval', 'filled_oval', 'arrow', 'triangle', 'filled_triangle', 'erd_one', 'erd_many', 'erd_only_one', 'erd_zero_or_one', 'erd_one_or_many', 'erd_zero_or_many', 'unknown']).optional().describe('Start decoration.'),
        endStrokeCap: z.enum(['none', 'stealth', 'rounded_stealth', 'diamond', 'filled_diamond', 'oval', 'filled_oval', 'arrow', 'triangle', 'filled_triangle', 'erd_one', 'erd_many', 'erd_only_one', 'erd_zero_or_one', 'erd_one_or_many', 'erd_zero_or_many', 'unknown']).optional().describe('End decoration.'),
        fontSize: z.string().optional().describe('Caption font size.'),
        textOrientation: z.enum(['horizontal', 'aligned']).optional().describe('Caption orientation.'),
    }).optional().describe('Connector styling.'),
    // List options
    cursor: z.string().optional().describe('Pagination cursor (for get_all action).'),
    limit: z.string().optional().describe('Maximum results per call (10-50, for get_all action).'),
})
.refine(
    data => !(['get', 'update', 'delete'].includes(data.action)) || data.connector_id, 
    { message: 'connector_id is required for get, update, and delete actions', path: ['connector_id'] }
)
.refine(
    data => !(['create'].includes(data.action)) || (data.startItem && data.endItem), 
    { message: 'startItem and endItem are required for create action', path: ['startItem'] }
)
.refine(
    data => {
        // Only check ID equality if both startItem and endItem exist with ID properties
        if (data.startItem && data.endItem && data.startItem.id && data.endItem.id) {
            return data.startItem.id !== data.endItem.id;
        }
        // If we're not checking equality, validation passes
        return true;
    },
    { message: 'startItem.id must be different from endItem.id', path: ['endItem', 'id'] }
);

type ConnectorOperationsParams = z.infer<typeof ConnectorOperationsSchema>;

// Fully implemented connector operations tool
export const connectorOperationsTool: ToolDefinition<ConnectorOperationsParams> = {
    name: 'mcp_miro_connector_operations',
    description: `Creates and manages line connections between items on a Miro board to show relationships and flows. Use this tool to: (1) create - draw new lines between two distinct items with customizable appearance, (2) get - retrieve a specific connector's details by ID, (3) get_all - list all connectors on the board with pagination, (4) update - modify an existing connector's appearance or endpoints, (5) delete - remove a connector entirely.

${MCP_POSITIONING_GUIDE}

CONNECTOR-SPECIFIC POSITIONING:
• For connector endpoints, use relative percentage positions from 0% to 100% 
• Example: {"x": "50%", "y": "0%"} connects to the middle of the top edge
• Alternatively, use snapTo with "auto", "top", "right", "bottom", or "left"

Connectors can be styled with different line types (straight, curved, elbowed), colors, stroke styles (solid, dashed, dotted), endpoints (arrows, diamonds, etc.), and can include up to 20 text captions along their path. When creating connections, you must specify both startItem and endItem with their unique IDs. Ideal for creating flowcharts, relationship diagrams, mind maps, or any visualization that shows connections between concepts.`,
    parameters: ConnectorOperationsSchema,
    execute: async (args) => {
        const { action, connector_id, ...otherArgs } = args;
        let url = '';
        let method = '';
        const queryParams: Record<string, string> = {};
        let body = null;

        // Construct the URL based on action
        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/connectors`;
                method = 'post';
                body = otherArgs;
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/connectors/${connector_id}`;
                method = 'get';
                break;
            case 'get_all':
                url = `/v2/boards/${miroBoardId}/connectors`;
                method = 'get';
                if ('cursor' in otherArgs && otherArgs.cursor) queryParams.cursor = otherArgs.cursor;
                if ('limit' in otherArgs && otherArgs.limit) queryParams.limit = otherArgs.limit;
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/connectors/${connector_id}`;
                method = 'patch';
                body = otherArgs;
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/connectors/${connector_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing connector_operations (${action}): ${method.toUpperCase()} ${url}`);
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
                    return `Connector ${connector_id} deleted successfully (Status: ${response.status}).`;
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