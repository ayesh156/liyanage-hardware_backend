import { Router } from 'express';
import productRouter from './product.routes.ts';
import authRouter from './auth.routes.ts';
import customerRouter from './customer.routes.ts';
import categoryRouter from './category.routes.ts';
import invoiceRouter from './invoice.routes.ts';
import userRouter from './user.routes.ts';

const router = Router();

// ── Health check ──
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Hardware Management System API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── Module routes ──
router.use('/products', productRouter);
router.use('/auth', authRouter);
router.use('/customers', customerRouter);
router.use('/categories', categoryRouter);
router.use('/invoices', invoiceRouter);
router.use('/users', userRouter);

export default router;
