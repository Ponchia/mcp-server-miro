import axios from 'axios';
import { miroApiToken } from '../config';

// Create and configure Axios instance for Miro API requests
const miroClient = axios.create({
    baseURL: 'https://api.miro.com',
    headers: {
        'Authorization': `Bearer ${miroApiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
});

export default miroClient; 