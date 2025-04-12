import miroClient from '../client/miro-client';
import { miroBoardId } from '../config';
import { normalizeGeometryValues, normalizePositionValues } from '../utils/data-utils';

// Export an empty object to make this a proper module
export {};

/**
 * Helper function to prepare card data for API requests
 */
export function prepareCardData(requestBody: {
    position?: Record<string, unknown>;
    parent?: { id: string };
    geometry?: Record<string, unknown>;
    data?: Record<string, unknown>;
    style?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        try {
            // Normalize position values
            const normalizedPosition = normalizePositionValues(requestBody.position);

            // If we have parent-relative positioning, we need to translate coordinates
            if (normalizedPosition && requestBody.parent?.id) {
                // We'll handle this with a separate async function to avoid async executor
                translateCoordinates(normalizedPosition, requestBody.parent.id)
                    .catch(error => {
                        console.error(`Error translating app card parent-relative coordinates: ${error}`);
                    });
            }

            // Clean up position metadata - ensure only API-compatible properties
            const position = normalizedPosition ? {
                x: normalizedPosition.x,
                y: normalizedPosition.y,
                origin: normalizedPosition.origin || 'center'
            } : undefined;

            // Create body without using spread operators
            const body: Record<string, unknown> = {};

            // Add data if available
            if (requestBody.data) {
                body.data = requestBody.data;
            }

            // Add position if available
            if (position) {
                body.position = position;
            }

            // Add geometry if available
            const normalizedGeometry = normalizeGeometryValues(requestBody.geometry);
            if (normalizedGeometry) {
                body.geometry = normalizedGeometry;
            }

            // Add parent if available
            if (requestBody.parent && typeof requestBody.parent === 'object' && 'id' in requestBody.parent) {
                body.parent = requestBody.parent;
            }

            // Add style if available
            const normalizedStyle = requestBody.style ? { ...requestBody.style } : undefined;
            if (normalizedStyle) {
                body.style = normalizedStyle;
            }

            resolve(body);
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Helper function to translate coordinates based on parent frame
 */
async function translateCoordinates(normalizedPosition: Record<string, unknown>, parentId: string): Promise<void> {
    // Get parent item to retrieve its dimensions
    const parentResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${parentId}`);
    const parentGeometry = parentResponse.data.geometry;
    
    if (parentGeometry) {
        // Get reference system
        const refSystem = normalizedPosition.__refSystem as string || 'parent_top_left';
        
        // Get parent dimensions
        const parentWidth = parentGeometry.width || 0;
        const parentHeight = parentGeometry.height || 0;
        
        console.log(`Translating app card coordinates from ${refSystem} to parent_top_left`);
        console.log(`Parent dimensions: ${parentWidth}x${parentHeight}`);
        
        // Original coordinates
        const x = normalizedPosition.x as number;
        const y = normalizedPosition.y as number;
        
        // Transform coordinates based on reference system
        if (refSystem === 'parent_center') {
            normalizedPosition.x = x + (parentWidth / 2);
            normalizedPosition.y = y + (parentHeight / 2);
        } 
        else if (refSystem === 'parent_bottom_right') {
            normalizedPosition.x = parentWidth - x;
            normalizedPosition.y = parentHeight - y;
        } 
        else if (refSystem === 'parent_percentage') {
            normalizedPosition.x = (x / 100) * parentWidth;
            normalizedPosition.y = (y / 100) * parentHeight;
        }
    }
} 