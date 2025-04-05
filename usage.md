# Miro MCP Server - Usage Guide

This document provides examples and patterns for using the consolidated Miro API endpoints.

## Table of Contents

- [Frame Operations](#frame-operations)
  - [Creating a Frame](#creating-a-frame)
  - [Getting a Frame](#getting-a-frame)
  - [Getting Items Within a Frame](#getting-items-within-a-frame)
  - [Updating a Frame](#updating-a-frame)
  - [Deleting a Frame](#deleting-a-frame)
- [Group Operations](#group-operations)
  - [Creating a Group](#creating-a-group)
  - [Getting All Groups](#getting-all-groups)
  - [Getting a Specific Group](#getting-a-specific-group)
  - [Getting Items in a Group](#getting-items-in-a-group)
  - [Updating a Group](#updating-a-group)
  - [Ungrouping Items](#ungrouping-items)
  - [Deleting a Group](#deleting-a-group)
- [Common Patterns](#common-patterns)
  - [Organizing Items with Frames](#organizing-items-with-frames)
  - [Working with Frames and Groups Together](#working-with-frames-and-groups-together)

## Frame Operations

Frames are container elements that can hold other items and provide organization on a Miro board.

### Creating a Frame

To create a new frame on the board:

```javascript
// Create a new frame
const response = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Architecture Overview'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 1200,
      height: 800
    },
    style: {
      fillColor: '#f5f5f5'
    }
  }),
});

const result = await response.json();
console.log('Created frame with ID:', result.id);
```

### Getting a Frame

To retrieve a specific frame by ID:

```javascript
// Get a frame by ID
const response = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get',
    item_id: 'FRAME_ID_HERE'
  }),
});

const frame = await response.json();
console.log('Frame details:', frame);
```

### Getting Items Within a Frame

To retrieve all items contained within a frame:

```javascript
// Get all items in a frame
const response = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get_items',
    item_id: 'FRAME_ID_HERE'
  }),
});

const items = await response.json();
console.log('Items in frame:', items);
```

### Updating a Frame

To update an existing frame's properties:

```javascript
// Update a frame
const response = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'update',
    item_id: 'FRAME_ID_HERE',
    data: {
      title: 'Updated Architecture Overview'
    },
    geometry: {
      width: 1500,
      height: 1000
    },
    style: {
      fillColor: '#e6f7ff'
    }
  }),
});

const updatedFrame = await response.json();
console.log('Updated frame:', updatedFrame);
```

### Deleting a Frame

To delete a frame:

```javascript
// Delete a frame
const response = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'delete',
    item_id: 'FRAME_ID_HERE'
  }),
});

const result = await response.json();
console.log('Frame deletion result:', result);
```

## Group Operations

Groups allow you to combine multiple items together to move or manipulate them as a single unit.

### Creating a Group

To create a new group by combining existing items:

```javascript
// Create a group from existing items
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    item_ids: ['ITEM_ID_1', 'ITEM_ID_2', 'ITEM_ID_3']
  }),
});

const group = await response.json();
console.log('Created group with ID:', group.id);
```

### Getting All Groups

To retrieve all groups on the board:

```javascript
// Get all groups on the board
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get_all'
  }),
});

const groups = await response.json();
console.log('All groups:', groups);
```

### Getting a Specific Group

To retrieve details about a specific group:

```javascript
// Get a specific group by ID
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get',
    group_id: 'GROUP_ID_HERE'
  }),
});

const group = await response.json();
console.log('Group details:', group);
```

### Getting Items in a Group

To retrieve all items contained within a group:

```javascript
// Get all items in a group
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get_items',
    group_id: 'GROUP_ID_HERE'
  }),
});

const items = await response.json();
console.log('Items in group:', items);
```

### Updating a Group

To update a group by changing its member items:

```javascript
// Update a group's items
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'update',
    group_id: 'GROUP_ID_HERE',
    item_ids: ['ITEM_ID_1', 'ITEM_ID_2', 'ITEM_ID_4', 'ITEM_ID_5'] // Updated list of items
  }),
});

const updatedGroup = await response.json();
console.log('Updated group:', updatedGroup);
```

### Ungrouping Items

To break apart a group into individual items:

```javascript
// Ungroup items
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'ungroup',
    group_id: 'GROUP_ID_HERE'
  }),
});

const result = await response.json();
console.log('Ungroup result:', result);
```

### Deleting a Group

To delete a group (note: this only removes the grouping, not the individual items):

```javascript
// Delete a group
const response = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'delete',
    group_id: 'GROUP_ID_HERE'
  }),
});

const result = await response.json();
console.log('Group deletion result:', result);
```

## Common Patterns

Here are some common usage patterns for working with frames and groups.

### Organizing Items with Frames

Frames are useful for organizing related items and providing visual structure to your board:

```javascript
// Create a frame for a specific section
const frameResponse = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Database Architecture'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 1000,
      height: 800
    }
  }),
});

const frame = await frameResponse.json();

// Create items inside the frame
const stickyResponse = await fetch('/mcp_miro_create_sticky_note_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      content: 'PostgreSQL Cluster'
    },
    position: {
      x: 0,
      y: -200,
      origin: 'center',
      relativeTo: 'parent_top_left'
    },
    parent: {
      id: frame.id
    },
    style: {
      fillColor: 'blue'
    }
  }),
});

const sticky = await stickyResponse.json();
console.log('Created sticky note inside frame:', sticky.id);
```

### Working with Frames and Groups Together

You can use groups to organize items that need to be moved together, and frames to provide visual organization:

```javascript
// Create several sticky notes
const sticky1Response = await fetch('/mcp_miro_create_sticky_note_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      content: 'Database 1'
    },
    position: {
      x: -200,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    style: {
      fillColor: 'light_blue'
    }
  }),
});
const sticky1 = await sticky1Response.json();

const sticky2Response = await fetch('/mcp_miro_create_sticky_note_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      content: 'Database 2'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    style: {
      fillColor: 'light_blue'
    }
  }),
});
const sticky2 = await sticky2Response.json();

const sticky3Response = await fetch('/mcp_miro_create_sticky_note_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      content: 'Database 3'
    },
    position: {
      x: 200,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    style: {
      fillColor: 'light_blue'
    }
  }),
});
const sticky3 = await sticky3Response.json();

// Group the sticky notes
const groupResponse = await fetch('/mcp_miro_mcp_miro_group_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    item_ids: [sticky1.id, sticky2.id, sticky3.id]
  }),
});
const group = await groupResponse.json();
console.log('Created group with ID:', group.id);

// Create a frame around the group
const frameResponse = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Database Cluster'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 800,
      height: 400
    },
    style: {
      fillColor: '#e6f7ff'
    }
  }),
});
const frame = await frameResponse.json();
console.log('Created frame with ID:', frame.id);
```

## Tag Operations

Tags allow you to categorize and filter items on your board. They can be assigned colors and attached to various items.

### Creating a Tag

To create a new tag on the board:

```javascript
// Create a new tag
const response = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Priority',
      fillColor: '#ff5252'
    }
  }),
});

const result = await response.json();
console.log('Created tag with ID:', result.id);
```

### Getting All Tags

To retrieve all tags on the board:

```javascript
// Get all tags on the board
const response = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get_all'
  }),
});

const tags = await response.json();
console.log('All tags:', tags);
```

### Getting a Specific Tag

To retrieve a specific tag by ID:

```javascript
// Get a specific tag by ID
const response = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get',
    tag_id: 'TAG_ID_HERE'
  }),
});

const tag = await response.json();
console.log('Tag details:', tag);
```

### Updating a Tag

To update an existing tag's properties:

```javascript
// Update a tag
const response = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'update',
    tag_id: 'TAG_ID_HERE',
    data: {
      title: 'High Priority',
      fillColor: '#ff0000'
    }
  }),
});

const updatedTag = await response.json();
console.log('Updated tag:', updatedTag);
```

### Deleting a Tag

To delete a tag:

```javascript
// Delete a tag
const response = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'delete',
    tag_id: 'TAG_ID_HERE'
  }),
});

const result = await response.json();
console.log('Tag deletion result:', result);
```

### Attaching Tags to Items

To attach a tag to a specific item:

```javascript
// Attach a tag to an item
const response = await fetch('/mcp_miro_tag_item_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'attach',
    tag_id: 'TAG_ID_HERE',
    item_id: 'ITEM_ID_HERE'
  }),
});

const result = await response.json();
console.log('Tag attachment result:', result);
```

### Detaching Tags from Items

To remove a tag from a specific item:

```javascript
// Detach a tag from an item
const response = await fetch('/mcp_miro_tag_item_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'detach',
    tag_id: 'TAG_ID_HERE',
    item_id: 'ITEM_ID_HERE'
  }),
});

const result = await response.json();
console.log('Tag detachment result:', result);
```

### Finding Items with a Specific Tag

To find all items that have a specific tag:

```javascript
// Get all items with a specific tag
const response = await fetch('/mcp_miro_tag_item_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'get_items_with_tag',
    tag_id: 'TAG_ID_HERE'
  }),
});

const taggedItems = await response.json();
console.log('Items with tag:', taggedItems);
```

## Preview Item Operations

Preview items allow you to show previews of external content on your board.

### Creating a Preview Item

To create a new preview item on the board:

```javascript
// Create a preview item
const response = await fetch('/create_preview_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      url: 'https://example.com/content',
      title: 'Example Content Preview'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 600
    }
  }),
});

const result = await response.json();
console.log('Created preview item with ID:', result.id);
```

### Getting a Preview Item

To retrieve information about a specific preview item:

```javascript
// Get a specific preview item
const response = await fetch('/get_preview_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    item_id: 'PREVIEW_ITEM_ID_HERE'
  }),
});

const previewItem = await response.json();
console.log('Preview item details:', previewItem);
```

### Updating a Preview Item

To update an existing preview item:

```javascript
// Update a preview item
const response = await fetch('/update_preview_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    item_id: 'PREVIEW_ITEM_ID_HERE',
    data: {
      url: 'https://example.com/updated-content',
      title: 'Updated Example Content'
    },
    position: {
      x: 100,
      y: 200,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 800
    }
  }),
});

const updatedPreview = await response.json();
console.log('Updated preview item:', updatedPreview);
```

### Deleting a Preview Item

To delete a preview item:

```javascript
// Delete a preview item
const response = await fetch('/delete_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    item_id: 'PREVIEW_ITEM_ID_HERE'
  }),
});

const result = await response.json();
console.log('Preview item deletion result:', result);
```

## Common Use Cases with Tags and Previews

Here are some common patterns for working with tags and preview items.

### Categorizing Items with Tags

Tags can be used to create custom categorization systems for your board items:

```javascript
// Create tags for a prioritization system
const highPriorityTag = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'High Priority',
      fillColor: '#ff0000'
    }
  }),
}).then(res => res.json());

const mediumPriorityTag = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Medium Priority',
      fillColor: '#ffaa00'
    }
  }),
}).then(res => res.json());

const lowPriorityTag = await fetch('/mcp_miro_tag_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Low Priority',
      fillColor: '#00aa00'
    }
  }),
}).then(res => res.json());

// Create a sticky note and tag it
const stickyResponse = await fetch('/mcp_miro_create_sticky_note_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      content: 'Fix critical bug in login system'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    style: {
      fillColor: 'yellow'
    }
  }),
});
const sticky = await stickyResponse.json();

// Attach the high priority tag to the sticky note
await fetch('/mcp_miro_tag_item_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'attach',
    tag_id: highPriorityTag.id,
    item_id: sticky.id
  }),
});

console.log('Created and tagged sticky note with high priority');
```

### Using Preview Items with External Content

Preview items can be used to bring external content into your board for reference:

```javascript
// Create a preview of a design document
const previewResponse = await fetch('/create_preview_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    data: {
      url: 'https://company.sharepoint.com/design-specs/login-page.pdf',
      title: 'Login Page Design Spec'
    },
    position: {
      x: 0,
      y: 300,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 500
    }
  }),
});
const preview = await previewResponse.json();

// Create a frame to contain the preview and related items
const frameResponse = await fetch('/mcp_miro_mcp_miro_frame_operations', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'create',
    data: {
      title: 'Login Page Implementation'
    },
    position: {
      x: 0,
      y: 0,
      origin: 'center',
      relativeTo: 'canvas_center'
    },
    geometry: {
      width: 1000,
      height: 800
    },
    style: {
      fillColor: '#f5f5f5'
    }
  }),
});
const frame = await frameResponse.json();

// Update the preview to be inside the frame
await fetch('/update_preview_item', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    item_id: preview.id,
    parent: {
      id: frame.id
    },
    position: {
      x: 500,
      y: 300,
      origin: 'center',
      relativeTo: 'parent_top_left'
    }
  }),
});

console.log('Created preview of design spec and placed it in a frame');
``` 