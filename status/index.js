import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { QueueEvents, Queue } from 'bullmq';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

const queueNames = ['email', 'data_processing', 'report_generation'];
const queues = queueNames.map(name => new Queue(name, { connection }));
const queueEvents = queueNames.map(name => new QueueEvents(name, { connection }));

let throughput = { count: 0 };
setInterval(() => {
  io.emit('metrics:throughput', throughput.count); // jobs per sec
  throughput.count = 0;
}, 1000);

queueEvents.forEach((ev, idx) => {
  const qName = queueNames[idx];
  ev.on('waiting', ({ jobId }) => io.emit('job:update', { jobId, status: 'waiting', queue: qName }));
  ev.on('active', ({ jobId }) => io.emit('job:update', { jobId, status: 'active', queue: qName }));
  ev.on('completed', ({ jobId, returnvalue }) => {
    throughput.count++;
    io.emit('job:update', { jobId, status: 'completed', queue: qName, returnvalue });
  });
  ev.on('failed', ({ jobId, failedReason }) => {
    io.emit('job:update', { jobId, status: 'failed', queue: qName, error: failedReason });
  });
});

setInterval(async () => {
  const counts = await Promise.all(queues.map(q => q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')));
  const result = counts.reduce((acc, count, i) => {
    acc[queueNames[i]] = count;
    return acc;
  }, {});
  io.emit('queue:depth', result);
}, 2000);

io.on('connection', (socket) => {
  // console.log('Client connected:', socket.id);
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  // console.log(`Status Service listening on port ${PORT}`);
});
