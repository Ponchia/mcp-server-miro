// Normalize position values
const normalizedPosition = normalizePositionValues(requestBody.position);

// If we have parent-relative positioning, we need to translate coordinates
if (normalizedPosition && requestBody.parent?.id) {
    try {
        // Get parent item to retrieve its dimensions
        const parentResponse = await miroClient.get(`/v2/boards/${miroBoardId}/items/${requestBody.parent.id}`);
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
    } catch (error) {
        console.error(`Error translating app card parent-relative coordinates: ${error}`);
    }
}

// Clean up position metadata - ensure only API-compatible properties
let position = normalizedPosition;
if (position) {
    // Create a clean position object without metadata
    position = {
        x: normalizedPosition.x,
        y: normalizedPosition.y,
        origin: normalizedPosition.origin || 'center'
    };
}

// Create body without using spread operators
const body: Record<string, unknown> = {};

// Add data if available
if (data) {
    body.data = data;
}

// Add position if available
if (position) {
    body.position = position;
}

// Add geometry if available
if (normalizedGeometry) {
    body.geometry = normalizedGeometry;
}

// Add parent if available
if (requestBody.parent && typeof requestBody.parent === 'object' && 'id' in requestBody.parent) {
    body.parent = requestBody.parent;
}

// Add style if available
if (normalizedStyle) {
    body.style = normalizedStyle;
} 