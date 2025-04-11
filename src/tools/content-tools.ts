import { z } from 'zod';
import miroClient from '../client/miro-client';
import { formatApiResponse, formatApiError } from '../utils/api-utils';
import { normalizeStyleValues, normalizeGeometryValues, normalizePositionValues, modificationHistory } from '../utils/data-utils';
import { ToolDefinition } from '../types/tool-types';
import { miroBoardId } from '../config';

// HTML processing functions
/**
 * Detects if text contains HTML markup
 */
const containsHtml = (text: string): boolean => {
  const htmlRegex = /<([a-z][a-z0-9]*)\b[^>]*>(.*?)<\/\1>/i;
  return htmlRegex.test(text);
};

/**
 * Validates HTML content for Miro compatibility
 * Miro supports a limited set of HTML tags: <p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>
 * This function preserves supported tags and sanitizes unsupported ones.
 */
const validateHtmlForMiro = (html: string): string => {
  if (!containsHtml(html)) return html;
  
  // These are the only HTML tags supported by Miro according to their documentation
  const supportedTags = ['p', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ol', 'ul', 'li', 'br'];
  
  // Define regex to match HTML tags
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  
  // Replace HTML tags
  return html.replace(tagRegex, (match, tagName) => {
    // If the tag is in our supported list, keep it
    if (supportedTags.includes(tagName.toLowerCase())) {
      return match;
    }
    
    // For unsupported tags, escape them so they show as plain text
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
};

// Schema definitions for content items
const ContentItemSchema = z.object({
    action: z.enum(['create', 'get', 'get_all', 'update', 'delete']).describe('The action to perform.'),
    type: z.enum(['shape', 'text', 'sticky_note']).describe('The type of content item.'),
    item_id: z.string().optional().describe('Item ID (required for get, update, delete actions).'),
    data: z.object({
        // Generic content properties
        content: z.string().optional().describe('Text content. Miro text elements support these HTML tags: <p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>. Example: "<p>This is a <strong>bold</strong> statement.</p>"'),
        // Shape-specific properties
        shape: z.enum(['square', 'rectangle', 'round_rectangle', 'circle', 'triangle', 'rhombus', 
                     'diamond',
                     'oval', 'ellipse',
                     'pill', 'capsule',
                     'arrow',
                     'callout',
                     'cylinder',
                     'parallelogram', 'trapezoid', 'pentagon', 'hexagon', 'octagon', 
                     'wedge_round_rectangle_callout', 'star', 'flow_chart_predefined_process', 
                     'cloud', 'cross', 'can', 'right_arrow', 'left_arrow', 'left_right_arrow', 
                     'left_brace', 'right_brace']).optional().describe('Shape type (for shapes only).'),
    }).optional().describe('Content data based on type.'),
    style: z.object({
        // Generic style properties
        fillColor: z.union([
            z.string().regex(/^#[0-9a-fA-F]{6}$/),
            z.string().regex(/^#[0-9a-fA-F]{3}$/),
            z.string().regex(/^[0-9a-fA-F]{6}$/),  // Allow hex without # prefix
            z.enum(['gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 
                  'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 'light_blue', 
                  'blue', 'dark_blue', 'black', 'white', 'transparent'])
        ]).optional().describe('Background color. Examples: "#FF0000" (red), "#00FF00" (green), "blue", "transparent" (default for text).'),
        fillOpacity: z.number().min(0).max(1).optional().describe('Background opacity from 0.0 (transparent) to 1.0 (solid). Example: 0.5 for semi-transparent.'),
        color: z.string().optional().describe('Text color. Examples: "#000000" (black), "#FF0000" (red), "blue". Default: "#1a1a1a" (dark gray).'),
        fontFamily: z.enum(['arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 
                          'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 
                          'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 
                          'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 
                          'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 
                          'plex_mono', 'spoof', 'tiempos_text', 'formular']).optional().describe('Font family. Examples: "arial", "roboto", "times_new_roman". Default: "arial".'),
        fontSize: z.union([z.string(), z.number()]).optional().describe('Font size in dp. Examples: 14, "24". Default: 14.'),
        textAlign: z.enum(['left', 'right', 'center']).optional().describe('Horizontal text alignment. Default: "left".'),
        textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical text alignment. Default: "middle".'),
        // Shape-specific style properties
        borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Border color for shapes. Must be a hex color. Example: "#000000" for black border.'),
        borderOpacity: z.union([
            z.string().refine(val => {
                const num = parseFloat(val);
                return !isNaN(num) && num >= 0 && num <= 1;
            }, { message: "String opacity must convert to a number between 0 and 1" }),
            z.number().min(0).max(1)
        ]).optional().describe('Border opacity from 0.0 (transparent) to 1.0 (solid). Example: 0.5 for semi-transparent.'),
        borderStyle: z.enum(['normal', 'dotted', 'dashed']).optional().describe('Border style for shapes. Default: "normal".'),
        borderWidth: z.union([
            z.string().refine(val => {
                const num = parseFloat(val);
                return !isNaN(num) && num >= 0 && num <= 24;
            }, { message: "String border width must convert to a number between 0 and 24" }),
            z.number().min(0).max(24)
        ]).optional().describe('Border width in dp (0-24). Example: 2 for a thin border. Default: 1.'),
        // Accept additional style properties that might not be directly supported by Miro
        fontWeight: z.string().optional().describe('Font weight (not directly supported by Miro API).'),
        // Also allow "content" in style since shapes need it there
        content: z.string().optional().describe('Alternative location for text content (for shapes).'),
    }).optional().describe('Styling options. Use appropriate properties for each item type. Text items support color, fontFamily, fontSize, textAlign. Shapes support all style properties. Sticky notes only support specific named colors (not hex).'),
    position: z.object({
        x: z.number().describe('X-axis coordinate in dp. Example: 0 for center of board.'),
        y: z.number().describe('Y-axis coordinate in dp. Example: 0 for center of board.'),
        origin: z.enum(['center']).optional().describe('Origin point for coordinates. Default: "center".'),
        relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().describe('Coordinate system reference. Default: "canvas_center".')
    }).optional().describe('Position on the board. If omitted, item will be placed at center of the board.'),
    geometry: z.object({
        width: z.number().optional().describe('Width in dp. Example: 200. Default for text: 105.'),
        height: z.number().optional().describe('Height in dp. Example: 100. For text items, height is calculated automatically.'),
        rotation: z.number().optional().describe('Rotation angle in degrees. Example: 45 for a 45-degree rotation. Default: 0.'),
    }).optional().describe('Dimensions and rotation. If omitted, default sizing is applied.'),
    parent: z.object({ id: z.string() }).optional().describe('Parent frame ID to place this item inside a frame.')
}).refine(
    data => !(['get', 'update', 'delete'].includes(data.action)) || data.item_id, 
    { message: 'item_id is required for get, update, and delete actions', path: ['item_id'] }
).refine(
    data => !(['create'].includes(data.action)) || data.data, 
    { message: 'data is required for create action', path: ['data'] }
);

type ContentItemParams = z.infer<typeof ContentItemSchema>;

// Implementation of content item operations tool
export const contentItemOperationsTool: ToolDefinition<ContentItemParams> = {
    name: 'mcp_miro_content_item_operations',
    description: `Creates and manages content on Miro boards including text, shapes with text, and sticky notes.

ACTIONS:
(1) CREATE - Add new items with specified properties:
   - Text: Supports basic HTML formatting (<p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>)
   - Shapes: 25+ types (rectangle, circle, arrow, etc.) with customizable borders, fill colors
   - Sticky notes: Simple colored notes (limited to named colors like "yellow", "blue", "green")

(2) GET - Retrieve a specific item's details
(3) GET_ALL - List all items of a specific type
(4) UPDATE - Modify existing items' content or appearance
(5) DELETE - Remove items entirely

STYLING EXAMPLES:
- Text: {color: "#FF0000", fontFamily: "roboto", fontSize: 18, textAlign: "center"}
- Shape: {fillColor: "#E6F9FF", fillOpacity: 0.5, borderColor: "#0000FF", borderWidth: 2}
- Sticky note: {fillColor: "yellow"} (only accepts named colors, not hex values)

POSITIONING: 
- All items can be precisely positioned with x/y coordinates
- Default position is the center of the board if not specified
- Can be placed inside frames using the parent parameter

For all items, omitted parameters will use reasonable defaults. For sticky notes, only specific named colors are supported, not hex values.`,
    parameters: ContentItemSchema,
    execute: async (args) => {
        console.log(`Content Item Operation: ${JSON.stringify(args, null, 2)}`);
        const { action, item_id, type, geometry, parent } = args;
        let { data } = args;
        const style = args.style;
        let url = '';
        let method = '';
        let queryParams: Record<string, string> = {};
        const body: Record<string, unknown> = {};

        // Validate HTML content for Miro compatibility
        if (data?.content && containsHtml(data.content)) {
            console.log(`HTML content detected. Validating for Miro compatibility.`);
            const originalContent = data.content;
            data = { ...data, content: validateHtmlForMiro(data.content) };
            
            if (data.content !== originalContent) {
                console.log(`Modified HTML content to use only Miro-supported tags (<p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>).`);
            }
        }

        // Process text elements properly
        if (type === 'text') {
            console.log(`Handling native text element. Miro text elements support a limited set of HTML tags.`);
            
            // Check if parent frame exists (if specified)
            if (parent && parent.id) {
                try {
                    console.log(`Verifying parent frame exists: ${parent.id}`);
                    const frameCheckUrl = `/v2/boards/${miroBoardId}/frames/${parent.id}`;
                    try {
                        await miroClient.get(frameCheckUrl);
                        console.log(`Parent frame exists: ${parent.id}`);
                    } catch (error) {
                        // If frame doesn't exist, log warning and continue without parent
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.warn(`Parent frame with ID ${parent.id} doesn't exist or is not accessible: ${errorMessage}`);
                        
                        // Remove parent from the request to prevent API errors
                        delete body.parent;
                    }
                } catch (frameError) {
                    console.error(`Parent frame check failed: ${frameError}`);
                    throw new Error(`The parent frame with ID ${parent.id} does not exist or is not accessible. Please check the parent frame ID.`);
                }
            }
            
            // For text elements, ensure we have the content in the right place
            if (data && !data.content && style?.content) {
                data = { ...data, content: style.content };
            }
            
            // Helper function to normalize color value formatting
            const normalizeColor = (colorValue: unknown): string => {
                if (!colorValue) {
                    return '#1a1a1a'; // Default black
                }
                
                if (colorValue === 'transparent') {
                    return 'transparent';
                }
                
                if (typeof colorValue === 'string') {
                    // Convert uppercase hex codes to lowercase for consistency
                    const lowerColor = colorValue.toLowerCase();
                    
                    // If it's already a valid hex color, use it
                    if (lowerColor.match(/^#[0-9a-f]{6}$/)) {
                        return lowerColor;
                    }
                    
                    // Handle common color names
                    const colorMap: Record<string, string> = {
                        'black': '#000000',
                        'white': '#ffffff',
                        'red': '#ff0000',
                        'green': '#00ff00',
                        'blue': '#0000ff',
                        'yellow': '#ffff00',
                        'cyan': '#00ffff',
                        'magenta': '#ff00ff',
                        'gray': '#808080',
                        'grey': '#808080'
                    };
                    
                    if (colorMap[lowerColor]) {
                        return colorMap[lowerColor];
                    }
                    
                    // Handle shortened hex format (#RGB)
                    if (lowerColor.match(/^#[0-9a-f]{3}$/)) {
                        return `#${lowerColor[1]}${lowerColor[1]}${lowerColor[2]}${lowerColor[2]}${lowerColor[3]}${lowerColor[3]}`;
                    }
                    
                    // Handle RGB format without # (add the #)
                    if (lowerColor.match(/^[0-9a-f]{6}$/)) {
                        return `#${lowerColor}`;
                    }
                }
                
                return '#1a1a1a'; // Default
            };
            
            // Helper function to normalize font family names
            const normalizeFontFamily = (fontFamily: unknown): string => {
                if (!fontFamily) return 'arial'; // Default
                
                if (typeof fontFamily !== 'string') return 'arial';
                
                // List of supported Miro font families
                const supportedFonts = [
                    'arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 
                    'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 
                    'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 
                    'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 
                    'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 
                    'plex_mono', 'spoof', 'tiempos_text', 'formular'
                ];
                
                // Direct match
                const fontLower = fontFamily.toLowerCase();
                if (supportedFonts.includes(fontLower)) {
                    return fontLower;
                }
                
                // Check for close matches with underscores vs hyphens or spaces
                const fontNoSpaces = fontLower.replace(/[-\s]/g, '_');
                if (supportedFonts.includes(fontNoSpaces)) {
                    return fontNoSpaces;
                }
                
                // Common font family mappings
                const fontMap: Record<string, string> = {
                    'permanentmarker': 'permanent_marker',
                    'roboto': 'roboto',
                    'arial': 'arial',
                    'plexsans': 'plex_sans',
                    'sans': 'arial',
                    'serif': 'pt_serif',
                    'monospace': 'roboto_mono',
                    'courier': 'roboto_mono',
                    'helvetica': 'arial',
                    'times': 'times_new_roman'
                };
                
                const fontNoSpecialChars = fontLower.replace(/[^a-z0-9]/g, '');
                if (fontMap[fontNoSpecialChars]) {
                    return fontMap[fontNoSpecialChars];
                }
                
                return 'arial'; // Default
            };
            
            // Process and normalize text styles
            if (style) {
                const textStyle: Record<string, unknown> = {};
                
                // Text color
                if (style.color) {
                    textStyle.color = normalizeColor(style.color);
                }
                
                // Font properties
                if (style.fontFamily) {
                    textStyle.fontFamily = normalizeFontFamily(style.fontFamily);
                }
                
                if (style.fontSize) {
                    textStyle.fontSize = typeof style.fontSize === 'number' ? 
                        String(style.fontSize) : style.fontSize;
                }
                
                // Text alignment
                if (style.textAlign) {
                    textStyle.textAlign = style.textAlign;
                }
                
                // Fill properties (background)
                if (style.fillColor) {
                    textStyle.fillColor = normalizeColor(style.fillColor);
                }
                
                if (typeof style.fillOpacity !== 'undefined') {
                    textStyle.fillOpacity = style.fillOpacity;
                }
                
                // For native text elements in Miro, we don't need border properties
                // as they're not supported for text elements
                
                // Apply the normalized style
                body.style = textStyle;
            } else {
                // Set reasonable defaults for text if no style is provided
                body.style = {
                    color: '#1a1a1a',
                    fontFamily: 'arial',
                    fontSize: '14',
                    textAlign: 'left',
                    fillColor: 'transparent'
                };
            }
        } else {
            // For non-text elements (shapes, sticky notes), use the original normalization
            const normalizedStyle = normalizeStyleValues(style);
            if (normalizedStyle) {
                body.style = normalizedStyle;
            } else if (type === 'sticky_note') {
                // Set default for sticky notes if no style is provided
                body.style = {
                    fillColor: 'yellow'
                };
            } else if (type === 'shape') {
                // Set reasonable defaults for shapes if no style is provided
                body.style = {
                    fillColor: '#ffffff',
                    fillOpacity: 1,
                    borderColor: '#1a1a1a',
                    borderWidth: 1,
                    borderStyle: 'normal'
                };
            }
            
        // Map common shape names to Miro API shape names if needed
        if (type === 'shape' && data && data.shape) {
            const shapeMap: Record<string, string> = {
                'diamond': 'rhombus',
                'oval': 'circle',
                'ellipse': 'circle',
                'pill': 'round_rectangle',
                'capsule': 'round_rectangle',
                'arrow': 'right_arrow',
                'callout': 'wedge_round_rectangle_callout',
                'cylinder': 'can'
            };
            
            if (shapeMap[data.shape]) {
                data.shape = shapeMap[data.shape] as typeof data.shape;
            }
        }
        
        // Handle sticky note specific style requirements
        if (type === 'sticky_note' && normalizedStyle) {
            // Only allow predefined color names for sticky notes
            const validStickyNoteColors = [
                'gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 
                'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 
                'light_blue', 'blue', 'dark_blue', 'black'
            ];
            
            // Create a new processed style object
            const stickyNoteStyle: Record<string, unknown> = {};
            
            // Only copy allowed properties for sticky notes
            if (normalizedStyle.fillColor) {
                // Check if fillColor is a hex value and needs conversion
                if (typeof normalizedStyle.fillColor === 'string' && 
                    normalizedStyle.fillColor.startsWith('#')) {
                    // Map hex colors to nearest predefined color
                    const hexToNameMap: Record<string, string> = {
                        '#ff0000': 'red',
                        '#ff3333': 'red',
                        '#ff6666': 'red',
                        '#ff9999': 'light_pink',
                        '#ffcccc': 'light_pink',
                        '#ffaaaa': 'light_pink',
                        '#00ff00': 'green',
                        '#33ff33': 'light_green',
                        '#66ff66': 'light_green',
                        '#99ff99': 'light_green',
                        '#0000ff': 'blue',
                        '#3333ff': 'blue',
                        '#6666ff': 'light_blue',
                        '#9999ff': 'light_blue',
                        '#ffff00': 'yellow',
                        '#ffff33': 'yellow',
                        '#ffff66': 'light_yellow',
                        '#ffff99': 'light_yellow',
                        '#ff9900': 'orange',
                        '#ff9933': 'orange',
                        '#ff9966': 'orange',
                        '#cc33ff': 'violet',
                        '#9933ff': 'violet',
                        '#ffffff': 'gray',
                        '#f8f8f8': 'gray',
                        '#eeeeee': 'gray',
                        '#dddddd': 'gray',
                        '#cccccc': 'gray',
                        '#000000': 'black',
                        '#333333': 'black',
                        '#666666': 'dark_blue',
                        '#888888': 'gray',
                        '#0052CC': 'blue',
                        '#00CCCC': 'cyan'
                    };
                    
                    // Try to map to a valid color name
                    const lowerHex = normalizedStyle.fillColor.toLowerCase();
                    if (hexToNameMap[lowerHex]) {
                        stickyNoteStyle.fillColor = hexToNameMap[lowerHex];
                        console.log(`Converted hex color ${lowerHex} to Miro sticky note color ${hexToNameMap[lowerHex]}`);
                    } else {
                        // If no exact match, use a default color
                        stickyNoteStyle.fillColor = 'yellow';
                        console.log(`Cannot map hex color ${lowerHex} to a Miro sticky note color. Using default 'yellow'.`);
                    }
                } else if (typeof normalizedStyle.fillColor === 'string') {
                    // Check if it's a valid sticky note color name
                    const colorName = normalizedStyle.fillColor.toLowerCase();
                    
                    // Handle common color name conversions
                    const colorNameMap: Record<string, string> = {
                        'pink': 'pink',
                        'lightpink': 'light_pink',
                        'light-pink': 'light_pink',
                        'light_pink': 'light_pink',
                        'red': 'red',
                        'green': 'green',
                        'lightgreen': 'light_green',
                        'light-green': 'light_green',
                        'light_green': 'light_green',
                        'darkgreen': 'dark_green',
                        'dark-green': 'dark_green',
                        'dark_green': 'dark_green',
                        'blue': 'blue',
                        'lightblue': 'light_blue',
                        'light-blue': 'light_blue',
                        'light_blue': 'light_blue',
                        'darkblue': 'dark_blue',
                        'dark-blue': 'dark_blue',
                        'dark_blue': 'dark_blue',
                        'yellow': 'yellow',
                        'lightyellow': 'light_yellow',
                        'light-yellow': 'light_yellow',
                        'light_yellow': 'light_yellow',
                        'orange': 'orange',
                        'violet': 'violet',
                        'purple': 'violet',
                        'cyan': 'cyan',
                        'aqua': 'cyan',
                        'teal': 'cyan',
                        'gray': 'gray',
                        'grey': 'gray',
                        'black': 'black'
                    };
                    
                    const mappedColor = colorNameMap[colorName];
                    
                    if (mappedColor && validStickyNoteColors.includes(mappedColor)) {
                        stickyNoteStyle.fillColor = mappedColor;
                    } else if (validStickyNoteColors.includes(colorName)) {
                        stickyNoteStyle.fillColor = colorName;
                    } else {
                        // Default to yellow if color is invalid
                        stickyNoteStyle.fillColor = 'yellow';
                        console.log(`Color name '${colorName}' is not a valid Miro sticky note color. Using default 'yellow'.`);
                        console.log(`Valid sticky note colors are: ${validStickyNoteColors.join(', ')}`);
                    }
                } else {
                    // Default to yellow for any other type
                    stickyNoteStyle.fillColor = 'yellow';
                }
            } else {
                // If no fillColor is specified, default to yellow
                stickyNoteStyle.fillColor = 'yellow';
            }
            
            // Copy other valid properties
            ['fontFamily', 'fontSize', 'textAlign', 'content'].forEach(prop => {
                if (normalizedStyle && prop in normalizedStyle) {
                    stickyNoteStyle[prop] = normalizedStyle[prop];
                }
            });
            
            // Use the sticky note specific style
            body.style = stickyNoteStyle;
            }
        }

        // Normalize geometry and position
        const normalizedGeometry = normalizeGeometryValues(geometry);
        const normalizedPosition = normalizePositionValues(args.position);
        
        // Set default width for text if not provided
        if (type === 'text' && (!normalizedGeometry || !normalizedGeometry.width)) {
            body.geometry = { 
                ...normalizedGeometry,
                width: 105 // Default text width
            };
        }
        // Handle geometry constraints for sticky notes
        else if (type === 'sticky_note' && normalizedGeometry) {
            // For sticky notes, only include one dimension (width or height)
            if (normalizedGeometry.width && normalizedGeometry.height) {
                const { width } = normalizedGeometry;
                body.geometry = { width };
            } else {
                body.geometry = normalizedGeometry;
            }
        } else if (normalizedGeometry) {
            body.geometry = normalizedGeometry;
        } else if (type === 'shape') {
            // Set default geometry for shapes if not provided
            body.geometry = {
                width: 100,
                height: 100
            };
        }
        
        // Add position if provided, otherwise use center of board
        if (normalizedPosition) {
            body.position = normalizedPosition;
        } else {
            body.position = {
                x: 0,
                y: 0,
                origin: 'center',
                relativeTo: 'canvas_center'
            };
        }
        
        // Add data if provided
        if (data) {
            body.data = data;
        }
        
        // Add parent if provided
        if (parent) {
            body.parent = parent;
        }

        // Build the API request based on action
        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/${type === 'sticky_note' ? 'sticky_notes' : `${type}s`}`;
                method = 'post';
                break;
            case 'get_all':
                url = `/v2/boards/${miroBoardId}/items`;
                method = 'get';
                queryParams = { type };
                break;
            case 'get':
                url = `/v2/boards/${miroBoardId}/${type === 'sticky_note' ? 'sticky_notes' : `${type}s`}/${item_id}`;
                method = 'get';
                break;
            case 'update':
                url = `/v2/boards/${miroBoardId}/${type === 'sticky_note' ? 'sticky_notes' : `${type}s`}/${item_id}`;
                method = 'patch';
                break;
            case 'delete':
                url = `/v2/boards/${miroBoardId}/${type === 'sticky_note' ? 'sticky_notes' : `${type}s`}/${item_id}`;
                method = 'delete';
                break;
        }

        console.log(`Executing content_item_operations (${action} ${type}): ${method.toUpperCase()} ${url}`);
            console.log(`With body: ${JSON.stringify(body)}`);
        if (Object.keys(queryParams).length > 0) {
            console.log(`With query params: ${JSON.stringify(queryParams)}`);
        }

        // Execute the API request
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
            // Enhanced error handling
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error as { response: { status: number; data: unknown } };
                
                // Handle specific error cases
                if (axiosError.response.status === 404 && parent) {
                    return formatApiError(error, `Error: The parent frame with ID ${parent.id} does not exist or is not accessible.`);
                } else if (axiosError.response.status === 400 && style && type === 'sticky_note') {
                    // More specific error for sticky note color issues
                    const validColors = ['gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 'light_blue', 'blue', 'dark_blue', 'black'];
                    return formatApiError(error, `Error: Invalid style properties for sticky note. Sticky notes only accept specific named colors: ${validColors.join(', ')}. Hex color values are not supported for sticky notes.`);
                } else if (axiosError.response.status === 400 && data?.content && containsHtml(data.content)) {
                    // Updated error message for HTML formatting issues
                    return formatApiError(error, `Error: HTML formatting validation failed. Miro only supports these HTML tags: <p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>. Other HTML tags will be escaped as plain text.`);
                } else if (axiosError.response.status === 400 && style && style.color) {
                    // Specific error for color format issues
                    return formatApiError(error, `Error: Invalid color format. Colors must be valid hex values (e.g., "#FF0000" for red) or named colors. Make sure to include the # prefix for hex colors.`);
                } else if (axiosError.response.status === 400 && style) {
                    // Log more details about what might be wrong with style
                    console.error(`Style properties that might be causing issues: ${JSON.stringify(style)}`);
                    return formatApiError(error, `Error: Invalid style properties for ${type}. For colors, use hex format like "#FF0000" or valid color names. For text, use properties like color, fontFamily, fontSize, textAlign. For shapes, you can also use borderColor, borderWidth, fillColor, fillOpacity.`);
                } else if (axiosError.response.status === 400 && parent) {
                    // Position outside parent boundaries
                    return formatApiError(error, `Error: Position is outside parent frame boundaries. When placing items in a frame, ensure coordinates are within the frame's dimensions or use 'parent_top_left' as the relativeTo reference.`);
                }
            }
            return formatApiError(error);
        }
    },
}; 