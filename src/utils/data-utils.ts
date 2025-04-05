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
 * Also removes relativeTo parameter which is not supported in some API calls
 */
export function normalizePositionValues(position: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!position) return undefined;
    
    const normalizedPosition = {...position};
    
    // Convert x and y to numbers if they're strings
    if (typeof normalizedPosition.x === 'string') {
        normalizedPosition.x = parseFloat(normalizedPosition.x);
    }
    
    if (typeof normalizedPosition.y === 'string') {
        normalizedPosition.y = parseFloat(normalizedPosition.y);
    }
    
    // Remove relativeTo property if present as it's not supported in some API calls
    if ('relativeTo' in normalizedPosition) {
        delete normalizedPosition.relativeTo;
    }
    
    return normalizedPosition;
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