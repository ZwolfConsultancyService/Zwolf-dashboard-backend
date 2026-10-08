import multer from 'multer';

/* =========================================================
   FACE UPLOAD MIDDLEWARE
   
   Stores file in memory (buffer) — no disk write
========================================================= */

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error('Only JPG, PNG, WEBP images allowed'),
      false
    );
  }
};

const faceUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter,
});

export default faceUpload;