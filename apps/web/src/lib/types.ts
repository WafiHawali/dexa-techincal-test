export type Role = 'EMPLOYEE' | 'HRD';

export interface Employee {
  id: string;
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  employeeId: string;
  role: Role;
  employee: Employee;
}

export interface Attendance {
  id: string;
  employeeId: string;
  attendanceDate: string;
  checkInAt: string;
  status: string;
  latitude: number | string;
  longitude: number | string;
  gpsAccuracy: number | string | null;
  employee?: Employee;
  photos?: { id: string; originalName?: string; mimeType?: string }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Envelope<T> { data: T }
export interface LoginInput { email: string; password: string }
export interface LoginResult { accessToken: string; user: User }
export interface EmployeeInput {
  employeeNumber: string;
  fullName: string;
  email: string;
  department: string;
  position: string;
  password?: string;
  status?: Employee['status'];
}
