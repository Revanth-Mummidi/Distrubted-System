import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import pg from 'pg';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Create users table on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(err => console.error('DB init error:', err));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20000,
  message: 'Too many requests'
});
app.use(limiter);

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_key_12345');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Verify Google ID token, upsert user, return JWT
app.post('/auth/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const { sub: googleId, email, name, picture } = ticket.getPayload();

    const { rows } = await pool.query(
      `INSERT INTO users (google_id, email, name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE
         SET email = EXCLUDED.email, name = EXCLUDED.name, avatar_url = EXCLUDED.avatar_url
       RETURNING id, email, name, avatar_url`,
      [googleId, email, name, picture]
    );
    const user = rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar_url },
      process.env.JWT_SECRET || 'super_secret_jwt_key_12345',
      { expiresIn: '7d' }
    );
    res.json({ token, user });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.use('/api', authMiddleware);

// Stamp userId on every downstream request
app.use('/api', (req, res, next) => {
  req.headers['x-user-id'] = req.user.id;
  next();
});

app.use('/api/jobs', createProxyMiddleware({
  target: process.env.INGESTION_URL || 'http://localhost:3001',
  changeOrigin: true
}));

app.get('/health', (req, res) => res.json({ status: 'Gateway OK' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API Gateway listening on port ${PORT}`));
