import { MiroItem } from '../types/miro-types';

/**
 * Helper function to convert style string values to appropriate types
 */
export function normalizeStyleValues(style: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!style) return undefined;
    
    const normalizedStyle = {...style};
    
    // Convert fontSize to number if it's a string
    if (typeof normalizedStyle.fontSize === 'string') {
        normalizedStyle.fontSize = parseFloat(normalizedStyle.fontSize);
    }
    
    // Convert borderOpacity to number if it's a string
    if (typeof normalizedStyle.borderOpacity === 'string') {
        normalizedStyle.borderOpacity = parseFloat(normalizedStyle.borderOpacity);
    }
    
    // Convert borderWidth to number if it's a string
    if (typeof normalizedStyle.borderWidth === 'string') {
        normalizedStyle.borderWidth = parseFloat(normalizedStyle.borderWidth);
    }
    
    return normalizedStyle;
}

/**
 * Helper function to convert geometry string values to numbers
 */
export function normalizeGeometryValues(geometry: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!geometry) return undefined;
    
    const normalizedGeometry = {...geometry};
    
    // Convert width to number if it's a string
    if (typeof normalizedGeometry.width === 'string') {
        normalizedGeometry.width = parseFloat(normalizedGeometry.width);
    }
    
    // Convert height to number if it's a string
    if (typeof normalizedGeometry.height === 'string') {
        normalizedGeometry.height = parseFloat(normalizedGeometry.height);
    }
    
    // Convert rotation to number if it's a string
    if (typeof normalizedGeometry.rotation === 'string') {
        normalizedGeometry.rotation = parseFloat(normalizedGeometry.rotation);
    }
    
    return normalizedGeometry;
}

/**
 * Normalizes position values in a position object
 * Handles enhanced reference points and percentage values
 */
export function normalizePositionValues(position: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!position) return undefined;
    
    // Create a working copy for our transformations
    const workingPosition = {...position};
    
    // Process percentage values if they exist
    const hasPercentageX = typeof workingPosition.x === 'string' && 
                          workingPosition.x.toString().endsWith('%');
    const hasPercentageY = typeof workingPosition.y === 'string' && 
                          workingPosition.y.toString().endsWith('%');
    
    // Preserve original values and reference system for later use
    const originalX = workingPosition.x;
    const originalY = workingPosition.y;
    
    // Get the reference system - crucial for coordinate translation
    let referenceSystem = 'canvas_center'; // Default
    if ('relativeTo' in workingPosition) {
        referenceSystem = workingPosition.relativeTo as string;
        // Store but don't send to API
        delete workingPosition.relativeTo;
        
        // Always ensure origin is 'center' when using parent_center reference
        if (referenceSystem === 'parent_center' && (!workingPosition.origin || workingPosition.origin !== 'center')) {
            console.warn(`WARNING: When using relativeTo: "parent_center", origin MUST be "center" to work correctly`);
            console.warn(`Auto-fixing missing/incorrect origin value for parent_center reference`);
            console.warn(`To avoid this warning, always include "origin": "center" when using "relativeTo": "parent_center"`);
            workingPosition.origin = 'center';
        }
    } else if (hasPercentageX || hasPercentageY) {
        // If using percentages without explicit relativeTo, use parent_percentage
        referenceSystem = 'parent_percentage';
    }
    
    // Handle percentage conversions
    if (hasPercentageX || hasPercentageY) {
        // Store original percentage values
        if (hasPercentageX) {
            const percentX = parseFloat(workingPosition.x as string);
            workingPosition.x = percentX;
        }
        
        if (hasPercentageY) {
            const percentY = parseFloat(workingPosition.y as string);
            workingPosition.y = percentY;
        }
    }
    
    // Convert other string values to numbers
    if (typeof workingPosition.x === 'string' && !hasPercentageX) {
        workingPosition.x = parseFloat(workingPosition.x as string);
    }
    
    if (typeof workingPosition.y === 'string' && !hasPercentageY) {
        workingPosition.y = parseFloat(workingPosition.y as string);
    }
    
    // Create API-ready position object with only the properties Miro API supports
    const apiReadyPosition: Record<string, unknown> = {
        // Store position values
        x: workingPosition.x,
        y: workingPosition.y,
        
        // Store origin or use default
        origin: workingPosition.origin || 'center',
        
        // Store crucial metadata for coordinate translation (won't be sent to API)
        __refSystem: referenceSystem,
        __isPercentageX: hasPercentageX,
        __isPercentageY: hasPercentageY,
        __originalX: originalX,
        __originalY: originalY
    };
    
    console.log(`Position normalized from "${referenceSystem}" reference system: ${JSON.stringify(apiReadyPosition)}`);
    
    return apiReadyPosition;
}

