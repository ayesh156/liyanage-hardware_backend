import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { AppError } from '../utils/appError.js';

const SALT_ROUNDS = 10;

export interface CreateUserInput {
  username: string;
  name: string;
  password: string;
  role?: 'ADMIN' | 'CASHIER' | 'STAFF';
}

export interface UpdateUserInput {
  username?: string;
  name?: string;
  password?: string;
  role?: 'ADMIN' | 'CASHIER' | 'STAFF';
  active?: boolean;
}

export interface UserResponse {
  id: number;
  name: string;
  username: string | null;
  email: string | null;
  role: string;
  active: boolean;
  createdAt: Date;
}

function toUserResponse(user: any): UserResponse {
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? null,
    email: user.email ?? null,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
  };
}

export class UserService {
  /**
   * GET /api/users
   * List all users (without exposing passwords).
   */
  static async getAll(): Promise<UserResponse[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });
    return users;
  }

  /**
   * GET /api/users/:id
   * Get a single user by ID (without password).
   */
  static async getById(id: number): Promise<UserResponse> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(`User with id ${id} not found`, 404);
    }

    return user;
  }

  /**
   * POST /api/users
   * Create a new user with encrypted password.
   */
  static async create(input: CreateUserInput): Promise<UserResponse> {
    if (!input.username || input.username.trim().length === 0) {
      throw new AppError('Username is required', 400);
    }
    if (!input.name || input.name.trim().length === 0) {
      throw new AppError('Name is required', 400);
    }
    if (!input.password || input.password.length < 4) {
      throw new AppError('Password must be at least 4 characters', 400);
    }

    // Check for existing username (using findFirst since username may not be in Prisma unique types yet)
    const existing = await prisma.user.findFirst({
      where: { username: input.username.trim() },
    });
    if (existing) {
      throw new AppError(`Username "${input.username}" is already taken`, 409);
    }

    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: input.username.trim(),
        name: input.name.trim(),
        password: hashedPassword,
        role: input.role || 'STAFF',
        active: true,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return user;
  }

  /**
   * PUT /api/users/:id
   * Update user fields. Password is encrypted before storage.
   */
  static async update(id: number, input: UpdateUserInput): Promise<UserResponse> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(`User with id ${id} not found`, 404);
    }

    // Check username uniqueness if changing
    if (input.username !== undefined) {
      const usernameTrimmed = input.username.trim();
      if (usernameTrimmed.length === 0) {
        throw new AppError('Username cannot be empty', 400);
      }
      const conflict = await prisma.user.findFirst({
        where: {
          username: usernameTrimmed,
          NOT: { id },
        },
      });
      if (conflict) {
        throw new AppError(`Username "${usernameTrimmed}" is already taken`, 409);
      }
    }

    const updateData: any = {};
    if (input.username !== undefined) updateData.username = input.username.trim();
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.role !== undefined) updateData.role = input.role;
    if (input.active !== undefined) updateData.active = input.active;
    if (input.password !== undefined) {
      updateData.password = await bcrypt.hash(input.password, SALT_ROUNDS);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    return user;
  }
}