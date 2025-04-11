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
 * Converts HTML to rich text format that Miro can handle
 * Basic converter that handles common HTML tags
 */
const convertHtmlToPlainText = (html: string): string => {
  if (!containsHtml(html)) return html;
  
  let result = html;
  
  // Replace heading tags with text and newlines
  result = result.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '$1\n');
  result = result.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '$1\n');
  result = result.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '$1\n');
  result = result.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '$1\n');
  result = result.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '$1\n');
  result = result.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '$1\n');
  
  // Replace paragraph tags
  result = result.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n');
  
  // Replace list items
  result = result.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  
  // Replace br tags
  result = result.replace(/<br\s*\/?>/gi, '\n');
  
  // Replace formatting tags
  result = result.replace(/<b[^>]*>(.*?)<\/b>/gi, '$1');
  result = result.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '$1');
  result = result.replace(/<i[^>]*>(.*?)<\/i>/gi, '$1');
  result = result.replace(/<em[^>]*>(.*?)<\/em>/gi, '$1');
  
  // Remove other tags
  result = result.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');
  result = result.replace(/&quot;/g, '"');
  result = result.replace(/&#39;/g, "'");
  
  // Clean up multiple newlines
  result = result.replace(/\n\s*\n/g, '\n\n');
  
  return result;
};