/**
 * Translates coordinates between different reference systems
 * Supports all reference points: canvas_center, parent_top_left, parent_center, parent_bottom_right, parent_percentage
 */
export function translatePosition(
    coords: {x: number | string, y: number | string}, 
    fromReference: string,
    toReference: string,
    parentGeometry?: {width?: number, height?: number},
    parentPosition?: {x: number, y: number}
): {x: number | string, y: number | string} {
    // Can't translate without parent info for parent-related references
    if ((fromReference.startsWith('parent_') || toReference.startsWith('parent_')) && 
        (!parentGeometry || !parentPosition)) {
        console.warn('Cannot translate between parent-related references without parent geometry and position');
        return coords;
    }
    
    // Handle same reference system - no translation needed
    if (fromReference === toReference) {
        return coords;
    }
    
    const parentWidth = parentGeometry?.width || 0; 
    const parentHeight = parentGeometry?.height || 0;
    
    // Convert input coordinates to numbers for calculations
    let x = typeof coords.x === 'string' ? parseFloat(coords.x) : coords.x;
    let y = typeof coords.y === 'string' ? parseFloat(coords.y) : coords.y;
    
    // Step 1: Convert from source reference to canvas_center
    switch (fromReference) {
        case 'canvas_center':
            // Already in canvas_center
            break;
            
        case 'parent_top_left':
            // Convert from parent's top-left to parent's center
            x = (x - parentWidth/2) + parentPosition!.x;
            y = (y - parentHeight/2) + parentPosition!.y;
            break;
            
        case 'parent_center':
            // Convert from parent's center to canvas center
            x = x + parentPosition!.x;
            y = y + parentPosition!.y;
            break;
            
        case 'parent_bottom_right':
            // Convert from parent's bottom-right to parent's center, then to canvas center
            x = (x - parentWidth) + parentPosition!.x;
            y = (y - parentHeight) + parentPosition!.y;
            break;
            
        case 'parent_percentage':
            // Convert from percentage to parent's top-left, then to canvas center
            if (typeof coords.x === 'string' && coords.x.endsWith('%')) {
                const percentX = parseFloat(coords.x) / 100;
                x = (percentX * parentWidth - parentWidth/2) + parentPosition!.x;
            }
            if (typeof coords.y === 'string' && coords.y.endsWith('%')) {
                const percentY = parseFloat(coords.y) / 100;
                y = (percentY * parentHeight - parentHeight/2) + parentPosition!.y;
            }
            break;
    }
    
    // Prepare variables for return values and intermediate calculations
    let resultX: number | string = x;
    let resultY: number | string = y;
    let relativeX: number = 0;
    let relativeY: number = 0;
    
    // Step 2: Convert from canvas_center to target reference
    switch (toReference) {
        case 'canvas_center':
            // Already in canvas_center
            break;
            
        case 'parent_top_left':
            // Convert from canvas center to parent's top-left
            resultX = x - parentPosition!.x + parentWidth/2;
            resultY = y - parentPosition!.y + parentHeight/2;
            break;
            
        case 'parent_center':
            // Convert from canvas center to parent's center
            resultX = x - parentPosition!.x;
            resultY = y - parentPosition!.y;
            // Ensure origin is set to center for parent_center
            if (Object.prototype.hasOwnProperty.call(coords, 'origin')) {
                const coordsWithOrigin = coords as {origin?: string};
                coordsWithOrigin.origin = 'center';
            }
            break;
            
        case 'parent_bottom_right':
            // Convert from canvas center to parent's bottom-right
            resultX = x - parentPosition!.x + parentWidth;
            resultY = y - parentPosition!.y + parentHeight;
            break;
            
        case 'parent_percentage':
            // Convert from canvas center to percentage values
            relativeX = x - parentPosition!.x + parentWidth/2;
            relativeY = y - parentPosition!.y + parentHeight/2;
            resultX = (relativeX / parentWidth * 100).toFixed(2) + '%';
            resultY = (relativeY / parentHeight * 100).toFixed(2) + '%';
            break;
    }
    
    return {x: resultX, y: resultY};
}

/**
 * Validates if position is valid for parent-child relationship
 * Enhanced to support all reference points
 */
