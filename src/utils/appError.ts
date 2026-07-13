/**
 * Custom application error class.
 *
 * - `statusCode`: HTTP status code (400, 404, 409, 500, etc.)
 * - `status`: Short string — 'fail' for 4xx, 'error' for 5xx
 * - `isOperational`: `true` for known, expected errors; `false` for unexpected bugs
 *
 * Usage in services:
 *   throw new AppError('Product not found', 404);
 *
 * The global error handler checks `isOperational` to decide whether to
 * send a sanitised response or crash-and-recover.
 */
export class AppError extends Error {
  public statusCode: number;
  public status: 'fail' | 'error';
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    // Preserve proper stack trace (works in Node.js/V8)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}