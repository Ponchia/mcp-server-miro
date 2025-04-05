# Miro MCP Server Project Structure

This document describes the modular structure of the Miro MCP Server codebase after refactoring.

## Directory Structure

```
src/
├── index.ts                  # Entry point that starts the server
├── config.ts                 # Environment variables and configuration
├── types/
│   └── miro-types.ts         # All Miro API related interfaces
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
    ├── state-tools.ts        # get_complete_board, get_item_tree
    └── search-tools.ts       # Placeholder for future search capabilities
```

## Module Descriptions

### Core Files

- **index.ts**: Main entry point that imports and registers all tools with the FastMCP server.
- **config.ts**: Manages environment variables and configuration settings.

### Types

- **miro-types.ts**: Contains all TypeScript interfaces for Miro API objects.

### Utilities

- **api-utils.ts**: Functions for formatting API responses and handling errors.
- **data-utils.ts**: Helper functions for normalizing data values.

### Client

- **miro-client.ts**: Configures the Axios client for Miro API requests.

### Tools

- **core-tools.ts**: Basic board operations and generic item operations.
- **content-tools.ts**: Operations for content items (text, shapes, sticky notes).
- **media-tools.ts**: Operations for media items (images, documents, embeds).
- **organization-tools.ts**: Operations for organizational elements (frames, groups, tags).
- **connector-tools.ts**: Operations for connectors between items.
- **collaboration-tools.ts**: Operations for comments, users, and sharing.
- **state-tools.ts**: Tools for retrieving comprehensive board or item state.
- **search-tools.ts**: Placeholder for planned search capabilities.

## Extending the Codebase

When adding new functionality:

1. Identify the most appropriate module based on the feature's purpose
2. Implement the tool in the relevant file
3. Export the tool and register it in index.ts
4. Update tests if applicable

## Future Enhancements

See `next-steps.md` for planned improvements, particularly regarding search capabilities and item modification workflows. 