export function validateChildPosition(
    position: Record<string, unknown> | undefined,
    parentGeometry: { width?: number; height?: number } | undefined,
    relativeTo?: string
): { valid: boolean; message?: string } {
    if (!position || !parentGeometry) return { valid: true };
    
    // Extract reference system, prioritizing the explicit parameter
    const referenceSystem = relativeTo || 
                          (position.__relativeTo ? String(position.__relativeTo) : 
                           (position.relativeTo ? String(position.relativeTo) : 'parent_top_left'));
    
    // Handle percentage values
    if (referenceSystem === 'parent_percentage') {
        const isXValid = typeof position.x === 'string' && 
                         position.x.endsWith('%') && 
                         parseFloat(position.x) >= 0 && 
                         parseFloat(position.x) <= 100;
                         
        const isYValid = typeof position.y === 'string' && 
                         position.y.endsWith('%') && 
                         parseFloat(position.y) >= 0 && 
                         parseFloat(position.y) <= 100;
                         
        if (!isXValid || !isYValid) {
            return {
                valid: false,
                message: `Percentage position values must be between 0% and 100%. ` +
                         `Example: {"x": "50%", "y": "50%", "relativeTo": "parent_percentage"} positions at center of parent.`
            };
        }
        return { valid: true };
    }
    
    // For absolute positioning reference points
    const x = typeof position.x === 'number' ? position.x : 0;
    const y = typeof position.y === 'number' ? position.y : 0;
    
    // Adjust validation based on reference point
    switch (referenceSystem) {
        case 'parent_top_left':
            // Check if position is outside parent bounds
            if (x < 0 || y < 0 || x > parentGeometry.width! || y > parentGeometry.height!) {
                return {
                    valid: false,
                    message: `Position {x:${x}, y:${y}} with reference "parent_top_left" places item outside parent bounds. ` +
                             `Use positive values less than parent width (${parentGeometry.width}) and height (${parentGeometry.height}).`
                };
            }
            break;
            
        case 'parent_center':
            // Check if position is outside parent bounds
            if (Math.abs(x) > parentGeometry.width!/2 || Math.abs(y) > parentGeometry.height!/2) {
                return {
                    valid: false,
                    message: `Position {x:${x}, y:${y}} with reference "parent_center" places item outside parent bounds. ` +
                             `X must be between ${-parentGeometry.width!/2} and ${parentGeometry.width!/2}. ` +
                             `Y must be between ${-parentGeometry.height!/2} and ${parentGeometry.height!/2}.`
                };
            }
            break;
            
        case 'parent_bottom_right':
            // Check if position is outside parent bounds
            if (x > 0 || y > 0 || x < -parentGeometry.width! || y < -parentGeometry.height!) {
                return {
                    valid: false,
                    message: `Position {x:${x}, y:${y}} with reference "parent_bottom_right" places item outside parent bounds. ` +
                             `X must be between ${-parentGeometry.width!} and 0. ` +
                             `Y must be between ${-parentGeometry.height!} and 0.`
                };
            }
            break;
    }
    
    return { valid: true };
}

/**
 * Generate a content summary for text-based items
 * Extracts meaningful text content from items to make them easier for LLMs to reference
 */
export function generateContentSummary(item: MiroItem): string | undefined {
    if (!item) return undefined;

    // Different item types store their content in different places
    switch (item.type) {
        case 'text':
            return extractText(item.data?.content as string | undefined);
        case 'sticky_note':
            return extractText(item.data?.content as string | undefined);
        case 'shape':
            return extractText(item.data?.content as string | undefined);
        case 'card': {
            const title = item.data?.title as string | undefined;
            const description = item.data?.description as string | undefined;
            return formatSummary(title, description);
        }
        case 'app_card': {
            const appTitle = item.data?.title as string | undefined;
            const appDesc = item.data?.description as string | undefined;
            return formatSummary(appTitle, appDesc);
        }
        case 'document':
        case 'image':
            return item.data?.title as string | undefined;
        case 'frame':
            return item.data?.title as string | undefined;
        default:
            return undefined;
    }
}

/**
 * Extract text from HTML content (removes tags and trims)
 */
