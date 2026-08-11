import api from './axios';

export async function fetchActivityLogs(page = 1, limit = 25, search = '') {
  const params = { page, limit };

  if (search) {
    params.search = search;
  }

  const response = await api.get('/logs', { params });
  return response.data;
}