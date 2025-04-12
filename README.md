# Miro MCP Server

A Model Control Protocol (MCP) server for Miro that provides comprehensive tools for interacting with Miro boards programmatically. This server enables AI agents to create, manage, and analyze Miro boards with rich content and complex relationships.

## Project Structure

This project follows a modular structure for maintainability and scalability. For detailed information about the project structure, please see [STRUCTURE.md](STRUCTURE.md).

## Setup Instructions

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file with the following variables:
   ```
   MIRO_API_TOKEN=your_miro_api_token
   MIRO_BOARD_ID=your_miro_board_id
   PORT=8899  # optional, defaults to 8899
   ```

3. **Build the Project:**
   ```bash
   npm run build
   ```

4. **Start the Server:**
   ```bash
   npm start
   ```

For development with live reloading:
```bash
npm run dev
```

## Architectural Approach

The Miro MCP Server follows several key design principles:

1. **Modular Organization**: Tools are categorized by functionality into separate files for better maintainability.
2. **Consistent Interface**: All tools follow a standardized pattern with Zod schema validation.
3. **Progressive Enhancement**: Tools build upon each other, from basic operations to complex interactions.
4. **Error Resilience**: Comprehensive error handling with detailed error messages.
5. **Coordinate Normalization**: Unified position handling system that works across all tools.
6. **Data Transformation**: Automatic translation between different coordinate systems.
7. **History Tracking**: Built-in modification history to track changes across sessions.

The server is built on top of FastMCP, a lightweight framework for building Model Control Protocol servers that enable AI systems to interact with external services.

## Advanced Positioning System

This server implements an enhanced positioning system that supports multiple reference points:

- `canvas_center`: Position relative to board center (0,0)
- `parent_top_left`: Position relative to parent frame's top-left corner
- `parent_center`: Position relative to parent frame's center point
- `parent_bottom_right`: Position relative to parent frame's bottom-right corner
- `parent_percentage`: Position using percentage values for responsive layouts (e.g., "50%")

This system enables precise control over item positioning, especially for creating complex layouts with parent-child relationships. All tools automatically handle the conversion between different coordinate systems, making it easy to position items consistently regardless of their parent container.

### Position Normalization

All positioning parameters go through a normalization process that:
1. Preserves the original reference system
2. Validates coordinate values against parent bounds
3. Translates coordinates to the appropriate system for the Miro API
4. Handles percentage-based positioning for responsive layouts

## Available Tools and Usage Guide

The server provides the following categories of tools:

### Context Understanding & Organization

- **`mcp_miro_hierarchy_operations`**: Explores relationships between items with configurable depth.
  - Usage: Query by item ID or type to get a hierarchical view of parent-child relationships, attached tags, and connections.
  - Example: Retrieve the hierarchy for a specific frame to see all its contained items.
  - Parameters: `item_id` or `type`, `max_depth`, `include_connectors`, `include_tags`, `include_content_summaries`

- **`mcp_miro_frame_operations`**: Creates and manages containment frames.
  - Usage: Create frames with specific dimensions, position, and styling; retrieve frames and their contained items.
  - Example: Create a frame at board center with title "Requirements" and light blue background.
  - Operations: `create`, `get`, `get_all`, `get_items`, `update`, `delete`
  - Parameters: title, position, geometry, style (fillColor)

- **`mcp_miro_group_operations`**: Binds multiple items together for group manipulation.
  - Usage: Create groups from multiple item IDs; retrieve group information; update group membership.
  - Example: Group related diagram elements so they move together.
  - Operations: `create`, `get_all`, `get`, `get_items`, `update`, `ungroup`, `delete`
  - Parameters: `group_id`, `item_ids`

### Search & Discovery

- **`mcp_miro_unified_search`**: Multi-criteria search tool.
  - Usage: Find items by text content, type, color, area, parent, connections, or tags.
  - Example: Search for all blue sticky notes containing "Important" within a specific frame.
  - Parameters: `text_query`, `item_types`, `color_query`, `area`, `parent_id`, `connected_to_id`, `tagged_with`, `search_mode` ("all" or "any")
  - Advanced features: Configure matching type (exact, contains, fuzzy) and sort results

- **`mcp_miro_duplicate_detection_operations`**: Prevents duplicate content.
  - Usage: Check if specific text content already exists on the board before creating new items.
  - Example: Verify if a specific requirement is already documented on the board.
  - Parameters: `content`, `item_type`

### Content Creation & Management

