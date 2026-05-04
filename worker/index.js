import { Worker } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

// Simulated delay helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const emailWorker = new Worker('email', async job => {
  const { payload } = job.data;
  console.log(`Processing email job ${job.id}`);
  await sleep(200); // 200ms fake processing
  if (Math.random() < 0.1) throw new Error('Random simulated failure (email)');
  return { status: 'sent', recipient: payload?.to };
}, { connection, concurrency: 10 });

const dataWorker = new Worker('data_processing', async job => {
  const { payload } = job.data;
  console.log(`Processing data job ${job.id}`);
  await sleep(100); // 100ms fake processing
  if (Math.random() < 0.1) throw new Error('Random simulated failure (data)');
  return { status: 'processed', rows: payload?.rows || 100 };
}, { connection, concurrency: 20 });

const reportWorker = new Worker('report_generation', async job => {
  const { payload } = job.data;
  console.log(`Processing report job ${job.id}`);
  await sleep(500); // 500ms fake processing
  if (Math.random() < 0.1) throw new Error('Random simulated failure (report)');
  return { status: 'generated', reportUrl: 'http://example.com/report.pdf' };
}, { connection, concurrency: 5 });

console.log('Workers started: email(10), data_processing(20), report_generation(5)');

// Graceful shutdown
process.on('SIGINT', async () => {
  await Promise.all([emailWorker.close(), dataWorker.close(), reportWorker.close()]);
  process.exit(0);
});
