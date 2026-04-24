import express from 'express';
import cors from 'cors';
import { jobsRouter } from './routes/jobs.router';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.use('/api/jobs', jobsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Agent API running on http://localhost:${PORT}`);
});

export { app };
