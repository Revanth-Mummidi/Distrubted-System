import express from 'express';
import { Queue } from 'bullmq';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

const queues = {
  email: new Queue('email', { connection }),
  data_processing: new Queue('data_processing', { connection }),
  report_generation: new Queue('report_generation', { connection })
};

app.post('/', async (req, res) => {
  const { type, payload, priority = 'NORMAL', delay = 0, webhookUrl } = req.body;

  if (!type || !queues[type]) {
    return res.status(400).json({ error: 'Invalid job type. Must be email, data_processing, or report_generation' });
  }

  let priorityValue = 2;
  if (priority === 'HIGH') priorityValue = 1;
  else if (priority === 'LOW') priorityValue = 3;

  try {
    const job = await queues[type].add(type, { payload, webhookUrl }, {
      priority: priorityValue,
      delay: delay,
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: false,
      removeOnFail: false
    });

    res.json({ success: true, jobId: job.id, type });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  // console.log(`Ingestion Service listening on port ${PORT}`);s
});
