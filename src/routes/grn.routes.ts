import { Router } from 'express';
import { GRNController, grnUpload } from '../controllers/grn.controller.ts';

const router = Router();

// GET /api/grns/next-number — auto-generate next sequence
router.get('/next-number', GRNController.getNextNumber);

// POST /api/grns/upload — multi-image uploads
router.post('/upload', grnUpload.array('images', 10), GRNController.uploadImages);

// Settlement management endpoints
router.put('/settlements/:settlementId', GRNController.updateSettlement);
router.delete('/settlements/:settlementId', GRNController.deleteSettlement);

// GET /api/grns — list GRNs
router.get('/', GRNController.list);

// POST /api/grns — create new GRN
router.post('/', GRNController.create);

// GET /api/grns/:id/settlements — past payments for single GRN
router.get('/:id/settlements', GRNController.getSettlements);

// GET /api/grns/:id — single GRN details
router.get('/:id', GRNController.getById);

// PUT /api/grns/:id — update GRN
router.put('/:id', GRNController.update);

// DELETE /api/grns/:id — delete GRN
router.delete('/:id', GRNController.delete);

export default router;

