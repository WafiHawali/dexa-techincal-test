import axios from 'axios';
import type { Attendance, Employee, EmployeeInput, Envelope, LoginInput, LoginResult, Page, User } from './types';

export const SESSION_KEY = 'dexa.accessToken';
export const SESSION_EXPIRED = 'dexa:session-expired';
export const api = axios.create({ baseURL: '/api', timeout: 30_000 });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use((response) => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event(SESSION_EXPIRED));
  }
  return Promise.reject(error);
});

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message: unknown = error.response?.data?.message;
    if (Array.isArray(message)) return message.filter((item) => typeof item === 'string').join('. ');
    if (typeof message === 'string') return message;
    if (error.response?.status === 403) return 'You do not have permission to access this information.';
    if (error.response?.status === 404) return 'The requested record could not be found.';
    if (error.response?.status === 409) return 'This record already exists. Refresh to see the latest information.';
    if (!error.response) return 'Unable to reach the server. Check your connection and try again.';
    return 'The server could not complete the request. Please try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const authApi = {
  login: async (input: LoginInput) => (await api.post<Envelope<LoginResult>>('/auth/login', input)).data.data,
  me: async () => (await api.get<Envelope<User>>('/auth/me')).data.data,
};

export const employeesApi = {
  list: async (params: { search?: string; page?: number; pageSize?: number }) =>
    (await api.get<Envelope<Page<Employee>>>('/employees', { params })).data.data,
  get: async (id: string) => (await api.get<Envelope<Employee>>(`/employees/${encodeURIComponent(id)}`)).data.data,
  create: async (input: EmployeeInput) => (await api.post<Envelope<Employee>>('/employees', input)).data.data,
  update: async (id: string, input: EmployeeInput) =>
    (await api.patch<Envelope<Employee>>(`/employees/${encodeURIComponent(id)}`, input)).data.data,
};

export const attendanceApi = {
  mine: async (params: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) =>
    (await api.get<Envelope<Page<Attendance>>>('/attendances/me', { params, signal })).data.data,
  list: async (params: { search?: string; date?: string; page?: number; pageSize?: number }) =>
    (await api.get<Envelope<Page<Attendance>>>('/attendances', { params })).data.data,
  get: async (id: string) => (await api.get<Envelope<Attendance>>(`/attendances/${encodeURIComponent(id)}`)).data.data,
  checkIn: async (data: FormData) => (await api.post<Envelope<Attendance>>('/attendances/check-in', data)).data.data,
  checkOut: async (data: FormData) => (await api.post<Envelope<Attendance>>('/attendances/check-out', data)).data.data,
  photo: async (id: string, signal?: AbortSignal) =>
    (await api.get<Blob>(`/files/${encodeURIComponent(id)}`, { responseType: 'blob', signal })).data,
};
