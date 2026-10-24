import multer from 'multer';

// Use memory storage for direct upload to ImageKit without storing temporary files on disk
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        const err = new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
        err.status = 400;
        cb(err, false);
    }
};

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB max
    },
    fileFilter
});

export default upload;