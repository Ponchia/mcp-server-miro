import { z } from 'zod';
import { ErrorResponse } from '../utils/api-utils';

/**
 * Generic tool definition type to ensure consistent tool structure
 * T represents the parameters type for the tool
 * R represents the return type for the tool (defaults to string | ErrorResponse)
 */
export type ToolDefinition<T, R = string | ErrorResponse> = {
    name: string;
    description: string;
    parameters: z.ZodType<T, z.ZodTypeDef, unknown>;
    execute: (args: T) => Promise<R>;
};

/**
 * Generic empty schema type for placeholder tools
 */
export type EmptySchema = Record<string, never>;
export const emptySchema = z.object({}); 