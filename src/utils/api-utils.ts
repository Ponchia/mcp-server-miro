import { AxiosError } from 'axios';

/**
 * Formats API responses for consistent output
 */
export function formatApiResponse(response: unknown): string {
    return JSON.stringify(response, null, 2);
}

/**
 * Formats API errors for consistent error handling
 */
export function formatApiError(error: unknown, customMessage?: string): string {
    console.error(`API Call Failed: ${(error as Error).message}`);
    const axiosError = error as AxiosError;
    let errorMessage = customMessage || `Miro API Request Error: ${(error as Error).message}`;
    
    if (axiosError.response) {
        console.error(`Status: ${axiosError.response.status}`);
        const responseData = JSON.stringify(axiosError.response.data);
        console.error(`Data: ${responseData}`);
        if (!customMessage) {
            errorMessage = `Miro API Error (${axiosError.response.status}): ${responseData}`;
        }
    }
    
    // Throwing the error string so FastMCP can handle it
    throw new Error(errorMessage);
} 