function extractText(content: string | undefined): string | undefined {
    if (!content) return undefined;
    
    // Remove HTML tags if present
    const text = content.replace(/<[^>]*>/g, ' ');
    
    // Normalize whitespace and trim
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Format summary from title and description
 */
function formatSummary(title: string | undefined, description: string | undefined): string | undefined {
    if (!title && !description) return undefined;
    
    if (title && description) {
        // Truncate description if too long
        const truncatedDesc = description.length > 50 
            ? description.substring(0, 47) + '...' 
            : description;
        return `${title}: ${truncatedDesc}`;
    }
    
    return title || description;
}

/**
 * Simple in-memory history tracking for board modifications
 * This uses a module-level singleton to track history across calls
 */
class ModificationHistory {
    private static instance: ModificationHistory;
    private recentlyCreated: Map<string, {id: string, type: string, summary: string, timestamp: string}>;
    private recentlyModified: Map<string, {id: string, type: string, summary: string, timestamp: string}>;
    private readonly maxHistoryItems = 20;
    
    private constructor() {
        this.recentlyCreated = new Map();
        this.recentlyModified = new Map();
    }
    
    public static getInstance(): ModificationHistory {
        if (!ModificationHistory.instance) {
            ModificationHistory.instance = new ModificationHistory();
        }
        return ModificationHistory.instance;
    }
    
    public trackCreation(item: MiroItem): void {
        if (!item || !item.id) return;
        
        const summary = generateContentSummary(item) || `${item.type} item`;
        const entry = {
            id: item.id,
            type: item.type,
            summary,
            timestamp: new Date().toISOString()
        };
        
        // Add to recently created map
        this.recentlyCreated.set(item.id, entry);
        
        // Maintain max size
        if (this.recentlyCreated.size > this.maxHistoryItems) {
            const keys = Array.from(this.recentlyCreated.keys());
            if (keys.length > 0) {
                this.recentlyCreated.delete(keys[0]);
            }
        }
    }
    
    public trackModification(item: MiroItem): void {
        if (!item || !item.id) return;
        
        const summary = generateContentSummary(item) || `${item.type} item`;
        const entry = {
            id: item.id,
            type: item.type,
            summary,
            timestamp: new Date().toISOString()
        };
        
        // Add to recently modified map
        this.recentlyModified.set(item.id, entry);
        
        // Maintain max size
        if (this.recentlyModified.size > this.maxHistoryItems) {
            const keys = Array.from(this.recentlyModified.keys());
            if (keys.length > 0) {
                this.recentlyModified.delete(keys[0]);
            }
        }
    }
    
    public getRecentlyCreated(): Array<{id: string, type: string, summary: string, timestamp: string}> {
        return Array.from(this.recentlyCreated.values())
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    
    public getRecentlyModified(): Array<{id: string, type: string, summary: string, timestamp: string}> {
        return Array.from(this.recentlyModified.values())
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
}

// Export the history tracker singleton instance
export const modificationHistory = ModificationHistory.getInstance();

/**
 * Filter items by text content (for content-based search)
 */
export function filterItemsByContent(items: MiroItem[], query: string, options?: { 
    fuzzyMatch?: boolean, 
    itemType?: string 
}): MiroItem[] {
    if (!items || !items.length || !query) return [];
    
    const normalizedQuery = query.toLowerCase();
    
    return items.filter(item => {
        // Filter by type if specified
        if (options?.itemType && item.type !== options.itemType) {
            return false;
        }
        
        const content = generateContentSummary(item);
        if (!content) return false;
        
        if (options?.fuzzyMatch) {
            // Simple fuzzy matching (contains any part of the query)
            return content.toLowerCase().includes(normalizedQuery);
        } else {
            // Exact matching (contains the whole query)
            return content.toLowerCase().includes(normalizedQuery);
        }
    });
}

/**
 * Check for similar/duplicate content to avoid creating duplicates
 */
export function checkForSimilarContent(
    items: MiroItem[], 
    newContent: string, 
    itemType: string
): { duplicatesFound: boolean; similarItems: MiroItem[] } {
    if (!items || !items.length || !newContent) {
        return { duplicatesFound: false, similarItems: [] };
    }
    
    const normalizedNewContent = newContent.toLowerCase();
    
    // Find items of the same type with similar content
    const similarItems = items.filter(item => {
        if (item.type !== itemType) return false;
        
        const content = generateContentSummary(item);
        if (!content) return false;
        
        const normalizedContent = content.toLowerCase();
        
        // Check for high similarity
        if (normalizedContent === normalizedNewContent) {
            return true; // Exact match
        }
        
        // Check if one is contained in the other
        if (normalizedContent.includes(normalizedNewContent) || 
            normalizedNewContent.includes(normalizedContent)) {
            return true;
        }
        
        return false;
    });
    
    return {
        duplicatesFound: similarItems.length > 0,
        similarItems,
    };
} 