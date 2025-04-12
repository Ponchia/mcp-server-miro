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
 */
export function formatApiResponse(response: unknown): string {
    return JSON.stringify(response, null, 2);
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