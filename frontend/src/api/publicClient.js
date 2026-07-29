import axios from 'axios';
import { API_URL } from '../config';

// Client for the unauthenticated customer + display-board endpoints.
const publicApi = axios.create({ baseURL: `${API_URL}/public` });

export default publicApi;
