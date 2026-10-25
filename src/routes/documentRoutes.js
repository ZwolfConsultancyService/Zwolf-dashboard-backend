import express from 'express';
import multer from 'multer';
import { uploadDocument, getDocument, viewDocument } from '../controllers/documentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

// Manager upload karega
router.post('/upload', authorize('manager'), upload.single('pdf'), uploadDocument);

// Client aur Manager dono fetch kar sakte hain
router.get('/', getDocument);
router.get('/view', viewDocument); // Secure viewer

export default router;