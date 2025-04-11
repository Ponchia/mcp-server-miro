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
    groupOperationsTool, 
    tagOperationsTool,
} from './tools/organization-tools';
import { connectorOperationsTool } from './tools/connector-tools';
import { widgetOperationsTool, collaborationOperationsTool, appCardOperationsTool } from './tools/collaboration-tools';
import { 
    hierarchyOperationsTool
} from './tools/state-tools';
import { 
    checkForSimilarContentTool,
    unifiedSearchTool as searchTool
} from './tools/search-tools';

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

// Register tools in order of importance

// 1. Context Understanding Tools
// server.addTool(boardStateOperationsTool); // Partially replaced by searchTool for area and content filtering
server.addTool(hierarchyOperationsTool);
// server.addTool(itemListOperationsTool); // Commented out: Replaced by searchTool for better type filtering and pagination

// 2. Search and Discovery Tools
server.addTool(searchTool);
// server.addTool(searchElementsByContentTool); // Commented out: Replaced by searchTool with enhanced text search capabilities
server.addTool(checkForSimilarContentTool);

// 3. Visual Content Tools - Prioritized for visual tasks
server.addTool(mediaItemOperationsTool); // Moved up for higher priority
server.addTool(appCardOperationsTool);   // Moved up for higher priority

// 4. Core Manipulation Tools
server.addTool(boardOperationsTool);
server.addTool(bulkItemCreationTool);
server.addTool(contentItemOperationsTool);
server.addTool(itemPositionOperationsTool);
server.addTool(itemDeletionOperationsTool);

// 5. Organization and Structure Tools
// server.addTool(frameOperationsTool); // Commented out: Replaced by searchTool with parent_id filtering
server.addTool(connectorOperationsTool);
server.addTool(groupOperationsTool);
server.addTool(tagOperationsTool);
// server.addTool(tagItemOperationsTool); // Commented out: Replaced by searchTool with tag-based filtering

// 6. Collaboration Tools
server.addTool(widgetOperationsTool);
server.addTool(collaborationOperationsTool);

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
} catch (error) {
    console.error('Error starting server:', error);
    if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
    }
    process.exit(1);
} 