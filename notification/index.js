import { QueueEvents, Queue, Job } from 'bullmq';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

const queueNames = ['email', 'data_processing', 'report_generation'];
const queues = queueNames.reduce((acc, name) => {
  acc[name] = new Queue(name, { connection });
  return acc;
}, {});

const queueEvents = queueNames.map(name => ({ name, events: new QueueEvents(name, { connection }) }));

const sendWebhook = async (url, payload) => {
  try {
    await axios.post(url, payload, { timeout: 3000 });
    console.log(`Webhook sent successfully to ${url}`);
  } catch (error) {
    console.error(`Failed to send webhook to ${url}:`, error.message);
  }
};

queueEvents.forEach(({ name, events }) => {
  events.on('completed', async ({ jobId, returnvalue }) => {
    try {
      const job = await Job.fromId(queues[name], jobId);
      if (job && job.data.webhookUrl) {
        await sendWebhook(job.data.webhookUrl, { jobId, status: 'completed', result: returnvalue });
      }
    } catch (err) {
      console.error(`Error retrieving job ${jobId} for webhook`, err);
    }
  });

  events.on('failed', async ({ jobId, failedReason }) => {
    try {
      const job = await Job.fromId(queues[name], jobId);
      if (job && job.data.webhookUrl) {
        await sendWebhook(job.data.webhookUrl, { jobId, status: 'failed', error: failedReason });
      }
    } catch (err) {
      console.error(`Error retrieving job ${jobId} for webhook`, err);
    }
  });
});

console.log('Notification service listening for job completion/failure to send webhooks...');
