import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());

// Rate Limiter: allow 20000 reqs per 15 minutes for high throughput
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20000,
  message: 'Too many requests'
});
app.use(limiter);

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // For demo purposes, we allow requests without Auth header 
    // to make the react frontend testing easier, but in production:
    // return res.status(401).json({ error: 'Unauthorized' });
    req.user = { id: 'demo-user', role: 'admin' };
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_12345');
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Generate test token endpoint
app.post('/auth/login', express.json(), (req, res) => {
  const token = jwt.sign({ user: 'test' }, process.env.JWT_SECRET || 'super_secret_jwt_key_12345');
  res.json({ token });
});

app.use('/api', authMiddleware);

// Proxy to Ingestion Service
app.use('/api/jobs', createProxyMiddleware({ 
  target: process.env.INGESTION_URL || 'http://localhost:3001', 
  changeOrigin: true 
}));

// We proxy ws manually via status service if needed, but frontend can connect to status directly
app.get('/health', (req, res) => res.json({ status: 'Gateway OK' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
