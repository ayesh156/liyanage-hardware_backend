import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async Express route handler so that any rejected promise is
 * automatically forwarded to the global error handler via `next(err)`.
 *
 * This completely eliminates the need for try-catch blocks inside controllers.
 *
 * Usage:
 *   router.get('/products', catchAsync(ProductController.list));
 *   // — or within controller file directly on handler functions.
 *
 * @param fn - An async function receiving (req, res, next)
 * @returns A regular Express RequestHandler that catches async errors
 */
export function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}