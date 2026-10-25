import GlobalDocument from '../models/GlobalDocument.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import axios from 'axios';

// 1. Manager PDF Upload Karega
export const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'PDF file is required');
  if (req.file.mimetype !== 'application/pdf') {
    throw new ApiError(400, 'Only PDF files are allowed');
  }

  // ⚠️ Yahan ImageKit ya local upload ka logic aayega. 
  // Abhi ke liye hum maan rahe hain ki file upload ho kar URL mil gaya hai.
  const fileUrl = req.file.path || 'https://example.com/dummy.pdf'; 

  // Purane document ko delete karke naya save karenge (sirf 1 hi PDF rahega)
  await GlobalDocument.deleteMany({});
  const doc = await GlobalDocument.create({
    fileUrl,
    uploadedBy: req.user._id,
  });

  res.status(201).json({ success: true, message: 'Document uploaded', data: doc });
});

// 2. Client PDF Fetch Karega
export const getDocument = asyncHandler(async (req, res) => {
  const doc = await GlobalDocument.findOne().sort('-createdAt');
  if (!doc) throw new ApiError(404, 'No document uploaded yet');
  res.json({ success: true, data: doc });
});

// 3. Secure PDF View (Proxy)
// Yeh ensure karega ki PDF direct download na ho, browser mein inline khule
export const viewDocument = asyncHandler(async (req, res) => {
  const doc = await GlobalDocument.findOne().sort('-createdAt');
  if (!doc) throw new ApiError(404, 'No document found');

  try {
    const response = await axios.get(doc.fileUrl, { responseType: 'arraybuffer' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="document.pdf"'); // inline = open in browser, no download prompt
    res.send(response.data);
  } catch (error) {
    throw new ApiError(500, 'Error loading document');
  }
});