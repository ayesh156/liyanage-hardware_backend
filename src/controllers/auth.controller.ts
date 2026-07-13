import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';

/**
 * POST /api/auth/login
 * Body: { username, password }
 * On success: sets httpOnly cookie + returns JSON with token and user.
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username, password } = req.body;
    const result = await AuthService.login({ username, password });

    // Set httpOnly secure cookie (same-site lax, secure in production)
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: {
        token: result.token,
        user: result.user,
      },
    });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Login failed',
    });
  }
};

/**
 * POST /api/auth/logout
 * Explicitly clears the auth_token cookie by setting its expiration to a past date.
 * Uses httpOnly, secure, and sameSite: 'strict' for maximum cookie security.
 */
export const logout = async (_req: Request, res: Response) => {
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
  });
  res.json({ success: true, message: 'Logged out successfully' });
};

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 * Requires valid JWT token via cookie or Authorization header.
 */
export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract token from cookie or Authorization header
    let token: string | undefined;

    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const decoded = AuthService.verifyToken(token);
    const { prisma } = await import('../lib/prisma.js');

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true, active: true },
    });

    if (!user || !user.active) {
      res.status(401).json({ success: false, error: 'User not found or inactive' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error: any) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};