import express from 'express';
import {
  getClients, createClient, getClient, updateClient, deleteClient, addClientNote,
} from '../controllers/clientController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
router.use(protect, authorize('manager', 'sales'));

router.route('/').get(getClients).post(createClient);
router.route('/:id').get(getClient).put(updateClient).delete(deleteClient);
router.post('/:id/notes', addClientNote);

export default router;