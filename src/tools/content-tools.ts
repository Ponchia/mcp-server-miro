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
 * Provides examples of properly formatted HTML for Miro text elements
 */
const getHtmlFormattingExamples = (): string => {
  return `
Miro Text Element HTML Formatting Examples:

1. Basic paragraph:
   <p>This is a simple paragraph of text.</p>

2. Multiple paragraphs:
   <p>This is the first paragraph.</p>
   <p>This is the second paragraph.</p>

3. Text formatting:
   <p>This text has <strong>bold</strong>, <em>italic</em>, and <u>underlined</u> words.</p>
   <p>You can also use <b>bold</b>, <i>italic</i>, and <s>strikethrough</s>.</p>

4. Links:
   <p>Visit <a href="https://example.com">this website</a> for more information.</p>

5. Lists:
   <p>Unordered list:</p>
   <ul>
     <li>First item</li>
     <li>Second item</li>
     <li>Third item</li>
   </ul>
   
   <p>Ordered list:</p>
   <ol>
     <li>First step</li>
     <li>Second step</li>
     <li>Third step</li>
   </ol>

6. Combining elements:
   <p>This paragraph contains a <strong>bold section</strong> and an <em>italic section</em>.</p>
   <p>You can <a href="https://example.com"><strong>combine</strong> formatting <em>in links</em></a> too.</p>

7. Line breaks:
   <p>This line<br>has a<br>break.</p>

8. Using spans (note that style attributes within spans may not be fully supported):
   <p>Text with <span>span elements</span> for grouping.</p>

Remember: Miro only supports: p, a, strong, b, em, i, u, s, span, ol, ul, li, br tags.
All other tags will be escaped and shown as plain text.
`;
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
  
  // Track any unsupported tags for logging
  const unsupportedTagsFound: string[] = [];
  
  // Define regex to match HTML tags
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  
  // Replace HTML tags
  const sanitizedHtml = html.replace(tagRegex, (match, tagName) => {
    // If the tag is in our supported list, keep it
    if (supportedTags.includes(tagName.toLowerCase())) {
      return match;
    }
    
    // Track unsupported tags for logging
    if (!unsupportedTagsFound.includes(tagName.toLowerCase())) {
      unsupportedTagsFound.push(tagName.toLowerCase());
    }
    
    // For unsupported tags, escape them so they show as plain text
    return match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  });
  
  // Log any unsupported tags that were found and escaped
  if (unsupportedTagsFound.length > 0) {
    console.log(`Warning: Escaped unsupported HTML tags: ${unsupportedTagsFound.join(', ')}. These will appear as plain text in Miro.`);
    console.log(`Miro only supports these HTML tags: ${supportedTags.join(', ')}`);
  }
  
  return sanitizedHtml;
};

/**
 * Processes and enhances span styling to ensure compatibility with Miro
 * Provides support for common style attributes in span elements
 */
const processSpanStyles = (content: string): string => {
  if (!content || !containsHtml(content)) return content;

  // Convert typical CSS style formats to formats Miro accepts
  return content.replace(
    /(<span\s+style=["'])([^"']+)(["'][^>]*>)/gi,
    (match, start: string, styles: string, end: string) => {
      // Process each style attribute individually
      const processedStyles = styles
        .split(';')
        .filter((s: string) => s.trim())
        .map((style: string) => {
          const parts = style.split(':').map(s => s.trim());
          const property = parts[0];
          const value = parts[1];
          
          // Skip if property or value is empty
          if (!property || !value) return '';
          
          // Process specific style properties
          switch (property.toLowerCase()) {
            case 'color': {
              // Ensure color is properly formatted (remove spaces, add # if missing for hex)
              const colorValue = value.replace(/\s/g, '');
              if (/^[0-9a-f]{6}$/i.test(colorValue)) {
                return `color:#${colorValue}`;
              }
              return `color:${colorValue}`;
            }
              
            case 'background-color':
            case 'background': {
              // Background colors for spans
              const bgColor = value.replace(/\s/g, '');
              if (/^[0-9a-f]{6}$/i.test(bgColor)) {
                return `background-color:#${bgColor}`;
              }
              return `background-color:${bgColor}`;
            }
              
            case 'font-weight':
              // Font weight (bold)
              return value.toLowerCase() === 'bold' || parseInt(value, 10) >= 600 ? 
                'font-weight:bold' : 'font-weight:normal';
              
            case 'font-style':
              // Font style (italic)
              return value.toLowerCase() === 'italic' ? 'font-style:italic' : 'font-style:normal';
              
            case 'text-decoration':
              // Text decoration (underline, line-through)
              return `text-decoration:${value}`;
              
            default:
              // Pass through other styles
              return `${property}:${value}`;
          }
        })
        .filter(Boolean)
        .join(';');
      
      return `${start}${processedStyles}${end}`;
    }
  );
};

