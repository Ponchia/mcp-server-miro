import { AxiosError } from 'axios';

/**
 * Error response interface for consistent error objects
 */
export interface ErrorResponse {
    error: string;
    status: number;
    details?: string;
}

/**
 * Formats API responses for consistent output
 * Uses a replacer function to ensure large numeric IDs are preserved as strings
 */
export function formatApiResponse(response: unknown): string {
    const idReplacer = (key: string, value: unknown) => {
        // Handle case where value is a large number (like an ID)
        if (typeof value === 'number' && 
            (key === 'id' || key.endsWith('_id')) && 
            value.toString().length > 15) {
            return value.toString();
        }
        
        // Special handling for items array which contains numeric IDs
        if (key === 'items' && Array.isArray(value)) {
            return value.map(item => {
                if (typeof item === 'number' && item.toString().length > 15) {
                    return item.toString();
                }
                return item;
            });
        }
        
        return value;
    };
    
    return JSON.stringify(response, idReplacer, 2);
}

/**
 * Formats API errors for consistent error handling
 * @param error The error object
 * @param customMessage Optional custom message
 * @param throwError Whether to throw the error (default true) or return an ErrorResponse
 * @returns ErrorResponse object if throwError is false
 * @throws Error if throwError is true
 */
export function formatApiError(error: unknown, customMessage?: string, throwError: boolean = true): ErrorResponse {
    console.error(`API Call Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    const axiosError = error as AxiosError;
    
    // Ensure error message is always a string
    let errorMessage = customMessage || `Miro API Request Error: ${error instanceof Error && typeof error.message === 'string' ? error.message : 'Unknown error'}`;
    let statusCode = 500;
    
    if (axiosError.response) {
        statusCode = axiosError.response.status;
        console.error(`Status: ${statusCode}`);
        const responseData = JSON.stringify(axiosError.response.data);
        console.error(`Data: ${responseData}`);
        if (!customMessage) {
            errorMessage = `Miro API Error (${statusCode}): ${responseData}`;
        }
    }
    
    const errorResponse: ErrorResponse = {
        error: errorMessage,
        status: statusCode,
        details: axiosError.response?.data ? JSON.stringify(axiosError.response.data) : ''
    };
    
    if (throwError) {
        throw new Error(errorMessage);
    }
    
    return errorResponse;
} 