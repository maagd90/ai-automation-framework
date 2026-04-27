import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { jobsController } from '../controllers/JobsController';
import { MAX_FILE_SIZE_BYTES } from '../config';

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

const router = Router();

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    await jobsController.createJob(req, res);
  } catch (err) {
    next(err);
  }
});
router.get('/:jobId/status', (req, res) => jobsController.getStatus(req, res));
router.get('/:jobId/logs', (req, res) => jobsController.getLogs(req, res));
router.get('/:jobId/report', (req, res) => jobsController.getReport(req, res));
router.get('/:jobId/download', (req, res) => jobsController.downloadArtifacts(req, res));

export { router as jobsRouter };
