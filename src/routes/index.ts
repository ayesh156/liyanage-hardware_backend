import { Router } from 'express';
import productRouter from './product.routes.js';
import authRouter from './auth.routes.js';
import customerRouter from './customer.routes.js';
import categoryRouter from './category.routes.js';
import invoiceRouter from './invoice.routes.js';
import userRouter from './user.routes.js';

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
