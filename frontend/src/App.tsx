import { useState, useEffect, useCallback } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import io from 'socket.io-client';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './index.css';

const GATEWAY_URL = 'http://localhost:3000';
const WS_URL = 'http://localhost:3002';

interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
}

// --- Login Page ---
function LoginPage({ onLogin }: { onLogin: (user: User, token: string) => void }) {
  const [error, setError] = useState('');

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      const res = await axios.post(`${GATEWAY_URL}/auth/google`, {
        credential: credentialResponse.credential,
      });
      localStorage.setItem('token', res.data.token);
      onLogin(res.data.user, res.data.token);
    } catch {
      setError('Sign-in failed. Please try again.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">Q</div>
        </div>
        <h1 className="login-title">Task Queue</h1>
        <p className="login-subtitle">Sign in to manage your distributed jobs</p>
        <div className="login-btn-wrap">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Sign-in failed. Please try again.')}
            theme="filled_black"
            size="large"
            shape="rectangular"
            width="280"
          />
        </div>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

// --- Dashboard ---
function Dashboard({ user, token, onLogout }: { user: User; token: string; onLogout: () => void }) {
  const [socket] = useState(() => io(WS_URL));
  const [throughput, setThroughput] = useState(0);
  const [throughputHistory, setThroughputHistory] = useState(
    Array.from({ length: 20 }, (_, i) => ({ time: i, val: 0 }))
  );
  const [queueDepth, setQueueDepth] = useState({
    email: { waiting: 0, active: 0, completed: 0, failed: 0 },
    data_processing: { waiting: 0, active: 0, completed: 0, failed: 0 },
    report_generation: { waiting: 0, active: 0, completed: 0, failed: 0 },
  });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [formData, setFormData] = useState({ type: 'email', priority: 'NORMAL', delay: '', webhookUrl: '' });

  useEffect(() => {
    socket.on('metrics:throughput', (val) => {
      setThroughput(val);
      setThroughputHistory(prev => [...prev.slice(1), { time: prev[prev.length - 1].time + 1, val }]);
    });
    socket.on('queue:depth', (data) => setQueueDepth(data));
    socket.on('job:update', (data) => setRecentJobs(prev => [data, ...prev].slice(0, 50)));
    return () => {
      socket.off('metrics:throughput');
      socket.off('queue:depth');
      socket.off('job:update');
      socket.disconnect();
    };
  }, [socket]);

  const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const submitJob = useCallback(async (e: any) => {
    e.preventDefault();
    try {
      await axios.post(`${GATEWAY_URL}/api/jobs`, {
        type: formData.type,
        priority: formData.priority,
        delay: formData.delay ? parseInt(formData.delay) : 0,
        payload: { target: user.email },
        webhookUrl: formData.webhookUrl || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      alert('Failed to submit job');
    }
  }, [formData, token, user.email]);

  const totalWaiting = Object.values(queueDepth).reduce((acc, q) => acc + (q?.waiting || 0), 0);
  const totalCompleted = Object.values(queueDepth).reduce((acc, q) => acc + (q?.completed || 0), 0);

  return (
    <div className="container">
      <div className="header">
        <h1>Distributed Task Queue</h1>
        <div className="header-right">
          <div style={{ color: 'var(--success)', fontSize: '0.875rem' }}>● System Online</div>
          <div className="user-pill">
            {user.avatar
              ? <img src={user.avatar} alt={user.name} className="user-avatar" />
              : <div className="user-avatar-fallback">{user.name[0]}</div>
            }
            <span className="user-name">{user.name}</span>
            <button className="btn-logout" onClick={onLogout}>Sign out</button>
          </div>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card">
          <div className="metric-title">Throughput</div>
          <div className="metric-value">{throughput} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>jobs/sec</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Total Waiting</div>
          <div className="metric-value" style={{ color: 'var(--warning)' }}>{totalWaiting}</div>
        </div>
        <div className="metric-card">
          <div className="metric-title">Total Completed</div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>{totalCompleted}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel" style={{ height: 'fit-content' }}>
          <h2>Submit Job</h2>
          <form onSubmit={submitJob}>
            <div className="form-group">
              <label>Job Type</label>
              <select name="type" className="form-control" value={formData.type} onChange={handleChange}>
                <option value="email">Email</option>
                <option value="data_processing">Data Processing</option>
                <option value="report_generation">Report Generation</option>
              </select>
            </div>
            <div className="form-group">
              <label>Priority</label>
              <select name="priority" className="form-control" value={formData.priority} onChange={handleChange}>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div className="form-group">
              <label>Delay (ms)</label>
              <input type="number" name="delay" className="form-control" placeholder="0" value={formData.delay} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>Webhook URL (optional)</label>
              <input type="url" name="webhookUrl" className="form-control" placeholder="https://..." value={formData.webhookUrl} onChange={handleChange} />
            </div>
            <button type="submit" className="btn">Enqueue Job</button>
          </form>

          <h2 style={{ marginTop: '2rem' }}>Queue Depths</h2>
          {Object.entries(queueDepth).map(([name, data]) => (
            <div key={name} style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--text-main)', textTransform: 'uppercase' }}>{name.replace('_', ' ')}</h3>
              <div className="queue-depth-row">
                <div className="qd-item"><div className="qd-val" style={{ color: 'var(--warning)' }}>{data?.waiting}</div><div className="qd-label">Wait</div></div>
                <div className="qd-item"><div className="qd-val" style={{ color: 'var(--accent)' }}>{data?.active}</div><div className="qd-label">Active</div></div>
                <div className="qd-item"><div className="qd-val" style={{ color: 'var(--success)' }}>{data?.completed}</div><div className="qd-label">Done</div></div>
                <div className="qd-item"><div className="qd-val" style={{ color: 'var(--danger)' }}>{data?.failed}</div><div className="qd-label">Fail</div></div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="panel" style={{ height: '300px' }}>
            <h2>Real-time Throughput</h2>
            <ResponsiveContainer width="100%" height="80%">
              <AreaChart data={throughputHistory}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46' }} />
                <Area type="monotone" dataKey="val" stroke="#3b82f6" fillOpacity={1} fill="url(#colorVal)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="panel" style={{ flex: 1 }}>
            <h2>Live Feed</h2>
            <div className="events-list">
              {recentJobs.map((job, idx) => (
                <div key={idx} className="event-item">
                  <div>
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{job.queue}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: '0.5rem' }}>#{job.jobId}</span>
                  </div>
                  <div className={`badge ${job.status}`}>{job.status}</div>
                </div>
              ))}
              {recentJobs.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No jobs yet...</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Root ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState('');

  // Restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('token');
    if (!stored) return;
    axios.get(`${GATEWAY_URL}/auth/me`, { headers: { Authorization: `Bearer ${stored}` } })
      .then(res => { setUser(res.data.user); setToken(stored); })
      .catch(() => localStorage.removeItem('token'));
  }, []);

  const handleLogin = (u: User, t: string) => { setUser(u); setToken(t); };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setToken('');
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;
  return <Dashboard user={user} token={token} onLogout={handleLogout} />;
}
