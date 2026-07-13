import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';
import { Prisma } from '@prisma/client';

/**
 * Handles Prisma's P2002 unique constraint violation error.
 * Returns a user-friendly message identifying the field(s) that caused the conflict.
 */
function handlePrismaUniqueConstraintError(err: Prisma.PrismaClientKnownRequestError): AppError {
  const target = (err.meta?.target as string[]) ?? ['field'];
  const field = target.join(', ');
  const message = `A record with this ${field} already exists. Please use a different value.`;
  return new AppError(message, 409);
}

/**
 * Handles Prisma's P2025 "Record not found" error.
 * This occurs when an update/delete operation targets a non-existent record.
 */
function handlePrismaNotFoundError(err: Prisma.PrismaClientKnownRequestError): AppError {
  const modelName = (err.meta?.modelName as string) ?? 'Record';
  const message = `${modelName} not found. It may have been deleted or the provided ID is invalid.`;
  return new AppError(message, 404);
}

/**
 * Handles Prisma's P2003 foreign key constraint violation.
 */
function handlePrismaForeignKeyError(err: Prisma.PrismaClientKnownRequestError): AppError {
  const field = (err.meta?.field_name as string) ?? 'related record';
  const message = `Operation failed because this record is linked to a ${field} that does not exist.`;
  return new AppError(message, 409);
}

/**
 * Maps known Prisma error codes to user-friendly AppError instances.
 * Unknown Prisma errors fall through to the generic handler.
 */
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case 'P2002':
      return handlePrismaUniqueConstraintError(err);
    case 'P2025':
      return handlePrismaNotFoundError(err);
    case 'P2003':
      return handlePrismaForeignKeyError(err);
    default:
      console.error(`[PRISMA] Unhandled error code ${err.code}:`, err.message);
      return new AppError('A database error occurred. Please try again.', 500);
  }
}

/**
 * Express validation error (e.g. from express-validator or zod middleware).
 * Adapt this if you integrate a validation library later.
 */
function handleValidationError(err: any): AppError {
  const message = err.message || 'Invalid input data.';
  return new AppError(message, 400);
}

/**
 * Global error handler middleware.
 *
 * Features:
 * 1. Catches AppError instances and sends the expected structured response.
 * 2. Catches Prisma client known request errors (P2002, P2025, P2003) and maps
 *    them to human-readable messages with appropriate HTTP status codes.
 * 3. Catches generic errors and sanitises them for production (no stack leaks).
 * 4. Logs 5xx errors to the console for debugging.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── 1. Start with a default 500 if nothing else matches ──
  let error: AppError;

  if (err instanceof AppError) {
    // Already a known operational error — use as-is
    error = err;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma known error (unique constraint, not found, FK violation)
    error = handlePrismaError(err);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    // Prisma validation error (malformed query, wrong field types)
    error = new AppError('Invalid database query. Check your request data.', 400);
  } else if (err instanceof SyntaxError && 'body' in err) {
    // JSON parse error from express.json()
    error = new AppError('Invalid JSON payload. Please check your request body.', 400);
  } else if (err.name === 'ValidationError') {
    // Generic validation error
    error = handleValidationError(err);
  } else {
    // Unknown / programming error — keep generic in production
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';
    error = new AppError(message, 500);
    error.isOperational = false; // Mark as non-operational (unexpected bug)
  }

  // ── 2. Logging ──
  if (error.statusCode >= 500) {
    console.error(`[ERROR] ${error.statusCode} — ${error.message}`);
    if (!error.isOperational) {
      console.error(err.stack);
    }
  } else {
    console.warn(`[WARN] ${error.statusCode} — ${error.message}`);
  }

  // ── 3. Response ──
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    status: error.status,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}