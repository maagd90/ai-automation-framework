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

router.post('/', upload.single('file'), (req, res) => jobsController.createJob(req, res));
router.get('/:jobId/status', (req, res) => jobsController.getStatus(req, res));
router.get('/:jobId/logs', (req, res) => jobsController.getLogs(req, res));
router.get('/:jobId/report', (req, res) => jobsController.getReport(req, res));
router.get('/:jobId/cases/:testCaseId', (req, res) => jobsController.getCaseDetail(req, res));
router.get('/:jobId/download', (req, res) => jobsController.downloadArtifacts(req, res));
router.get('/:jobId/stream', (req, res) => jobsController.streamLogs(req, res));
router.get('/:jobId/artifacts/:testCaseId/:kind', (req, res) => jobsController.getArtifact(req, res));
router.get('/', (req, res) => jobsController.listJobs(req, res));
router.delete('/:jobId', (req, res) => jobsController.cancelJob(req, res));

export { router as jobsRouter };
