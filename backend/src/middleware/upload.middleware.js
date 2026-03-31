const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath;
    if (file.fieldname === 'photo' || file.fieldname === 'faceImage') {
      uploadPath = path.join(__dirname, '../../uploads/employees');
    } else if (file.fieldname === 'snapshot') {
      uploadPath = path.join(__dirname, '../../uploads/snapshots');
    } else {
      uploadPath = path.join(__dirname, '../../uploads/misc');
    }
    ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, webp) are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
});

// For base64 image snapshots (face captures), save directly
const saveBase64Image = (base64String, folder = 'snapshots') => {
  const dir = path.join(__dirname, `../../uploads/${folder}`);
  ensureDir(dir);
  const filename = `${uuidv4()}.jpg`;
  const filepath = path.join(dir, filename);
  const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
  return `uploads/${folder}/${filename}`;
};

module.exports = { upload, saveBase64Image };