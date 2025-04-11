import { z } from 'zod';

/**
 * Comprehensive position schema with enhanced reference points
 */
export const PositionSchema = z.object({
    x: z.number().describe('X coordinate. Positive values move right from reference point.'),
    y: z.number().describe('Y coordinate. Positive values move down from reference point.'),
    origin: z.enum(['center']).optional().describe('Origin point of the item. Always "center" for Miro items.'),
    relativeTo: z.enum([
        'canvas_center',    // Position relative to board center at (0,0)
        'parent_top_left',  // Position relative to parent frame's top-left corner
        'parent_center',    // Position relative to parent frame's center point
        'parent_bottom_right', // Position relative to parent frame's bottom-right corner
        'parent_percentage' // Position using percentage values within parent (e.g., "50%,50%")
    ]).optional().describe('Reference point for coordinates. Determines how x,y values are interpreted.')
});

export type Position = z.infer<typeof PositionSchema>;

/**
 * Helper function for LLM-friendly position descriptions
 */
export const getPositioningGuide = (context?: 'frame' | 'child' | 'general'): string => {
    if (context === 'frame') {
        return 'Frames are positioned relative to the board center (0,0). Use {"x": 0, "y": 0} to place at center.';
    } else if (context === 'child') {
        return 'Child items support multiple reference points: "parent_top_left", "parent_center", "parent_bottom_right", or "parent_percentage".';
    } else {
        return 'Position with {"x": 0, "y": 0, "relativeTo": "canvas_center"} places item at board center. Coordinates represent item\'s center point.';
    }
};

/**
 * Standard positioning guide for MCP tool descriptions
 */
export const MCP_POSITIONING_GUIDE = `POSITIONING GUIDE:
• Board coordinates: (0,0) is board center, +x right, +y down
• Item coordinates: refer to item's center point
• Multiple reference points available:
  - "canvas_center": relative to board center
  - "parent_top_left": relative to parent's top-left corner
  - "parent_center": relative to parent's center point
  - "parent_bottom_right": relative to parent's bottom-right
  - "parent_percentage": using percentage values (e.g., x:"50%",y:"50%")
• Note: Always use numeric values for absolute coordinates
• Tip: Use percentages for responsive positioning within parents`; 