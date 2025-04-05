import { z } from 'zod';

/**
 * Generic tool definition type to ensure consistent tool structure
 * T represents the parameters type for the tool
 */
export type ToolDefinition<T> = {
    name: string;
    description: string;
    parameters: z.ZodType<T, any, any>;
    execute: (args: T) => Promise<string>;
};

/**
 * Generic empty schema type for placeholder tools
 */
export type EmptySchema = Record<string, never>;
export const emptySchema = z.object({}); 