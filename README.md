# Miro MCP Server

A Model Control Protocol (MCP) server for Miro that provides various tools for interacting with Miro boards programmatically.

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

## Available Tools

The server provides the following categories of tools:

**Core Board Operations:**
- `update_board`: Configures global board settings including name, description, and access permissions.
- `list_board_items`: Retrieves information about all items on a Miro board as a paginated flat collection.
- `update_item_position_or_parent`: Moves items to new positions or reassigns them to different parent frames.
- `delete_item`: Permanently removes any item from a Miro board using its unique identifier.

**Content Item Operations:**
- `mcp_miro_content_item_operations`: Creates and manages text-based content on Miro boards including rich text, shapes with text, and sticky notes.

**Media Item Operations:**
- `mcp_miro_media_item_operations`: Adds and manages visual media content on Miro boards including images, documents, embeds, and previews.

**Card Operations:**
- `mcp_miro_card_operations`: Operations for cards and app cards.
- `create_app_card_item`: Creates an app card item.

**Organization Operations:**
- `mcp_miro_frame_operations`: Creates and manages containment areas (frames) that visually organize content on Miro boards.
- `mcp_miro_group_operations`: Binds multiple items together so they can be moved, copied, or manipulated as a single unit.
- `mcp_miro_tag_operations`: Creates and manages categorization labels (tags) that can be applied to multiple items across a board.
- `mcp_miro_tag_item_operations`: Associates or disassociates tags with specific items on a Miro board.

**Connector Operations:**
- `mcp_miro_connector_operations`: Creates and manages line connections between items on a Miro board to show relationships and flows.

**Collaboration Operations:**
- `mcp_miro_widget_operations`: Manages comments on Miro boards for team feedback and collaboration.
- `mcp_miro_collaboration_operations`: Manages board access, permissions, and team collaboration settings.

**State Retrieval:**
- `get_complete_board`: Captures a complete snapshot of all board content and relationships for comprehensive understanding or analysis.
- `get_item_tree`: Explores parent-child relationships and connections between specific items on a Miro board.

## Planned Features

See [next-steps.md](next-steps.md) for planned improvements and enhancements. 