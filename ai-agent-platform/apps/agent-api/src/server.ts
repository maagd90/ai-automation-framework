import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { jobsRouter } from './routes/jobs.router';
import { authMiddleware } from './middleware/auth';

const app = express();
const PORT = process.env.PORT ?? 3001;
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  ?? 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'));
    },
  }),
);
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', apiLimiter);
app.use('/api/jobs', authMiddleware, jobsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Agent API running on http://localhost:${PORT}`);
});

export { app };
