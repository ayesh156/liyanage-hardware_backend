import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.ts';

interface LoginInput {
  username: string;
  password: string;
}

interface LoginResult {
  token: string;
  user: {
    id: number;
    name: string;
    email: string | null;
    role: string;
    username: string | null;
  };
}

const JWT_SECRET: string = process.env.JWT_SECRET || 'liyanage-hardware-jwt-secret-change-in-production';
console.log('AUTH SERVICE JWT SECRET LOADED:', Boolean(process.env.JWT_SECRET));
console.log('AUTH SIGN SECRET LENGTH:', JWT_SECRET.length);
console.log(
  'AUTH SIGN SECRET FINGERPRINT:',
  Buffer.from(JWT_SECRET).toString('base64').slice(0, 8)
);
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';
// Cast to any to avoid strict overload issues with jwt types and ms library
const JWT_SIGN_OPTIONS = { expiresIn: JWT_EXPIRES_IN } as any;

export class AuthService {
  /**
   * Authenticate a user by username/email and password.
   * Supports login via email field (which can be a username string).
   * Returns a signed JWT + user profile on success.
   */
  static async login(data: LoginInput): Promise<LoginResult> {
    if (!data.username || !data.password) {
      throw Object.assign(new Error('Username and password are required'), { statusCode: 400 });
    }

    // Find user by email OR name (supports both 'admin'@email and display name login)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: data.username },
          { name: data.username },
        ],
        active: true,
      },
    });

    if (!user) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
    }

    // Include username in JWT payload so middleware can decode it
    // without an extra DB query
    const token = jwt.sign(
      { userId: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      JWT_SIGN_OPTIONS,
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        username: user.username,
      },
    };
  }

  /**
   * Validate a JWT and return the decoded payload.
   * Throws if the token is invalid or expired.
   */
  static verifyToken(token: string): { userId: number; role: string } {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
  } catch (error) {
    console.error('JWT VERIFY ERROR:', error);
    throw error;
  }
}
}