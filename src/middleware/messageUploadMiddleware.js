import multer from "multer";

/*
|--------------------------------------------------------------------------
| Message File Upload Middleware
|--------------------------------------------------------------------------
| Files are stored temporarily in memory.
| The controller can then upload the buffer to ImageKit / Cloudinary
| or whatever storage service you are already using.
|--------------------------------------------------------------------------
*/

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",

    // Videos
    "video/mp4",
    "video/webm",
    "video/quicktime",

    // Audio
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/webm",

    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    // General files
    "text/plain",
    "application/zip",
    "application/x-rar-compressed",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(`File type not allowed: ${file.mimetype}`),
      false
    );
  }
};

const uploadMessageFile = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

export default uploadMessageFile;