- **`mcp_miro_content_item_operations`**: Creates and manages text-based content.
  - Usage: Create, retrieve, update, and delete text items, shapes, and sticky notes.
  - Example: Create a sticky note with formatted text at a specific position.
  - Operations: `create`, `get`, `get_all`, `update`, `delete`
  - Parameters for creation: `type`, `data` (content, shape), `position`, `geometry`, `style`, `parent`
  - HTML support: Text content supports HTML formatting (p, a, strong, b, em, i, u, s, span, ol, ul, li, br)

- **`mcp_miro_media_item_operations`**: Manages visual media content.
  - Usage: Add images, documents, embeds, and URL previews to boards.
  - Example: Insert an image from a URL into a specific frame.
  - Operations: `create`, `get`, `get_all`, `update`, `delete`
  - Parameters: `type` (image, document, embed, preview), `data` (url, title, etc.), `position`, `geometry`
  - Special features: Automatic aspect ratio preservation; support for modal and inline embed modes

- **`mcp_miro_app_card_operations`**: Creates interactive app cards.
  - Usage: Create app cards with custom fields, styling, and status indicators.
  - Example: Create an app card representing a JIRA ticket with status, priority, and assignee fields.
  - Parameters: `data` (title, description, fields, status), `style`, `position`, `geometry`, `parent`
  - Field customization: Each field can have an icon, tooltip, fill color, and text color

- **`mcp_miro_bulk_item_creation`**: Creates multiple items in one API call.
  - Usage: Add up to 20 items simultaneously with a single request.
  - Example: Create all elements for a diagram at once, maintaining their relative positions.
  - Parameters: `items` (array of item definitions including type, data, position, style, etc.)
  - Efficiency: Atomic operation - all items succeed or fail together

### Relationships & Connections

- **`mcp_miro_connector_operations`**: Creates and manages line connections.
  - Usage: Connect items with customizable connectors to show relationships.
  - Example: Create a flow diagram by connecting process steps with arrows.
  - Operations: `create`, `get`, `get_all`, `update`, `delete`
  - Parameters: `startItem`, `endItem`, `shape` (straight, elbowed, curved), `style`, `captions`
  - Styling options: Line style, color, thickness, end decorations (arrows, diamonds, etc.)
  - Caption support: Add up to 20 text captions at specific positions along the connector

- **`mcp_miro_update_item_position_or_parent`**: Moves items or changes their parent.
  - Usage: Reposition items or move them between frames.
  - Example: Move completed items to a "Done" frame.
  - Parameters: `item_id`, `position`, `parent`

- **`mcp_miro_item_deletion_operations`**: Removes items from a board.
  - Usage: Delete specific items by ID.
  - Example: Remove outdated or incorrect elements.
  - Parameters: `item_id`

### Collaboration & Access Control

- **`mcp_miro_collaboration_operations`**: Manages board access and permissions.
  - Usage: List users, share board with new users, update member roles, remove users.
  - Example: Invite a new team member as a commenter.
  - Operations: `get_board_members`, `share_board`, `update_member`, `remove_member`, `get_organization_members`
  - Parameters: `user_email`, `user_id`, `role` (viewer, commenter, editor, coowner)

- **`mcp_miro_board_operations`**: Configures global board settings.
  - Usage: Update board name, description, and permission policies.
  - Example: Set a board to view-only for organization members.
  - Parameters: `name`, `description`, `policy` (permissionsPolicy, sharingPolicy)

## Data Validation and Transformation

All tools implement comprehensive data validation using Zod schemas, which provide:

1. **Type Safety**: Runtime type checking for all parameters
2. **Data Refinement**: Additional validation beyond simple type checking
3. **Default Values**: Sensible defaults for optional parameters
4. **Error Messages**: Clear, actionable error messages

The server also includes several data transformation utilities:

- `normalizePositionValues`: Normalizes position data and preserves reference systems
- `normalizeGeometryValues`: Ensures consistent geometry specification
- `normalizeStyleValues`: Handles different style formats (hex colors, named colors, etc.)
- `translatePosition`: Converts between different coordinate systems
- `validateChildPosition`: Ensures positions are valid within parent containers

## Error Handling and Resilience

The server implements robust error handling:

1. **API Error Formatting**: Detailed error messages for API failures
2. **Connection Resilience**: Automatic handling of common connection issues
3. **Process Error Handlers**: Prevention of crashes from uncaught exceptions
4. **Validation Errors**: Clear messages for parameter validation failures

## Extending the Server

To add new tools or enhance existing ones:

1. Identify the appropriate category
2. Create a new tool file or extend an existing one
3. Implement the required operations with Zod schema validation
4. Register the tool in `src/index.ts`

## Planned Features

See [next-steps.md](next-steps.md) for planned improvements and enhancements. 