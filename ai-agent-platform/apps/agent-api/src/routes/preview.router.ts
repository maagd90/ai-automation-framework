import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { previewController } from '../controllers/PreviewController';
import { MAX_FILE_SIZE_BYTES } from '../config';

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const router = Router();

router.post('/excel', upload.single('file'), (req, res) => {
  void previewController.previewExcel(req, res);
});

export { router as previewRouter };
