import { FastMCP, ServerOptions } from 'fastmcp';
import { port } from './config';
import { 
    boardOperationsTool, 
    itemPositionOperationsTool, 
    itemDeletionOperationsTool,
    bulkItemCreationTool
} from './tools/core-tools';
import { contentItemOperationsTool } from './tools/content-tools';
import { mediaItemOperationsTool } from './tools/media-tools';
import { 
    frameOperationsTool,
    groupOperationsTool, 
    tagItemOperationsTool, 
    tagOperationsTool,
} from './tools/organization-tools';
import { connectorOperationsTool } from './tools/connector-tools';
import { collaborationOperationsTool, appCardOperationsTool } from './tools/collaboration-tools';
import { 
    hierarchyOperationsTool
} from './tools/state-tools';
import { 
    checkForSimilarContentTool,
    searchTool
} from './tools/search-tools';
import { ErrorResponse } from './utils/api-utils';
import { ToolDefinition } from './types/tool-types';

// Helper function to adapt our tools to the FastMCP interface
// This handles the type conversion automatically
function adaptTool<T>(tool: ToolDefinition<T, string | ErrorResponse>) {
    return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args: T) => {
            const result = await tool.execute(args);
            // If the result is an ErrorResponse, convert it to a string
            if (typeof result === 'object' && result !== null && 'error' in result) {
                return JSON.stringify(result);
            }
            return result;
        }
    };
}

// Create the server with enhanced error handling
const server = new FastMCP({
    name: 'Miro MCP Server (Explicit)',
    version: '0.2.0',
    onToolCall: (toolName: string, params: Record<string, unknown>) => {
        console.log('\n=== Tool Call Details ===');
        console.log(`Tool Name: ${toolName}`);
        console.log('Parameters:', JSON.stringify(params, null, 2));
        console.log('=====================\n');
    },
    // Add enhanced error handler for connections
    onError: (error: Error) => {
        console.error('MCP Server Error:', error.message);
        console.error('Error stack:', error.stack);
        
        // More comprehensive check for connection-related errors
        const connectionErrorPatterns = [
            'Not connected',
            'Ping timeout',
            'Connection lost',
            'Connection refused',
            'ECONNRESET',
            'ECONNREFUSED',
            'Socket closed',
            'socket hang up',
            'ERR_UNHANDLED_ERROR',
            'Client disconnected',
            'write after end',
            'WebSocket is not open',
            'Cannot read property',
            'Transport closed',
            'network error'
        ];
        
        // Check if error message contains any of the connection error patterns
        if (connectionErrorPatterns.some(pattern => 
            error.message.toLowerCase().includes(pattern.toLowerCase()))) {
            console.log('Non-fatal connection error detected, continuing server operation...');
            return; // Don't rethrow
        }
        
        throw error; // Rethrow other errors
    },
    pingTimeoutMs: 45000, // Increase ping timeout to 45 seconds (was 30)
    keepAliveIntervalMs: 20000, // Increase keep alive interval to 20 seconds (was 15)
    reconnectTimeout: 10000, // Add reconnect timeout
    maxConnections: 50, // Limit max connections
    reconnectAttempts: 5 // Limit reconnection attempts
} as ServerOptions<undefined>);

/**
 * =====================================================
 *              MIRO POSITIONING SYSTEM GUIDE 
 * =====================================================
 * 
 * COMPREHENSIVE GUIDE FOR LLM/AGENT USING MIRO MCP SERVER
 * 
 * 1. COORDINATE SYSTEMS AND REFERENCE POINTS:
 *    - Board center is at coordinates {x:0, y:0}, "relativeTo": "canvas_center"
 *    - Item coordinates refer to the center point of the item
 *    - All items support multiple reference points:
 *      a) "canvas_center": Position relative to board center (0,0)
 *      b) "parent_top_left": Position relative to parent frame's top-left
 *      c) "parent_center": Position relative to parent frame's center
 *      d) "parent_bottom_right": Position relative to parent frame's bottom-right
 *      e) "parent_percentage": Use percentage values for responsive positioning (e.g., "50%,50%")
 * 
 * 2. POSITIONING EXAMPLES:
 *    - Board center: {"x": 0, "y": 0, "relativeTo": "canvas_center"}
 *    - Top-left of parent: {"x": 10, "y": 10, "relativeTo": "parent_top_left"}
 *    - Center of parent: {"x": 0, "y": 0, "relativeTo": "parent_center"}
 *    - Bottom-right of parent: {"x": -10, "y": -10, "relativeTo": "parent_bottom_right"}
 *    - Percentage positioning: {"x": "50%", "y": "50%", "relativeTo": "parent_percentage"}
 * 
 * 3. COORDINATE DIRECTION:
 *    - Positive x extends right, positive y extends down
 *    - For parent_top_left: (0,0) is top-left, (+x,+y) moves right and down
 *    - For parent_center: (0,0) is center, (+x,+y) moves right and down
 *    - For parent_bottom_right: (0,0) is bottom-right, (-x,-y) moves left and up
 * 
 * 4. API BEHAVIOR AND BEST PRACTICES:
 *    - When reading items: Position includes "relativeTo" property
 *    - When creating/updating: Our server handles reference conversion
 *    - Always use numeric values for absolute coordinates
 *    - For percentage values, use strings with % suffix: "50%"
 *    - Never nest frames inside frames (not supported by Miro API)
 *    - Connectors cannot be assigned to parent frames
 * 
 * 5. VALIDATION:
 *    - Our server validates positions based on parent geometry
 *    - For parent_percentage: Values must be between "0%" and "100%"
 *    - For parent_top_left: Values must be positive and within parent bounds
 *    - For parent_center: Values must be within half-width/height of parent
 *    - For parent_bottom_right: Values must be negative and within parent bounds
 * 
 * This system enables precise control over item positioning, especially for
 * creating complex layouts with parent-child relationships.
 */

