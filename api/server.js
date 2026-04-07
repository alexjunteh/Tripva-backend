/**
 * Local Express development server.
 * In production, Vercel serves api/*.js directly.
 *
 * Usage: node api/server.js  (or: npm start)
 */
import express from 'express';
import planHandler from './plan.js';
import patchHandler from './patch.js';
import healthHandler from './health.js';
import ticketHandler from './ticket.js';
import packingHandler from './packing.js';
import saveHandler from './save.js';
import tripHandler from './trip.js';
import userHandler from './user.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.all('/api/plan', planHandler);
app.all('/api/patch', patchHandler);
app.all('/api/health', healthHandler);
app.all('/api/ticket', ticketHandler);
app.all('/api/packing', packingHandler);
app.all('/api/save', saveHandler);
app.all('/api/trip', tripHandler);

// User / auth / trips endpoints (all routed through user.js)
app.all('/api/user/magic-link', userHandler);
app.all('/api/user/verify', userHandler);
app.all('/api/user/me', userHandler);
app.all('/api/user/trips/save', userHandler);
app.all('/api/user/trips/:id', userHandler);
app.all('/api/user/trips', userHandler);
app.all('/api/user', userHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TripAI backend running at http://localhost:${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  POST http://localhost:${PORT}/api/plan`);
  console.log(`  POST http://localhost:${PORT}/api/user/magic-link`);
  console.log(`  GET  http://localhost:${PORT}/api/user/trips`);
  console.log(`  POST http://localhost:${PORT}/api/user/trips/save`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠  ANTHROPIC_API_KEY is not set — requests will fail');
  }
});
