import express from 'express';
import {
  createLocation, getLocations, getLocationTree,
  updateLocation, deleteLocation,createLocationAsSales, 
} from '../controllers/categoryLocationController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/', getLocations);
router.get('/tree', getLocationTree);
router.post('/', authorize('admin', 'manager'), createLocation);
router.put('/:id', authorize('admin', 'manager'), updateLocation);
router.delete('/:id', authorize('admin', 'manager'), deleteLocation);
// 🆕 Sales — location add kare + auto-claim
router.post('/sales-create', authorize('sales'), createLocationAsSales);

export default router;