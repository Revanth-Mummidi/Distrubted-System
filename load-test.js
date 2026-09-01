import autocannon from 'autocannon';

const URL = 'http://localhost:3000/api/jobs';

const payload = JSON.stringify({
  type: 'data_processing',
  payload: { rows: 100 },
  priority: 'NORMAL'
});

const instance = autocannon({
  url: URL,
  connections: 50, // Handle 10000+ concurrent -> we test with 500 connections pushing fast
  pipelining: 10,
  duration: 20,
  method: 'POST',
  body: payload,
  headers: {
    'Content-type': 'application/json',
    'Authorization': 'Bearer test-token'
  }
}, console.log);

process.once('SIGINT', () => {
  instance.stop();
});

autocannon.track(instance, { renderProgressBar: true });
