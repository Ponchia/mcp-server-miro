import dotenv from 'dotenv';

dotenv.config();

// Configuration for Miro API
export const miroApiToken = process.env.MIRO_API_TOKEN;
export const miroBoardId = process.env.MIRO_BOARD_ID;
export const port = process.env.PORT ? parseInt(process.env.PORT) : 8899;

// Validate required environment variables
if (!miroApiToken) {
    console.error('MIRO_API_TOKEN is not defined in the environment variables.');
    process.exit(1);
}

if (!miroBoardId) {
    console.error('MIRO_BOARD_ID is not defined in the environment variables.');
    process.exit(1);
} 