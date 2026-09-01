import autocannon from 'autocannon';

const URL = 'http://localhost:3000/api/jobs';

const payload = JSON.stringify({
  type: 'data_processing',
  payload: { rows: 100 },
  priority: 'NORMAL'
});

const instance = autocannon({
  url: URL,
  connections: 100, // 100 concurrent clients
  pipelining: 1,    // standard HTTP request/response flow
  duration: 10,
  method: 'POST',
  body: payload,
  headers: {
    'Content-type': 'application/json'
  }
}, console.log);

process.once('SIGINT', () => {
  instance.stop();
});

autocannon.track(instance, { renderProgressBar: true });
