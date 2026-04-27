import { Router } from 'express';
import multer from 'multer';
import { previewController } from '../controllers/PreviewController';
import { MAX_FILE_SIZE_BYTES } from '../config';

// Use memory storage — the preview endpoint only needs the buffer, not a temp file.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const router = Router();

router.post('/excel', upload.single('file'), (req, res) => {
  void previewController.previewExcel(req, res);
});

export { router as previewRouter };
