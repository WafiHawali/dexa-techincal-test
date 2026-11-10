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
  checkOutAt: string | null;
  status: string;
  employee?: Employee;
  photos?: { id: string; kind?: 'CHECK_IN' | 'CHECK_OUT'; originalName?: string; fileName?: string; mimeType?: string }[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Envelope<T> { data: T }
export interface LoginInput { identifier: string; password: string }
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
