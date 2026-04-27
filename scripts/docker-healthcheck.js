// Docker container health check — invoked by the Dockerfile HEALTHCHECK directive.
// Exits 0 when the /health endpoint responds with HTTP 200, exits 1 otherwise.
const port = process.env.PORT || 3001;

require('http')
  .get(`http://localhost:${port}/health`, (res) => {
    process.exit(res.statusCode === 200 ? 0 : 1);
  })
  .on('error', () => process.exit(1));