// Register tools in order of importance using the adapter

// 1. Context Understanding Tools
// server.addTool(boardStateOperationsTool); // Partially replaced by searchTool for area and content filtering
server.addTool(adaptTool(hierarchyOperationsTool));
// server.addTool(itemListOperationsTool); // Commented out: Replaced by searchTool for better type filtering and pagination

// 2. Search and Discovery Tools
server.addTool(adaptTool(searchTool));
// server.addTool(searchElementsByContentTool); // Commented out: Replaced by searchTool with enhanced text search capabilities
server.addTool(adaptTool(checkForSimilarContentTool));

// 3. Visual Content Tools - Prioritized for visual tasks
server.addTool(adaptTool(mediaItemOperationsTool)); 
server.addTool(adaptTool(appCardOperationsTool));   

// 4. Core Manipulation Tools
server.addTool(adaptTool(boardOperationsTool)); 
server.addTool(adaptTool(bulkItemCreationTool)); 
server.addTool(adaptTool(contentItemOperationsTool));
server.addTool(adaptTool(itemPositionOperationsTool));
server.addTool(adaptTool(itemDeletionOperationsTool));

// 5. Organization and Structure Tools
server.addTool(adaptTool(frameOperationsTool)); 
server.addTool(adaptTool(connectorOperationsTool));
server.addTool(adaptTool(groupOperationsTool));
server.addTool(adaptTool(tagOperationsTool));
server.addTool(adaptTool(tagItemOperationsTool));

// 6. Collaboration Tools
server.addTool(adaptTool(collaborationOperationsTool));

// Set up enhanced process error handlers to prevent crashing
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Stack trace:', error.stack);
    
    // Extended list of non-fatal error messages
    const nonFatalErrorPatterns = [
        'Not connected',
        'ERR_UNHANDLED_ERROR',
        'Connection',
        'ECONNRESET',
        'ECONNREFUSED',
        'socket',
        'Socket',
        'write after end',
        'WebSocket',
        'websocket',
        'ping timeout',
        'Client disconnected',
        'Cannot read property',
        'undefined is not an object',
        'null is not an object',
        'error in event handler'
    ];
    
    // Only exit for truly fatal errors
    if (!nonFatalErrorPatterns.some(pattern => 
        error.message.toLowerCase().includes(pattern.toLowerCase()))) {
        console.error('Fatal error detected, exiting process');
        process.exit(1);
    } else {
        console.log('Non-fatal error detected in uncaughtException handler, continuing operation');
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    
    // Log the reason with better detail
    if (reason instanceof Error) {
        console.error('Reason:', reason.message);
        console.error('Stack:', reason.stack);
    } else {
        console.error('Reason:', reason);
    }
    
    // Continue running the server
    console.log('Unhandled rejection caught, continuing server operation');
});

// Start the server
console.log('Starting Miro MCP Server (Explicit)...');
try {
    // Start server
    server.start({
        transportType: 'sse',
        sse: {
            endpoint: '/sse',
            port: port
        }
    });

    console.log('Miro MCP Server (Explicit) started successfully on port ' + port + '.');
    console.log(`Server URL: http://localhost:${port}/sse`);
    console.log('All tools are now fully implemented');
    
    // Display enhanced positioning system information
    console.log(`🌟 Enhanced positioning system enabled with support for:`);
    console.log(`  - canvas_center: Position relative to board center (0,0)`);
    console.log(`  - parent_top_left: Position relative to parent's top-left corner`);
    console.log(`  - parent_center: Position relative to parent's center point`);
    console.log(`  - parent_bottom_right: Position relative to parent's bottom-right corner`);
    console.log(`  - parent_percentage: Position using percentage values (e.g., "50%,50%")`);
    console.log(`✅ All coordinates and reference points are LLM-friendly with detailed descriptions`);
    console.log('Press Ctrl+C to stop the server');
} catch (error) {
    console.error('Error starting server:', error);
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
    process.exit(1);
} 