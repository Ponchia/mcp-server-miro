# Miro MCP Server Project Structure

This document describes the modular structure of the Miro MCP Server codebase after refactoring.

## Directory Structure

```
src/
├── index.ts                  # Entry point that starts the server
├── config.ts                 # Environment variables and configuration
├── types/
│   ├── miro-types.ts         # All Miro API related interfaces
│   └── tool-types.ts         # Tool definition types
├── schemas/
│   └── position-schema.ts    # Schemas for item positioning
├── utils/
│   ├── api-utils.ts          # API response/error formatting
│   └── data-utils.ts         # Data normalization functions
├── client/
│   └── miro-client.ts        # Axios client setup
└── tools/
    ├── core-tools.ts         # Board and generic item operations
    ├── content-tools.ts      # Text, shapes, sticky notes
    ├── media-tools.ts        # Images, documents, embeds
    ├── organization-tools.ts # Frames, groups, tags
    ├── connector-tools.ts    # All connector operations
    ├── collaboration-tools.ts# Members, sharing, comments
    ├── card-tools.ts         # App card operations
    ├── state-tools.ts        # Hierarchy and board state operations
    └── search-tools.ts       # Content search and duplicate detection
```

## Architectural Principles

The Miro MCP Server is built on several key architectural principles:

1. **Separation of Concerns**: Each tool handles a specific domain of Miro functionality.
2. **Single Responsibility**: Functions and modules have clearly defined responsibilities.
3. **Schema-First Design**: All tools define their parameters with Zod schemas for validation.
4. **Unified Error Handling**: Centralized error processing for consistent responses.
5. **Progressive Enhancement**: Tools build from simple to complex operations.
6. **Coordinate System Abstraction**: Tools handle coordinate transformations transparently.
7. **Stateless Operation**: Each tool call is independent, with no server-side state management.

## Module Descriptions

### Core Files

- **index.ts**: Main entry point that imports and registers all tools with the FastMCP server. This file:
  - Configures the FastMCP server settings
  - Sets up error handling for API calls and connections
  - Registers all tools in a specific order to optimize discoverability
  - Includes comprehensive positioning guide documentation for LLMs/agents
  - Configures process-level error handlers for resilience

- **config.ts**: Manages environment variables and configuration settings.
  - Loads environment variables using dotenv
  - Validates required API credentials
  - Defines server port and other configuration

### Types

- **miro-types.ts**: Contains all TypeScript interfaces for Miro API objects.
  - Defines base interfaces for all Miro item types
  - Includes hierarchy-specific interfaces for nested data structures
  - Provides type definitions for connectivity mappings and analysis
  - Defines metadata and summary types for board state information

- **tool-types.ts**: Defines the tool definition interface and related types.
  - Provides a generic ToolDefinition interface used by all tools
  - Ensures consistent structure across all tool implementations
  - Includes utility types for parameter validation

### Schemas

- **position-schema.ts**: Defines schemas and utilities for item positioning.
  - Provides Zod schema for position validation
  - Includes helper functions for generating position guides
  - Defines standard positioning documentation used across tools

### Utilities

- **api-utils.ts**: Functions for formatting API responses and handling errors.
  - Standardizes API response formatting
  - Provides detailed error information with status codes
  - Handles Axios-specific error structures

- **data-utils.ts**: Helper functions for data normalization and transformation.
  - Implements position normalization and translation between coordinate systems
  - Provides geometry and style value normalization
  - Validates child positions within parent boundaries
  - Generates content summaries for items
  - Maintains modification history for tracking changes

### Client

- **miro-client.ts**: Configures the Axios client for Miro API requests.
  - Sets up authorization headers with the Miro API token
  - Configures base URL and content types
  - Provides a consistent client used by all tool implementations

### Tools

#### Core Operations

- **core-tools.ts**: Basic board operations, bulk creation, and item manipulation.
  - **Board Operations**: Update board name, description, and sharing settings
  - **Bulk Item Creation**: Create multiple items in a single API call
  - **Position Updates**: Move items or change their parent frames
  - **Item Deletion**: Remove items from boards

  Implementation approach:
  - Uses board-level endpoints for global operations
  - Handles batch creation with transaction-like behavior
  - Includes position translation for parent-relative positioning

#### Content Management

- **content-tools.ts**: Text, shapes, and sticky notes with rich formatting.
  - **Text Items**: Rich text with HTML formatting
  - **Shapes**: 25+ shape types with text content
  - **Sticky Notes**: Colored notes with customizable text

  Implementation approach:
  - Validates and sanitizes HTML content
  - Processes span styles for text formatting
  - Normalizes colors for consistent appearance
  - Generates text previews for summaries

- **media-tools.ts**: Visual media content management.
  - **Images**: Photos, diagrams, and visual elements
  - **Documents**: PDF thumbnails and multipage documents
  - **Embeds**: Interactive web content displays
  - **Previews**: Link previews with metadata

  Implementation approach:
  - Handles aspect ratio preservation automatically
  - Translates coordinates for proper positioning
  - Supports both modal and inline embed modes

- **card-tools.ts**: App cards for integrated external data.
  - **Custom Fields**: Icon + text pairs with styling
  - **Status Indicators**: Connection status visualization
  - **Integration Representation**: Visual containers for external data

  Implementation approach:
  - Supports rich styling for fields
  - Handles parent-relative positioning
  - Maintains clean objects for API compatibility

