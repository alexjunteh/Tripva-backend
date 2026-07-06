/**
 * Local Express development server.
 * In production, Vercel serves api/*.js directly.
 *
 * Usage: node api/server.js  (or: npm start)
 */
import express from 'express';
import planHandler from './plan.js';
import tripHandler from './trip.js';
import statsHandler from './stats.js';
import parseBookingHandler from './parse-booking.js';
import packingHandler from './packing.js';
import photospotHandler from './photospot.js';
import userHandler from './user.js';
import flightsHandler from './flights.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.all('/api/plan', planHandler);
app.all('/api/trip', tripHandler);
app.all('/api/health', (req, res) => {
  req.query = { ...(req.query || {}), _health: '1' };
  return statsHandler(req, res);
});
app.all('/api/stats', statsHandler);
app.all('/api/photospot', photospotHandler);
app.all('/api/flights', flightsHandler);
app.all('/api/flights/:action', flightsHandler);
app.all('/api/spots', (req, res) => {
  req.query = { ...(req.query || {}), selector: '1' };
  return photospotHandler(req, res);
});
app.all('/api/track', statsHandler);
app.all('/api/parse-booking', parseBookingHandler);
app.all('/api/packing', packingHandler);

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
  console.log(`Tripva backend running at http://localhost:${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
  console.log(`  POST http://localhost:${PORT}/api/plan`);
  console.log(`  POST http://localhost:${PORT}/api/parse-booking`);
  console.log(`  POST http://localhost:${PORT}/api/user/magic-link`);
  console.log(`  GET  http://localhost:${PORT}/api/user/trips`);
  console.log(`  POST http://localhost:${PORT}/api/user/trips/save`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY is not set — plan, packing, and photospot requests will fail');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY is not set — parse-booking requests will fail');
  }
});
