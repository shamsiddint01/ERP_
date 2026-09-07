import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