#### Organization and Structure

- **organization-tools.ts**: Frames, groups, and categorization.
  - **Frames**: Visual containers for organizing content
  - **Groups**: Logical binding of items for manipulation
  - **Tags**: Categorization labels across the board
  - **Tag Operations**: Association and disassociation of tags

  Implementation approach:
  - Separates container creation from item association
  - Handles parent-child relationships
  - Manages visual styling for organizational elements

- **connector-tools.ts**: Line connections between items.
  - **Connector Creation**: Link items with specified endpoints
  - **Connector Styling**: Customize line appearance and decorations
  - **Captions**: Add text along connector paths

  Implementation approach:
  - Uses percentage-based endpoint positioning
  - Supports various line types and endpoint decorations
  - Validates that start and end items are distinct

#### Collaboration and User Management

- **collaboration-tools.ts**: Comments, sharing, and permissions.
  - **Widgets/Comments**: Feedback and discussion functionality
  - **User Management**: Invite, update, and remove users
  - **App Cards**: Interactive cards with custom fields

  Implementation approach:
  - Handles board membership operations
  - Manages comment lifecycle
  - Supports sharing with specific permission levels

#### State and Analysis

- **state-tools.ts**: Hierarchical structure and relationship analysis.
  - **Item Hierarchy**: Parent-child relationships with connectivity
  - **Connection Analysis**: Identify patterns and issues
  - **Content Summaries**: Text previews of item content

  Implementation approach:
  - Builds tree structures from flat item lists
  - Analyzes connectivity patterns
  - Includes metadata about board structure

- **search-tools.ts**: Content search and duplicate detection.
  - **Unified Search**: Multi-criteria item search
  - **Duplicate Detection**: Find similar content
  - **Content Filtering**: Text-based item filtering

  Implementation approach:
  - Implements smart filtering algorithms
  - Supports fuzzy matching for content
  - Handles area-based spatial search

## Advanced Positioning System

The project implements an enhanced positioning system that supports multiple reference points:

- **canvas_center**: Position relative to board center (0,0)
- **parent_top_left**: Position relative to parent frame's top-left corner
- **parent_center**: Position relative to parent frame's center point
- **parent_bottom_right**: Position relative to parent frame's bottom-right corner
- **parent_percentage**: Position using percentage values for responsive layouts

### Implementation Details

The positioning system is implemented through several components:

1. **Schema Definition**: `position-schema.ts` defines the standard schema
2. **Normalization**: `normalizePositionValues()` in `data-utils.ts` handles conversion
3. **Validation**: `validateChildPosition()` ensures positions are within bounds
4. **Translation**: `translatePosition()` converts between coordinate systems
5. **Documentation**: `MCP_POSITIONING_GUIDE` provides standardized documentation

### Coordinate System Translation

When items are positioned relative to a parent frame, the server:

1. Retrieves the parent's dimensions
2. Identifies the reference system (e.g., parent_center, parent_top_left)
3. Translates the coordinates to the appropriate system for the Miro API
4. Handles special cases like percentage-based positioning

This allows for intuitive positioning while maintaining compatibility with the Miro API.

## Data Validation and Error Handling

### Schema Validation

All tools use Zod schemas for parameter validation, providing:

- **Type Safety**: Runtime type checking
- **Required Fields**: Enforcement of mandatory parameters
- **Refinements**: Complex validation rules beyond types
- **Default Values**: Sensible defaults for optional parameters

### Error Handling

The server implements multiple layers of error handling:

- **API Errors**: Formatted with status codes and detailed messages
- **Validation Errors**: Clear indications of parameter issues
- **Connection Errors**: Resilient handling of network issues
- **Process-Level Handling**: Prevention of crashes from unhandled exceptions

## Extending the Codebase

When adding new functionality:

1. **Identify the Tool Category**: Determine which module best fits the new functionality
2. **Define the Schema**: Create a Zod schema for parameter validation
3. **Implement the Tool**: Create the tool with appropriate error handling
4. **Register in index.ts**: Add the tool to the server registration
5. **Update Documentation**: Document the new functionality

### Adding a New Tool

A typical tool implementation follows this pattern:

```typescript
// 1. Import dependencies
import { z } from 'zod';
import { ToolDefinition } from '../types/tool-types';
import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { formatApiResponse, formatApiError } from '../utils/api-utils';

// 2. Define the schema
const MyToolSchema = z.object({
  action: z.enum(['create', 'get', 'update', 'delete']),
  // Add other parameters with validation
});

type MyToolParams = z.infer<typeof MyToolSchema>;

// 3. Implement the tool
export const myTool: ToolDefinition<MyToolParams> = {
  name: 'mcp_miro_my_tool',
  description: 'Description of my tool functionality',
  parameters: MyToolSchema,
  execute: async (args) => {
    try {
      // Implement tool logic here
      const response = await miroClient.get('/some/endpoint');
      return formatApiResponse(response.data);
    } catch (error) {
      return formatApiError(error);
    }
  }
};
```

## Modification Tracking

The server implements a modification history system that:

1. Tracks item creation events
2. Records item modifications
3. Maintains a limited history for reference
4. Provides summaries of recent changes

This helps maintain context across multiple operations and assists in understanding board evolution. 