/**
 * Generates a text-only preview of how HTML content will render in Miro
 */
const generateTextPreview = (htmlContent: string): string => {
  if (!htmlContent) return 'Empty content';
  
  // Simple HTML to text conversion for preview purposes
  let textPreview = htmlContent
    // Replace paragraph tags with newlines
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
    
    // Handle lists
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    
    // Handle links
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2 [$1]')
    
    // Handle breaks
    .replace(/<br\s*\/?>/gi, '\n')
    
    // Remove other tags but keep their content
    .replace(/<[^>]*>/g, '')
    
    // Decode HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Trim excessive whitespace and normalize spacing
  textPreview = textPreview
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  
  // Format the preview nicely
  return [
    '----------------------------------------',
    'TEXT PREVIEW (how it may appear in Miro):',
    '----------------------------------------',
    textPreview,
    '----------------------------------------'
  ].join('\n');
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
   - Text: Supports HTML formatting with specific tags (see HTML formatting section below)
   - Shapes: 25+ types (rectangle, circle, arrow, etc.) with customizable borders, fill colors
   - Sticky notes: Simple colored notes (limited to named colors like "yellow", "blue", "green")

(2) GET - Retrieve a specific item's details
(3) GET_ALL - List all items of a specific type
(4) UPDATE - Modify existing items' content or appearance
(5) DELETE - Remove items entirely

TEXT HTML FORMATTING:
- Supported HTML tags: <p>, <a>, <b>, <strong>, <i>, <em>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>
- All other HTML tags will be escaped and displayed as plain text
- Character limit: 6000 characters
- Expected rendering examples:
  * "<p>Normal paragraph text</p>" → Normal paragraph text
  * "<p>Text with <strong>bold</strong> and <em>italic</em></p>" → Text with bold and italic
  * "<p>Text with <a href='https://example.com'>link</a></p>" → Text with clickable link
  * "<ul><li>First item</li><li>Second item</li></ul>" → Bulleted list with two items
  * "<p>Text with <span style='color:red'>colored span</span></p>" → Note: inline styles in spans may not be fully supported

TEXT STYLE LIMITATIONS:
- Color: Use hex values (#RRGGBB) - Examples: "#FF0000" (red), "#000000" (black)
- Font families: Limited to Miro's supported fonts (arial, roboto, times_new_roman, etc.)
- Font sizes: Numeric values (14 = default, range from 0.001 to unlimited)
- Text alignment: "left" (default), "center", or "right"
- Background color: Set with fillColor (use "transparent" for no background)
- Background opacity: 0.0 (transparent) to 1.0 (solid)

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
            
            // First apply span style processing
            const styledContent = processSpanStyles(data.content);
            
            // Then validate HTML tags
            const originalContent = styledContent;
            data = { ...data, content: validateHtmlForMiro(styledContent) };
            
            // Generate a preview of how the text will look
            if (data?.content) {
                console.log(generateTextPreview(data.content));
            }
            
            if (data.content !== originalContent) {
                console.log(`Modified HTML content to use only Miro-supported tags (<p>, <a>, <strong>, <b>, <em>, <i>, <u>, <s>, <span>, <ol>, <ul>, <li>, <br>).`);
                console.log(`Original: ${originalContent}`);
                console.log(`Modified: ${data.content}`);
            }
        }

        // Process text elements properly
        if (type === 'text') {
            console.log(`Handling native text element. Miro text elements support a limited set of HTML tags.`);
            
            // Different validation approach for updates vs. creates
            if (action === 'update' && data?.content && containsHtml(data.content)) {
                // For updates, we're more lenient with validation to avoid breaking existing content
                console.log('Update operation: Using more lenient HTML validation.');
                
                const supportedTags = ['p', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ol', 'ul', 'li', 'br'];
                const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
                const unsupportedTagsFound: string[] = [];
                
                let match;
                const contentCopy = String(data.content);
                while ((match = tagRegex.exec(contentCopy)) !== null) {
                    const tagName = match[1].toLowerCase();
                    if (!supportedTags.includes(tagName) && !unsupportedTagsFound.includes(tagName)) {
                        unsupportedTagsFound.push(tagName);
                    }
                }
                
                // Just warn about unsupported tags rather than modifying content
                if (unsupportedTagsFound.length > 0) {
                    console.warn(`Warning: Content contains potentially unsupported tags: ${unsupportedTagsFound.join(', ')}`);
                    console.warn('These tags may be escaped as plain text in Miro.');
                }
                
                // Process span styles even for updates
                data = { ...data, content: processSpanStyles(data.content) };
            }
            
            // Ensure text content has proper paragraph tags if it's plain text
            if (data && data.content && !containsHtml(data.content)) {
                // If the content doesn't contain HTML, wrap it in <p> tags for proper Miro formatting
                console.log('Plain text content detected. Wrapping in paragraph tags for proper Miro formatting.');
                data = { ...data, content: `<p>${data.content}</p>` };
            } else if (data && data.content) {
                // Validate and auto-correct HTML content
                const { corrected, changes } = validateAndCorrectHtml(data.content);
                if (changes.length > 0) {
                    console.log('Auto-corrected HTML content issues:');
                    changes.forEach(change => console.log(`- ${change}`));
                    data = { ...data, content: corrected };
                }
            }
            
            // Check if the content is empty or missing and needs a default
            if (data && (!data.content || data.content.trim() === '')) {
                console.log('Empty content detected. Adding default paragraph tag.');
                data = { ...data, content: '<p></p>' };
            }
            
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
                
                // Convert to lowercase for case-insensitive matching
                const fontLower = fontFamily.toLowerCase().trim();
                
                // Comprehensive mapping from common font names to Miro supported font families
                const fontFamilyMap: Record<string, string> = {
                    // Sans-serif fonts
                    'arial': 'arial',
                    'helvetica': 'arial',
                    'helvetica neue': 'arial',
                    'sans-serif': 'arial',
                    'sans': 'arial',
                    'system-ui': 'arial',
                    
                    // Serif fonts
                    'times': 'times_new_roman',
                    'times new roman': 'times_new_roman',
                    'times-new-roman': 'times_new_roman',
                    'timesnewroman': 'times_new_roman',
                    'serif': 'pt_serif',
                    'georgia': 'georgia',
                    
                    // Monospace fonts
                    'courier': 'roboto_mono',
                    'courier new': 'roboto_mono',
                    'courier-new': 'roboto_mono',
                    'monospace': 'roboto_mono',
                    'menlo': 'roboto_mono',
                    'consolas': 'roboto_mono',
                    'monaco': 'roboto_mono',
                    
                    // Google fonts and common web fonts
                    'roboto': 'roboto',
                    'roboto condensed': 'roboto_condensed',
                    'roboto-condensed': 'roboto_condensed',
                    'robotocondensed': 'roboto_condensed',
                    'roboto slab': 'roboto_slab',
                    'roboto-slab': 'roboto_slab',
                    'robotoslab': 'roboto_slab',
                    'open sans': 'open_sans',
                    'open-sans': 'open_sans',
                    'opensans': 'open_sans',
                    'pt sans': 'pt_sans',
                    'pt-sans': 'pt_sans',
                    'ptsans': 'pt_sans',
                    'pt serif': 'pt_serif',
                    'pt-serif': 'pt_serif',
                    'ptserif': 'pt_serif',
                    'pt sans narrow': 'pt_sans_narrow',
                    'pt-sans-narrow': 'pt_sans_narrow',
                    'ptsansnarrow': 'pt_sans_narrow',
                    
                    // Creative fonts
                    'marker': 'permanent_marker',
                    'permanent marker': 'permanent_marker',
                    'permanent-marker': 'permanent_marker',
                    'permanentmarker': 'permanent_marker',
                    'handwriting': 'caveat',
                    'script': 'caveat',
                    'caveat': 'caveat',
                    'comic': 'bangers',
                    'comic sans': 'bangers',
                    'bangers': 'bangers',
                    'cursive': 'caveat',
                    'abril fatface': 'abril_fatface',
                    'abril-fatface': 'abril_fatface',
                    'abrilfatface': 'abril_fatface',
                    
                    // IBM fonts
                    'ibm plex sans': 'plex_sans',
                    'ibm-plex-sans': 'plex_sans',
                    'plexsans': 'plex_sans',
                    'ibm plex serif': 'plex_serif',
                    'ibm-plex-serif': 'plex_serif',
                    'plexserif': 'plex_serif',
                    'ibm plex mono': 'plex_mono',
                    'ibm-plex-mono': 'plex_mono',
                    'plexmono': 'plex_mono',
                    
                    // Japanese/Chinese/Korean fonts
                    'noto sans': 'noto_sans',
                    'noto-sans': 'noto_sans',
                    'notosans': 'noto_sans',
                    'noto serif': 'noto_serif',
                    'noto-serif': 'noto_serif',
                    'notoserif': 'noto_serif',
                    'noto sans jp': 'noto_sans_jp',
                    'noto-sans-jp': 'noto_sans_jp',
                    'notosansjp': 'noto_sans_jp',
                    'noto serif jp': 'noto_serif_jp',
                    'noto-serif-jp': 'noto_serif_jp',
                    'notoserifjp': 'noto_serif_jp'
                };
                
                // Direct match
                if (fontFamilyMap[fontLower]) {
                    console.log(`Mapped font '${fontFamily}' to Miro font '${fontFamilyMap[fontLower]}'`);
                    return fontFamilyMap[fontLower];
                }
                
                // Check for close matches by removing spaces, hyphens
                const fontNoSpaces = fontLower.replace(/[-\s]/g, '');
                if (fontFamilyMap[fontNoSpaces]) {
                    console.log(`Mapped font '${fontFamily}' to Miro font '${fontFamilyMap[fontNoSpaces]}'`);
                    return fontFamilyMap[fontNoSpaces];
                }
                
                // List of supported Miro font families for direct use
                const supportedFonts = [
                    'arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 
                    'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 
                    'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 
                    'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 
                    'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 
                    'plex_mono', 'spoof', 'tiempos_text', 'formular'
                ];
                
                // Check if already a valid Miro font
                if (supportedFonts.includes(fontLower)) {
                    return fontLower;
                }
                
                // If font has underscores already, check if it's a valid Miro font
                if (fontLower.includes('_') && supportedFonts.includes(fontLower)) {
                    return fontLower;
                }
                
                // If we can't find a match, return default
                console.log(`Font '${fontFamily}' not recognized, defaulting to 'arial'`);
                return 'arial';
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
            // Calculate approximate width based on content length and font size
            const textContent = data?.content?.replace(/<[^>]*>/g, '') || '';
            const contentLength = textContent.length;
            const fontSize = style?.fontSize ? 
                (typeof style.fontSize === 'string' ? parseFloat(style.fontSize) : style.fontSize) : 14;
            
            // Formula: base width + adjustment based on text length and font size
            // Min width is 105px (Miro default), max is 800px
            const calculatedWidth = Math.max(
                105, 
                Math.min(800, 105 + (contentLength * fontSize * 0.6))
            );
            
            console.log(`Calculating optimal text width based on content length (${contentLength} chars) and font size (${fontSize}px): ${calculatedWidth}px`);
            
            body.geometry = { 
                ...normalizedGeometry,
                width: calculatedWidth 
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
                // If we're creating a text item, provide helpful HTML examples in logs
                if (action === 'create' && type === 'text') {
                    console.log('Creating new text element...');
                    
                    // If content contains HTML, provide examples for reference
                    if (data && data.content && containsHtml(data.content)) {
                        console.log('HTML content detected in text element.');
                        console.log('For reference, here are examples of properly formatted HTML for Miro:');
                        console.log(getHtmlFormattingExamples());
                    }
                }
                
                response = await miroClient.post(url, body);
                // Track creation in history
                if (response.data) {
                    modificationHistory.trackCreation(response.data);
                }
            } else if (method === 'patch') {
                // If we're updating a text item with HTML, provide helpful examples
                if (action === 'update' && type === 'text' && data && data.content && containsHtml(data.content)) {
                    console.log('Updating text element with HTML content.');
                    console.log('For reference, here are examples of properly formatted HTML for Miro:');
                    console.log(getHtmlFormattingExamples());
                }
                
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
                    // Improved error message for HTML formatting issues with specific advice
                    const supportedTags = ['p', 'a', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'ol', 'ul', 'li', 'br'];
                    
                    // Attempt to identify problematic tags
                    const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
                    const allTags: string[] = [];
                    let match;
                    
                    // Clone data.content to avoid modifying the original
                    const contentCopy = '' + data.content;
                    
                    while ((match = tagRegex.exec(contentCopy)) !== null) {
                        const tagName = match[1].toLowerCase();
                        if (!supportedTags.includes(tagName) && !allTags.includes(tagName)) {
                            allTags.push(tagName);
                        }
                    }
                    
                    let errorMessage = `Error: HTML formatting validation failed. Miro only supports these HTML tags: ${supportedTags.join(', ')}. Other HTML tags will be escaped as plain text.`;
                    
                    if (allTags.length > 0) {
                        errorMessage += ` Problematic tags found: ${allTags.join(', ')}.`;
                    }
                    
                    // Add specific formatting advice
                    errorMessage += `\n\nExamples of valid HTML formatting:
- Simple paragraph: "<p>Text content</p>"
- Bold text: "<p><strong>Bold text</strong> or <b>also bold</b></p>"
- Italic text: "<p><em>Italic text</em> or <i>also italic</i></p>"
- Links: "<p><a href='https://example.com'>Link text</a></p>"
- Lists: "<ul><li>First item</li><li>Second item</li></ul>"`;
                    
                    return formatApiError(error, errorMessage);
                } else if (axiosError.response.status === 400 && style && style.color) {
                    // Enhanced error for color format issues with examples
                    return formatApiError(error, `Error: Invalid color format. Colors must be valid hex values (e.g., "#FF0000" for red) or named colors. Make sure to include the # prefix for hex colors. Examples: "#000000" (black), "#FF0000" (red), "#0000FF" (blue).`);
                } else if (axiosError.response.status === 400 && style && style.fontFamily) {
                    // Specific error for font family issues
                    const supportedFonts = [
                        'arial', 'abril_fatface', 'bangers', 'eb_garamond', 'georgia', 'graduate', 
                        'gravitas_one', 'fredoka_one', 'nixie_one', 'open_sans', 'permanent_marker', 
                        'pt_sans', 'pt_sans_narrow', 'pt_serif', 'rammetto_one', 'roboto', 
                        'roboto_condensed', 'roboto_slab', 'caveat', 'times_new_roman', 'titan_one', 
                        'lemon_tuesday', 'roboto_mono', 'noto_sans', 'plex_sans', 'plex_serif', 
                        'plex_mono', 'spoof', 'tiempos_text', 'formular'
                    ];
                    return formatApiError(error, `Error: Invalid font family. Miro only supports these font families: ${supportedFonts.join(', ')}.`);
                } else if (axiosError.response.status === 400 && style) {
                    // Log more details about what might be wrong with style
                    console.error(`Style properties that might be causing issues: ${JSON.stringify(style)}`);
                    return formatApiError(error, `Error: Invalid style properties for ${type}. For colors, use hex format like "#FF0000" or valid color names. For text, use properties like color, fontFamily, fontSize, textAlign. For shapes, you can also use borderColor, borderWidth, fillColor, fillOpacity.`);
                } else if (axiosError.response.status === 400 && parent) {
                    // Position outside parent boundaries
                    return formatApiError(error, `Error: Position is outside parent frame boundaries. When placing items in a frame, ensure coordinates are within the frame's dimensions or use 'parent_top_left' as the relativeTo reference.`);
                } else if (axiosError.response.status === 413) {
                    // Content too large error
                    return formatApiError(error, `Error: Content is too large. Miro text elements have a limit of 6,000 characters.`);
                }
            }
            return formatApiError(error);
        }
    },
};

