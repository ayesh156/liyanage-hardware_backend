import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET: string = process.env.JWT_SECRET || 'liyanage-hardware-jwt-secret-change-in-production';

export interface AuthUser {
  userId: number;
  role: string;
  name?: string;
  username?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

/**
 * Express middleware that validates JWT from:
 *   1. httpOnly cookie `auth_token`
 *   2. Authorization header `Bearer <token>
 *
 * On success, attaches `req.user` with { userId, role, name, username }.
 * Resolves the user's name and username from the database to support
 * dynamic invoice number prefix generation.
 * On failure, returns 401 JSON response.
 */
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    let token: string | undefined;

    // 1. Check httpOnly cookie first
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // 2. Fall back to Authorization header
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      res.status(401).json({ success: false, error: 'Access denied. No token provided.' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };

    // Resolve the user's name and username from the database
    const userRecord = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { name: true, username: true },
    });

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      name: userRecord?.name || 'Admin User',
      username: userRecord?.username || undefined,
    };
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};
