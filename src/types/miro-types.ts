// Type definitions for Miro API objects
export interface MiroItem {
    id: string;
    type: string;
    position?: {
        x: number;
        y: number;
        [key: string]: unknown;
    };
    geometry?: {
        width?: number;
        height?: number;
        rotation?: number;
        [key: string]: unknown;
    };
    data?: Record<string, unknown>;
    style?: Record<string, unknown>;
    details?: Record<string, unknown>;
    parent?: { id: string; [key: string]: unknown };
    content_summary?: string;
    [key: string]: unknown;
}

export interface MiroFrame extends MiroItem {
    childItems?: MiroItem[];
}

export interface MiroGroup {
    id: string;
    childItems?: MiroItem[];
    [key: string]: unknown;
}

export interface MiroTag {
    id: string;
    items?: MiroItem[];
    [key: string]: unknown;
}

export interface MiroComment {
    id: string;
    [key: string]: unknown;
}

export interface MiroConnector extends MiroItem {
    startItem?: { id: string; [key: string]: unknown };
    endItem?: { id: string; [key: string]: unknown };
}

// Enhanced types for our custom hierarchy implementation
export interface HierarchyItem extends MiroItem {
    tags: MiroTag[];
    connectors: MiroConnector[];
    connected_items?: {
        to: string[];
        from: string[];
        bidirectional: string[];
        all: string[];
    };
    connection_info?: {
        is_connected_to_any: boolean;
        connected_item_count: number;
        sends_connections_to_count: number;
        receives_connections_from_count: number;
        has_bidirectional_connections: boolean;
        bidirectional_connection_count: number;
    };
    children: HierarchyItem[];
}

// Connectivity mapping types
export interface ConnectivityDetails {
    to: string[];
    from: string[];
    bidirectional: string[];
}

export interface StructuralSummary {
    totalItems: number;
    itemsByType: Record<string, number>;
    connectedItemsCount: number;
    isolatedItemsCount: number;
    connectionStats: {
        totalConnections: number;
        bidirectionalPairs: number;
        maxConnections: number;
    };
}

// Complete board state type
export interface BoardState {
    board: Record<string, unknown>;
    items: MiroItem[];
    frames: MiroFrame[];
    groups: MiroGroup[];
    connectors: MiroConnector[];
    tags: MiroTag[];
    comments: MiroComment[];
    connectivity: {
        map: Record<string, string[]>;
        details: Record<string, ConnectivityDetails>;
    };
    summary: StructuralSummary;
    metadata: {
        timestamp: string;
        itemCount: number;
        frameCount: number;
        groupCount: number;
        connectorCount: number;
        tagCount: number;
        commentCount: number;
    };
    history?: {
        recently_created: Array<{id: string, type: string, summary: string, timestamp: string}>;
        recently_modified: Array<{id: string, type: string, summary: string, timestamp: string}>;
    };
} 