/**
 * Validates and corrects HTML content to ensure it renders correctly in Miro
 * Identifies and fixes common issues like unclosed tags
 */
const validateAndCorrectHtml = (html: string): { corrected: string; changes: string[] } => {
  if (!html) return { corrected: '', changes: [] };
  
  const changes: string[] = [];
  let corrected = html;
  
  // Check if content starts with paragraph tag
  if (!/^<p[^>]*>/.test(corrected) && !/<(ul|ol)[^>]*>/.test(corrected.substring(0, 30))) {
    corrected = `<p>${corrected}</p>`;
    changes.push('Added paragraph tags around content');
  }
  
  // Ensure all paragraphs are properly closed
  const unclosedParagraphMatches = corrected.match(/<p[^>]*>(?:(?!<\/p>).)*$/g);
  if (unclosedParagraphMatches && unclosedParagraphMatches.length > 0) {
    corrected = corrected + '</p>';
    changes.push('Fixed unclosed paragraph tag');
  }
  
  // Ensure all list items are properly closed
  const unclosedListItemMatches = corrected.match(/<li[^>]*>(?:(?!<\/li>).)*$/g);
  if (unclosedListItemMatches && unclosedListItemMatches.length > 0) {
    corrected = corrected + '</li>';
    changes.push('Fixed unclosed list item tag');
  }
  
  // Ensure all lists are properly closed
  if (/<ul[^>]*>(?:(?!<\/ul>).)*$/g.test(corrected)) {
    corrected = corrected + '</ul>';
    changes.push('Fixed unclosed unordered list tag');
  }
  if (/<ol[^>]*>(?:(?!<\/ol>).)*$/g.test(corrected)) {
    corrected = corrected + '</ol>';
    changes.push('Fixed unclosed ordered list tag');
  }
  
  // Fix nested lists if found
  if (/<(ul|ol)[^>]*>.*<(ul|ol)[^>]*>.*<\/(ul|ol)>.*<\/(ul|ol)>/s.test(corrected)) {
    // Nested lists are technically supported but might cause issues
    changes.push('Warning: Nested lists detected, may not render as expected in Miro');
  }
  
  // Check for unclosed or improperly closed styling tags
  ['strong', 'b', 'em', 'i', 'u', 's', 'span', 'a'].forEach(tag => {
    const openCount = (corrected.match(new RegExp(`<${tag}[^>]*>`, 'g')) || []).length;
    const closeCount = (corrected.match(new RegExp(`<\\/${tag}>`, 'g')) || []).length;
    
    if (openCount > closeCount) {
      corrected = corrected + `</${tag}>`;
      changes.push(`Fixed unclosed ${tag} tag`);
    }
  });
  
  // Process span styles to ensure proper formatting
  const processedWithStyles = processSpanStyles(corrected);
  if (processedWithStyles !== corrected) {
    corrected = processedWithStyles;
    changes.push('Optimized span style formatting for Miro compatibility');
  }
  
  return { corrected, changes };
}; 