// Schema definitions for content items
const ContentItemSchema = z.object({
    action: z.enum(['create', 'get', 'get_all', 'update', 'delete']).describe('The action to perform.'),
    type: z.enum(['shape', 'text', 'sticky_note']).describe('The type of content item.'),
    item_id: z.string().optional().describe('Item ID (required for get, update, delete actions).'),
    data: z.object({
        // Generic content properties - allow HTML content with looser validation
        content: z.string().optional().describe('Text content. For rich text, use Markdown-like formatting (e.g., **bold**, *italic*) or simple newlines. HTML tags will be automatically converted to plain text.'),
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
                     'left_brace', 'right_brace']).optional().describe('Shape type (for shapes and sticky notes).'),
    }).optional().describe('Content data based on type.'),
    style: z.object({
        // Generic style properties - allow all for text since we'll convert to shape
        fillColor: z.union([
            z.string().regex(/^#[0-9a-fA-F]{6}$/),
            z.string().regex(/^#[0-9a-fA-F]{3}$/),
            z.string().regex(/^[0-9a-fA-F]{6}$/),  // Allow hex without # prefix
            z.enum(['gray', 'light_yellow', 'yellow', 'orange', 'light_green', 'green', 
                  'dark_green', 'cyan', 'light_pink', 'pink', 'violet', 'red', 'light_blue', 
                  'blue', 'dark_blue', 'black', 'white', 'transparent'])
        ]).optional().describe('Background color. Accepts hex colors (with or without #), named colors, or "transparent".'),
        fillOpacity: z.number().min(0).max(1).optional().describe('Background opacity (0.0-1.0).'),
        color: z.string().optional().describe('Text color. Accepts hex colors (with or without #) or color names.'),
        fontFamily: z.enum(['arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 
                          'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 
                          'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 
                          'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 
                          'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 
                          'plex_mono', 'spoof', 'tiempos_text', 'formular']).optional().describe('Font family.'),
        fontSize: z.union([z.string(), z.number()]).optional().describe('Font size in dp.'),
        textAlign: z.enum(['left', 'right', 'center']).optional().describe('Horizontal text alignment.'),
        textAlignVertical: z.enum(['top', 'middle', 'bottom']).optional().describe('Vertical text alignment.'),
        // Shape-specific style - also allowed for text since we'll convert to shape
        borderColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Border color.'),
        borderOpacity: z.union([
            z.string().refine(val => {
                const num = parseFloat(val);
                return !isNaN(num) && num >= 0 && num <= 1;
            }, { message: "String opacity must convert to a number between 0 and 1" }),
            z.number().min(0).max(1)
        ]).optional().describe('Border opacity (0.0-1.0).'),
        borderStyle: z.enum(['normal', 'dotted', 'dashed']).optional().describe('Border style.'),
        borderWidth: z.union([
            z.string().refine(val => {
                const num = parseFloat(val);
                return !isNaN(num) && num >= 0 && num <= 24;
            }, { message: "String border width must convert to a number between 0 and 24" }),
            z.number().min(0).max(24)
        ]).optional().describe('Border width.'),
        // Accept additional style properties that might not be directly supported by Miro
        fontWeight: z.string().optional().describe('Font weight (not directly supported by Miro API).'),
        // Also allow "content" in style since shapes need it there
        content: z.string().optional().describe('Text content for shapes.'),
    }).optional().describe('Styling options.'),
    position: z.object({
        x: z.number().describe('X-axis coordinate.'),
        y: z.number().describe('Y-axis coordinate.'),
        origin: z.enum(['center']).optional().describe('Origin point for coordinates.'),
        relativeTo: z.enum(['canvas_center', 'parent_top_left']).optional().describe('Coordinate system reference.')
    }).optional().describe('Position on the board.'),
    geometry: z.object({
        width: z.number().optional().describe('Width in pixels.'),
        height: z.number().optional().describe('Height in pixels.'),
        rotation: z.number().optional().describe('Rotation angle in degrees.'),
    }).optional().describe('Dimensions and rotation.'),
    parent: z.object({ id: z.string() }).optional().describe('Parent frame ID.')
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
    description: 'Creates and manages text-based content on Miro boards including rich text, shapes with text, and sticky notes. Use this tool to: (1) create - add new text elements, shapes, or sticky notes with custom formatting, (2) get - retrieve a specific content item\'s details, (3) get_all - list all items of a specific type, (4) update - modify existing items\' content or appearance, (5) delete - remove items entirely. Text content should use simple text formatting with newlines for structure - HTML is not directly supported and will be converted to plain text. Shapes come in 25+ variations (rectangles, circles, arrows, etc.) and can contain text. Sticky notes only support specific named colors (like "yellow", "blue", "green"), not hex values. All items can be customized with fonts, borders, and precise positioning. Text elements are automatically converted to rectangle shapes to ensure proper sizing and positioning. Items can be placed anywhere on the board or within frames.',
    parameters: ContentItemSchema,
    execute: async (args) => {
        console.log(`Content Item Operation: ${JSON.stringify(args, null, 2)}`);
        const { action, item_id } = args;
        let { type, data, geometry, parent } = args;
        const style = args.style;
        let url = '';
        let method = '';
        let queryParams: Record<string, string> = {};
        let body: Record<string, unknown> = {};
        let skipBodyConstruction = false;

        // Preprocess any HTML content to plain text for Miro compatibility
        if (data?.content && containsHtml(data.content)) {
            console.log(`HTML content detected. Converting to plain text for Miro compatibility.`);
            const originalContent = data.content;
            data = { ...data, content: convertHtmlToPlainText(data.content) };
            console.log(`Converted HTML content:
              Original: "${originalContent.substring(0, 50)}${originalContent.length > 50 ? '...' : ''}"
              Converted: "${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}"
            `);
        }

        // ALWAYS convert text to shape, regardless of action
        // This ensures we maintain control over sizing and positioning
        const forcedShapeConversion = type === 'text';
        if (forcedShapeConversion) {
            console.log(`IMPORTANT: Always converting 'text' elements to 'shape' elements with dashed borders.
            This is a deliberate strategy to avoid Miro's text sizing issues.
            All text content will be wrapped in a rectangle with proper dimensions.`);
            
            // Step 1.1: Check if parent frame exists (if specified)
            let frameInfo: { width: number; height: number; x: number; y: number } | null = null;

            if (parent && parent.id) {
                try {
                    console.log(`Verifying parent frame exists: ${parent.id}`);
                    const frameCheckUrl = `/v2/boards/${miroBoardId}/frames/${parent.id}`;
                    try {
                        const frameResponse = await miroClient.get(frameCheckUrl);
                        console.log(`Parent frame exists: ${parent.id}`);
                        
                        // Store frame dimensions for boundary checking
                        const frameData = frameResponse.data;
                        const frameWidth = frameData.geometry?.width || 0;
                        const frameHeight = frameData.geometry?.height || 0;
                        const frameX = frameData.position?.x || 0;
                        const frameY = frameData.position?.y || 0;
                        
                        console.log(`Frame dimensions: width=${frameWidth}, height=${frameHeight}, position=(${frameX}, ${frameY})`);
                        
                        // Save frame info for position adjustment later
                        frameInfo = {
                            width: frameWidth,
                            height: frameHeight,
                            x: frameX,
                            y: frameY
                        };
                    } catch (error) {
                        // If frame doesn't exist, log warning and continue without parent
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.warn(`Parent frame with ID ${parent.id} doesn't exist or is not accessible: ${errorMessage}`);
                        
                        // Remove parent from the request to prevent API errors
                        parent = undefined;
                    }
                } catch (frameError) {
                    console.error(`Parent frame check failed: ${frameError}`);
                    throw new Error(`The parent frame with ID ${parent.id} does not exist or is not accessible. Please check the parent frame ID.`);
                }
            }
            
            // Extract the text content from data
            const textContent = data?.content || '';
            
            // Change the type from text to shape
            type = 'shape';
            
            // Create the proper shape data object
            data = {
                shape: 'rectangle',  // Rectangle with dashed border
                content: textContent // Text content goes in data.content
            };
            
            // Create a clean style object for the shape
            const styleToUse = style || {};
            
            // Create a properly structured style object according to Miro API
            // Ensure all numeric values are formatted as strings with decimal points
            const textStyle: Record<string, unknown> = {};
            
            // Helper function to validate and normalize color properties with better logging
            const normalizeColor = (colorValue: unknown): string => {
                console.log(`Normalizing color: ${colorValue} (type: ${typeof colorValue})`);
                
                if (!colorValue) {
                    console.log(`No color provided, using default black (#1a1a1a)`);
                    return '#1a1a1a'; // Default black
                }
                
                if (colorValue === 'transparent') {
                    console.log(`Color is 'transparent', keeping as is`);
                    return 'transparent';
                }
                
                if (typeof colorValue === 'string') {
                    // Convert uppercase hex codes to lowercase for consistency
                    const lowerColor = colorValue.toLowerCase();
                    
                    // If it's already a valid hex color, use it
                    if (lowerColor.match(/^#[0-9a-f]{6}$/)) {
                        console.log(`Valid lowercase hex color detected: ${lowerColor}`);
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
                        console.log(`Color name '${lowerColor}' mapped to ${colorMap[lowerColor]}`);
                        return colorMap[lowerColor];
                    }
                    
                    // Handle shortened hex format (#RGB)
                    if (lowerColor.match(/^#[0-9a-f]{3}$/)) {
                        const expanded = `#${lowerColor[1]}${lowerColor[1]}${lowerColor[2]}${lowerColor[2]}${lowerColor[3]}${lowerColor[3]}`;
                        console.log(`Short hex color ${lowerColor} expanded to ${expanded}`);
                        return expanded;
                    }
                    
                    // Handle RGB format without # (add the #)
                    if (lowerColor.match(/^[0-9a-f]{6}$/)) {
                        console.log(`Adding # prefix to hex color: ${lowerColor} -> #${lowerColor}`);
                        return `#${lowerColor}`;
                    }
                    
                    // Handle hex codes with uppercase letters
                    if (colorValue.match(/^#[0-9A-Fa-f]{6}$/)) {
                        console.log(`Converting uppercase hex to lowercase: ${colorValue} -> ${lowerColor}`);
                        return lowerColor;
                    }
                }
                
                console.log(`Unrecognized color format: ${colorValue}, using default (#1a1a1a)`);
                return '#1a1a1a';
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
                    console.log(`Font family matched directly: ${fontLower}`);
                    return fontLower;
                }
                
                // Check for close matches with underscores vs hyphens or spaces
                const fontNoSpaces = fontLower.replace(/[-\s]/g, '_');
                if (supportedFonts.includes(fontNoSpaces)) {
                    console.log(`Font family normalized: ${fontFamily} -> ${fontNoSpaces}`);
                    return fontNoSpaces;
                }
                
                // Common font family mappings that LLMs might use
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
                    console.log(`Font family mapped: ${fontFamily} -> ${fontMap[fontNoSpecialChars]}`);
                    return fontMap[fontNoSpecialChars];
                }
                
                // Fallback to default if no match found
                console.log(`Font family not recognized: ${fontFamily}, using default (arial)`);
                return 'arial';
            };
            
            // Text styling with proper normalization
            console.log(`Original style object: ${JSON.stringify(styleToUse, null, 2)}`);

            textStyle.color = normalizeColor(styleToUse.color);
            textStyle.fontSize = styleToUse.fontSize 
                ? String(typeof styleToUse.fontSize === 'string' ? styleToUse.fontSize : styleToUse.fontSize)
                : '14';
            textStyle.fontFamily = normalizeFontFamily(styleToUse.fontFamily);
            textStyle.textAlign = styleToUse.textAlign || 'center';
            textStyle.textAlignVertical = 'top';
            
            // Border styling - dashed border for visual clarity
            textStyle.borderStyle = 'dashed';
            textStyle.borderWidth = '1.0';
            textStyle.borderOpacity = '1.0';
            textStyle.borderColor = normalizeColor(styleToUse.borderColor || '#888888');
            
            // Fill styling with proper handling of special values
            if (styleToUse.fillColor === 'transparent') {
                textStyle.fillColor = 'transparent';
            } else {
                textStyle.fillColor = normalizeColor(styleToUse.fillColor || '#ffffff');
            }
            
            // Handle various opacity format possibilities
            if (styleToUse.fillOpacity !== undefined) {
                // Could be number, string with or without decimal point
                if (typeof styleToUse.fillOpacity === 'number') {
                    textStyle.fillOpacity = String(styleToUse.fillOpacity);
                } else if (typeof styleToUse.fillOpacity === 'string') {
                    // Ensure string is properly formatted (e.g., "0.5" not ".5")
                    const numValue = parseFloat(styleToUse.fillOpacity);
                    if (!isNaN(numValue)) {
                        textStyle.fillOpacity = String(numValue);
                    } else {
                        textStyle.fillOpacity = '0.01'; // Default if parsing fails
                    }
                } else {
                    textStyle.fillOpacity = '0.01'; // Default for unexpected types
                }
            } else {
                textStyle.fillOpacity = '0.01'; // Default if not specified
            }
            
            // Full validation of all style properties against Miro's expectations
            try {
                // Validate color values are properly formatted
                if (textStyle.color && typeof textStyle.color === 'string' && !textStyle.color.match(/^#[0-9a-f]{6}$/)) {
                    textStyle.color = normalizeColor(textStyle.color);
                    console.log(`Re-normalized problematic color value to: ${textStyle.color}`);
                }
                
                // Validate text alignment
                if (textStyle.textAlign && 
                    typeof textStyle.textAlign === 'string' && 
                    !['left', 'center', 'right'].includes(textStyle.textAlign.toLowerCase())) {
                    textStyle.textAlign = 'center'; // Default to center if invalid
                    console.log(`Invalid textAlign value, defaulting to center`);
                }
                
                // Convert any numeric values to strings for consistent API format
                if (typeof textStyle.fontSize === 'number') {
                    textStyle.fontSize = String(textStyle.fontSize);
                }
                
                // Log final validated style
                console.log(`Normalized style object for Miro API: ${JSON.stringify(textStyle, null, 2)}`);
            } catch (styleError) {
                console.error(`Error validating style properties: ${styleError}`);
                // Continue with best-effort style object
            }
            
            // When we find HTML in content, adjust size to accommodate it better
            const hasHtml = textContent.includes('<') && textContent.includes('>');
            const hasInlineStyles = textContent.includes('style=');
            console.log(`Content analysis:
              - Contains HTML-like tags: ${hasHtml ? 'Yes' : 'No'}
              - Contains inline styles: ${hasInlineStyles ? 'Yes' : 'No'}
            `);
            
            // Log debug info for complex HTML analysis
            if (hasHtml) {
                // Count different HTML elements to better understand the content
                const headerTags = (textContent.match(/<h[1-6][^>]*>/g) || []).length;
                const paragraphs = (textContent.match(/<p[^>]*>/g) || []).length;
                const spans = (textContent.match(/<span[^>]*>/g) || []).length;
                const strongs = (textContent.match(/<strong[^>]*>/g) || []).length;
                const listItems = (textContent.match(/<li[^>]*>/g) || []).length;
                const unorderedLists = (textContent.match(/<ul[^>]*>/g) || []).length;
                const orderedLists = (textContent.match(/<ol[^>]*>/g) || []).length;
                
                // Count newlines in the content as they often indicate more vertical space needed
                const newlines = (textContent.match(/\n/g) || []).length;
                
                console.log(`HTML Content Analysis:
                - Header tags: ${headerTags}
                - Paragraphs: ${paragraphs}
                - Spans: ${spans}
                - Strong/bold elements: ${strongs}
                - List items: ${listItems}
                - Unordered lists: ${unorderedLists}
                - Ordered lists: ${orderedLists}
                - Newlines: ${newlines}
                `);
                
                // Estimate total "block elements" that need vertical space
                const totalBlockElements = headerTags + paragraphs + listItems + unorderedLists + orderedLists + Math.floor(newlines / 2);
                console.log(`Estimated total block elements requiring vertical space: ${totalBlockElements}`);
            }
            
            // Set appropriate dimensions if not provided
            if (!geometry) {
                // Calculate size based on text length and fontSize
                const textLength = textContent.toString().length;
                const fontSize = typeof textStyle.fontSize === 'string' ? 
                    parseFloat(textStyle.fontSize) : 14;
                
                // For HTML content, we need more width to render properly
                let estimatedWidth = Math.max(120, textLength * (fontSize * 0.6));
                let estimatedHeight = Math.max(40, fontSize * 2); // Height proportional to font size
                
                // Adjust for HTML content if present
                if (hasHtml) {
                    // Count block elements for a better height estimate
                    const blockElements = (textContent.match(/<(h1|h2|h3|h4|h5|h6|p|div|blockquote)/g) || []).length;
                    const listItems = (textContent.match(/<li[^>]*>/g) || []).length;
                    const lists = ((textContent.match(/<ul[^>]*>/g) || []).length) + ((textContent.match(/<ol[^>]*>/g) || []).length);
                    const newlines = (textContent.match(/\n/g) || []).length;
                    
                    // Calculate a better estimate of total vertical elements
                    const totalVerticalElements = blockElements + listItems + lists + Math.floor(newlines / 2);
                    console.log(`Total vertical elements for height calculation: ${totalVerticalElements}`);
                    
                    // Process inline styles if present
                    if (hasInlineStyles) {
                        // Check for font size specifications in inline styles
                        const inlineStyleFontSizes = textContent.match(/font-size:\s*(\d+)px/g);
                        if (inlineStyleFontSizes && inlineStyleFontSizes.length > 0) {
                            // Extract the largest font size from inline styles
                            const fontSizes = inlineStyleFontSizes.map(style => {
                                const match = style.match(/font-size:\s*(\d+)px/);
                                return match ? parseInt(match[1], 10) : 0;
                            });
                            
                            const maxInlineFontSize = Math.max(...fontSizes, 0);
                            if (maxInlineFontSize > 0) {
                                // Use the largest inline font size for calculations
                                const listMultiplier = listItems > 0 ? 1.3 : 1.0;
                                estimatedHeight = Math.max(estimatedHeight, (totalVerticalElements + 1) * maxInlineFontSize * 1.8 * listMultiplier);
                            } else {
                                // Default height calculation with list multiplier
                                const listMultiplier = listItems > 0 ? 1.4 : 1.0;
                                estimatedHeight = Math.max(estimatedHeight, (totalVerticalElements + 1) * fontSize * 2.2 * listMultiplier);
                            }
                        } else {
                            // No specific font sizes found
                            const listMultiplier = listItems > 0 ? 1.4 : 1.0;
                            estimatedHeight = Math.max(estimatedHeight, (totalVerticalElements + 1) * fontSize * 2.2 * listMultiplier);
                        }
                    } else {
                        // No inline styles
                        const listMultiplier = listItems > 0 ? 1.5 : 1.0;
                        estimatedHeight = Math.max(estimatedHeight, (totalVerticalElements + 1) * fontSize * 2.5 * listMultiplier);
                    }
                    
                    // Add extra height for content with lots of list items
                    if (listItems > 5) {
                        // For many list items, add even more extra space
                        estimatedHeight += listItems * fontSize * 0.7;
                    }
                    
                    // For content with both lists and paragraphs, add extra spacing for visual separation
                    if (listItems > 0 && (blockElements - lists) > 0) {
                        estimatedHeight += Math.min(lists, (blockElements - lists)) * fontSize * 1.2;
                    }
                    
                    // HTML with complex content needs more width too
                    estimatedWidth = Math.max(estimatedWidth, 300);
                }
                
                geometry = {
                    width: estimatedWidth,
                    height: estimatedHeight
                };
            }
            
            // Adjust position.relativeTo if parent is specified
            let positionToUse = args.position || { x: 0, y: 0 };
            if (parent && parent.id && positionToUse) {
                // Clone the position object
                positionToUse = { ...positionToUse };
                
                // For items inside frames, positions should be relative to parent_top_left
                if (positionToUse.relativeTo === 'canvas_center') {
                    console.log('Adjusting position reference for parent frame: changing relativeTo from canvas_center to parent_top_left');
                    positionToUse.relativeTo = 'parent_top_left';
                    
                    // Calculate item dimensions for boundary checks
                    const itemWidth = geometry?.width || 100; // Default if not specified
                    const itemHeight = geometry?.height || 50; // Default if not specified
                    
                    if (frameInfo) {
                        // Get frame dimensions
                        const frameWidth = frameInfo.width;
                        const frameHeight = frameInfo.height;
                        
                        // Three options for handling position:
                        // 1. Try to keep the original relative position but ensure it's within boundaries
                        // 2. Center the item in the frame (if original position is problematic)
                        // 3. Use a smart position that places item in a visually appealing location
                        
                        // For simplicity, we'll use a combination of approaches:
                        
                        // Ensure padding from frame edges (10% of frame width/height)
                        const paddingX = frameWidth * 0.1;
                        const paddingY = frameHeight * 0.1;
                        
                        // Calculate valid position range to keep item fully within frame
                        const minX = paddingX;
                        const maxX = frameWidth - itemWidth - paddingX;
                        const minY = paddingY;
                        const maxY = frameHeight - itemHeight - paddingY;
                        
                        console.log(`Valid position range: X(${minX}:${maxX}), Y(${minY}:${maxY})`);
                        
                        // Option 1: Try to map the canvas_center coordinates to parent_top_left
                        // This is a simplified conversion - we'll just use the center or top of the frame
                        if (maxX >= minX && maxY >= minY) {
                            // Frame is big enough to contain the item
                            positionToUse.x = frameWidth / 2 - itemWidth / 2; // Center horizontally
                            positionToUse.y = Math.min(paddingY * 2, maxY);   // Near the top with padding
                            
                            console.log(`Positioned item at (${positionToUse.x}, ${positionToUse.y}) within parent frame`);
                        } else {
                            // Frame is too small for the item - center it and let Miro handle it
                            positionToUse.x = frameWidth / 2;
                            positionToUse.y = frameHeight / 2;
                            console.log(`Frame too small for item. Using center position and letting Miro adjust.`);
                        }
                    }
                }
            }
            
            // If the user only provided width but not height, calculate an appropriate height
            if (geometry && geometry.width && !geometry.height) {
                console.log(`User provided width (${geometry.width}) but no height. Calculating appropriate height.`);
                
                // Get font size
                const fontSize = typeof textStyle.fontSize === 'string' ? 
                    parseFloat(textStyle.fontSize) : 14;
                
                let calculatedHeight = Math.max(40, fontSize * 2);
                
                // Adjust for HTML content if present
                if (hasHtml) {
                    // Count block elements for a better height estimate
                    const blockElements = (textContent.match(/<(h1|h2|h3|h4|h5|h6|p|div|blockquote)/g) || []).length;
                    const listItems = (textContent.match(/<li[^>]*>/g) || []).length;
                    const lists = ((textContent.match(/<ul[^>]*>/g) || []).length) + ((textContent.match(/<ol[^>]*>/g) || []).length);
                    const newlines = (textContent.match(/\n/g) || []).length;
                    
                    // Calculate a better estimate of total vertical elements
                    const totalVerticalElements = blockElements + listItems + lists + Math.floor(newlines / 2);
                    console.log(`Total vertical elements for height calculation: ${totalVerticalElements}`);
                    
                    // Process inline styles if present
                    if (hasInlineStyles) {
                        // Check for font size specifications in inline styles
                        const inlineStyleFontSizes = textContent.match(/font-size:\s*(\d+)px/g);
                        if (inlineStyleFontSizes && inlineStyleFontSizes.length > 0) {
                            // Extract the largest font size from inline styles
                            const fontSizes = inlineStyleFontSizes.map(style => {
                                const match = style.match(/font-size:\s*(\d+)px/);
                                return match ? parseInt(match[1], 10) : 0;
                            });
                            
                            const maxInlineFontSize = Math.max(...fontSizes, 0);
                            if (maxInlineFontSize > 0) {
                                // Use the largest inline font size for calculations
                                const listMultiplier = listItems > 0 ? 1.3 : 1.0;
                                calculatedHeight = Math.max(calculatedHeight, (totalVerticalElements + 1) * maxInlineFontSize * 1.8 * listMultiplier);
                            } else {
                                // Default height calculation with list multiplier
                                const listMultiplier = listItems > 0 ? 1.4 : 1.0;
                                calculatedHeight = Math.max(calculatedHeight, (totalVerticalElements + 1) * fontSize * 2.2 * listMultiplier);
                            }
                        } else {
                            // No specific font sizes found
                            const listMultiplier = listItems > 0 ? 1.4 : 1.0;
                            calculatedHeight = Math.max(calculatedHeight, (totalVerticalElements + 1) * fontSize * 2.2 * listMultiplier);
                        }
                    } else {
                        // No inline styles
                        const listMultiplier = listItems > 0 ? 1.5 : 1.0;
                        calculatedHeight = Math.max(calculatedHeight, (totalVerticalElements + 1) * fontSize * 2.5 * listMultiplier);
                    }
                    
                    // Add extra height for content with lots of list items
                    if (listItems > 5) {
                        // For many list items, add even more extra space
                        calculatedHeight += listItems * fontSize * 0.7;
                    }
                    
                    // For content with both lists and paragraphs, add extra spacing for visual separation
                    if (listItems > 0 && (blockElements - lists) > 0) {
                        calculatedHeight += Math.min(lists, (blockElements - lists)) * fontSize * 1.2;
                    }
                    
                    // Very wide elements need proportionally less height due to text wrapping
                    if (geometry.width > 800) {
                        // For wide elements, reduce height slightly as text has more room to flow horizontally
                        const widthFactor = Math.min(1, 800 / geometry.width);
                        calculatedHeight = Math.max(calculatedHeight * widthFactor, fontSize * 4);
                        console.log(`Wide element (${geometry.width}px): Applied width factor ${widthFactor.toFixed(2)}, adjusted height: ${calculatedHeight}`);
                    }
                }
                
                // Update the geometry with the calculated height
                geometry.height = calculatedHeight;
                console.log(`Calculated appropriate height: ${calculatedHeight}`);
            }
            
            // Log the final text to shape conversion details
            console.log(`Converting text to shape:
              Content: "${textContent.substring(0, 50)}${textContent.length > 50 ? '...' : ''}"
              HTML Content: ${hasHtml ? 'Yes' : 'No'}
              Font Size: ${textStyle.fontSize}
              Final Dimensions: ${geometry.width}x${geometry.height}
              Position: (${positionToUse.x}, ${positionToUse.y})
            `);
            
            // If we've converted a text to shape, construct the body now
            body = {
                data: data,
                style: textStyle,
                position: normalizePositionValues(positionToUse),
                geometry: normalizeGeometryValues(geometry),
                parent: parent
            };
            
            // Skip the later body construction
            skipBodyConstruction = true;
        }
        
        // Step 2: Normalize all values
        const normalizedStyle = normalizeStyleValues(style);
        const normalizedGeometry = normalizeGeometryValues(geometry);
        const normalizedPosition = normalizePositionValues(args.position);
        
        // Step 3: Process data and type-specific adjustments
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
                        console.log(`Mapped hex color ${normalizedStyle.fillColor} to Miro sticky note color name '${stickyNoteStyle.fillColor}'`);
                    } else {
                        // If no exact match, use a default color
                        stickyNoteStyle.fillColor = 'yellow';
                        console.log(`No mapping found for hex color ${normalizedStyle.fillColor}, defaulting to 'yellow'`);
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
                        console.log(`Mapped color name '${colorName}' to valid Miro sticky note color '${mappedColor}'`);
                    } else if (validStickyNoteColors.includes(colorName)) {
                        stickyNoteStyle.fillColor = colorName;
                        console.log(`Using valid Miro sticky note color: '${colorName}'`);
                    } else {
                        // Default to yellow if color is invalid
                        stickyNoteStyle.fillColor = 'yellow';
                        console.log(`Invalid sticky note color name '${colorName}', defaulting to 'yellow'`);
                    }
                } else {
                    // Default to yellow for any other type
                    stickyNoteStyle.fillColor = 'yellow';
                }
            }
            
            // Copy other valid properties
            ['fontFamily', 'fontSize', 'textAlign', 'content'].forEach(prop => {
                if (normalizedStyle && prop in normalizedStyle) {
                    stickyNoteStyle[prop] = normalizedStyle[prop];
                }
            });
            
            // Use the sticky note specific style
            body.style = stickyNoteStyle;
        } else {
            // For other types, use the normalized style
            if (normalizedStyle) {
                body.style = normalizedStyle;
            }
        }
        
        // Handle geometry constraints for sticky notes
        if (type === 'sticky_note' && normalizedGeometry) {
            // For sticky notes, only include one dimension (width or height)
            if (normalizedGeometry.width && normalizedGeometry.height) {
                const { width } = normalizedGeometry;
                body.geometry = { width };
            } else {
                body.geometry = normalizedGeometry;
            }
        } else if (normalizedGeometry) {
            body.geometry = normalizedGeometry;
        }
        
        // Add position if provided
        if (normalizedPosition) {
            body.position = normalizedPosition;
        }
        
        // Add data if provided
        if (data) {
            if (type === 'shape') {
                // For shapes, we need the shape type and content in the data object
                body.data = data;
            } else {
                body.data = data;
            }
        }
        
        // Add parent if provided
        if (parent) {
            body.parent = parent;
        }

        // Step 4: Build the API request based on action
        switch (action) {
            case 'create':
                url = `/v2/boards/${miroBoardId}/${type === 'sticky_note' ? 'sticky_notes' : `${type}s`}`;
                method = 'post';
                
                // Only construct the body if we haven't already done so
                if (!skipBodyConstruction) {
                body = {
                    ...(data && { data }),
                        ...(normalizedStyle && { style: normalizedStyle }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                        ...(normalizedGeometry && { geometry: normalizedGeometry }),
                    ...(parent && { parent }),
                };
                }
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
                
                // Only construct the body if we haven't already done so
                if (!skipBodyConstruction) {
                body = {
                    ...(data && { data }),
                        ...(normalizedStyle && { style: normalizedStyle }),
                    ...(normalizedPosition && { position: normalizedPosition }),
                        ...(normalizedGeometry && { geometry: normalizedGeometry }),
                    ...(parent && { parent }),
                };
                }
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

        // Step 5: Execute the API request
        try {
            let response;

            console.log(`Executing content_item_operations (${action} ${type}): ${method.toUpperCase()} ${url}`);
            console.log(`With body: ${JSON.stringify(body)}`);

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
                } else if (axiosError.response.status === 400 && normalizedStyle && type === 'sticky_note') {
                    // More specific error for sticky note color issues
                    return formatApiError(error, `Error: Invalid style properties for sticky note. Sticky notes only accept specific color names like 'yellow', 'blue', 'green', not hex values or unsupported color names.`);
                } else if (axiosError.response.status === 400 && data?.content && containsHtml(data.content)) {
                    // HTML formatting error
                    return formatApiError(error, `Error: HTML formatting in content caused validation issues. Try using plain text with line breaks instead of HTML tags. HTML content has been converted but may need manual adjustment.`);
                } else if (axiosError.response.status === 400 && normalizedStyle) {
                    // Log more details about what might be wrong with style
                    console.error(`Style properties that might be causing issues: ${JSON.stringify(normalizedStyle)}`);
                    return formatApiError(error, `Error: Invalid style properties for ${type}. Check colors (must be hex format like #FF0000), border values, and other style settings.`);
                } else if (axiosError.response.status === 400 && parent) {
                    // Position outside parent boundaries
                    return formatApiError(error, `Error: Position is outside parent frame boundaries. When placing items in a frame, ensure coordinates are within the frame's dimensions or use 'parent_top_left' as the relativeTo reference.`);
                }
            }
            return formatApiError(error);
        }
    },
}; 