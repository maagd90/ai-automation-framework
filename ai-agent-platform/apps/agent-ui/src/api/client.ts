import axios from 'axios';

const apiKey = import.meta.env.VITE_API_KEY;

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30_000,
  headers: apiKey ? { 'x-api-key': apiKey } : undefined,
});
