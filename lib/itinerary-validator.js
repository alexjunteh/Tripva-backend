/**
 * itinerary-validator.js
 *
 * Runs after plan generation, before returning to user.
 * Auto-fixes structural errors; collects warnings for UI display.
 *
 * Usage:
 *   import { validateItinerary } from '../lib/itinerary-validator.js';
 *   const { plan, warnings, fixesApplied } = validateItinerary(plan);
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse "HH:MM" to minutes since midnight.
 * Returns null for non-clock values (e.g. "Apr 1 · 06:00", "All day").
 */
function parseTimeMins(t) {
  if (!t) return null;
  const s = String(t);
  // Skip cross-day strings like "Apr 1 · 06:00"
  if (/[A-Za-z]{3}\s+\d/.test(s)) return null;
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Format minutes back to "HH:MM" */
function fmtMins(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Regex patterns ────────────────────────────────────────────────────────────

const DINNER_SNACK_RE = /\bcicchetti\b|\btapas\b|\bbar\b|\bmarket\b/i;
const ADVANCE_BOOKING_RE = /book \d+ weeks|weeks ahead/i;
const HAS_BOOKING_REF_RE = /\u2705|PNR|order\s+\d+/i;
const PENDING_EMOJI = '\u23F3';

// ─── Main export ───────────────────────────────────────────────────────────────

/**
 * Validate + auto-fix an AI-generated itinerary plan.
 *
 * @param {object} plan - Full trip state (rawPlan.days, segments, activities, bookNow)
 * @returns {{ plan: object, warnings: object[], fixesApplied: object[] }}
 */
export function validateItinerary(plan) {
  const warnings = [];
  const fixesApplied = [];

  if (!plan || !plan.rawPlan || !Array.isArray(plan.rawPlan.days)) {
    return { plan, warnings, fixesApplied };
  }

  // Deep-clone to avoid mutating the original
  const result = JSON.parse(JSON.stringify(plan));
  const days = result.rawPlan.days;
  const segments = result.segments || [];
  const bookNow = result.bookNow || {};

  // Build segment index for drift check: { segId -> segment }
  const segById = {};
  for (const seg of segments) {
    if (seg.id) segById[seg.id] = seg;
  }

  // Track previous-day venue titles for consecutive-day check
  const prevDayVenues = new Set();

  for (const day of days) {
    const dayNum = day.day || '?';
    const timeline = day.timeline || [];
    const thisVenues = new Set();

    // ── CHECK 1: Duplicate times ─────────────────────────────────────────────
    const timeSeen = {};
    for (let i = 0; i < timeline.length; i++) {
      const item = timeline[i];
      const t = item.time || '';
      const mins = parseTimeMins(t);
      if (mins === null) continue;

      if (t in timeSeen) {
        const newMins = mins + 15;
        timeline[i] = { ...item, time: fmtMins(newMins) };
        fixesApplied.push({
          day: dayNum,
          fix: 'duplicate-time',
          message: `Duplicate ${t} on Day ${dayNum} — shifted "${item.title || ''}" to ${fmtMins(newMins)}`
        });
      } else {
        timeSeen[t] = i;
      }
    }

    // ── CHECK 2: Timeline out of order ───────────────────────────────────────
    const clockItems = timeline
      .map((item, idx) => ({ item, idx, mins: parseTimeMins(item.time || '') }))
      .filter(x => x.mins !== null);

    const isOutOfOrder = clockItems.some((x, i) => i > 0 && x.mins < clockItems[i - 1].mins);

    if (isOutOfOrder) {
      const sortedClock = [...clockItems].sort((a, b) => a.mins - b.mins);
      const newTimeline = [...timeline];
      for (let i = 0; i < clockItems.length; i++) {
        newTimeline[clockItems[i].idx] = sortedClock[i].item;
      }
      day.timeline = newTimeline;
      fixesApplied.push({
        day: dayNum,
        fix: 'timeline-sorted',
        message: `Day ${dayNum} timeline was out of order — sorted by time`
      });
    }

    // Work on the (potentially updated) timeline for remaining checks
    const tl = day.timeline || timeline;

    // ── CHECK 3: Segment/timeline drift ─────────────────────────────────────
    for (const item of tl) {
      if (!item.segmentId) continue;
      const seg = segById[item.segmentId];
      if (!seg) continue;

      const combined = (item.detail || '') + (item.title || '');
      if (seg.bookingState === 'booked' && combined.includes(PENDING_EMOJI)) {
        item.detail = (item.detail || '').replace(/\u23F3/g, '\u2705 (verify booking)');
        fixesApplied.push({
          day: dayNum,
          fix: 'segment-drift',
          message: `Day ${dayNum}: segment "${seg.id}" is booked but timeline showed ⏳ — updated to ✅`
        });
      }
    }

    // ── CHECK 4: Impossible check-in buffer ──────────────────────────────────
    for (let i = 0; i < tl.length; i++) {
      const item = tl[i];
      if (item.type !== 'hotel' && item.type !== 'accommodation') continue;

      const hotelMins = parseTimeMins(item.time || '');
      if (hotelMins === null) continue;

      for (let j = i - 1; j >= 0; j--) {
        const prev = tl[j];
        if (prev.type !== 'transport') continue;

        const transportMins = parseTimeMins(prev.time || '');
        if (transportMins === null) break;

        const gap = hotelMins - transportMins;
        if (gap >= 0 && gap < 30) {
          const newMins = transportMins + 45;
          tl[i] = { ...item, time: fmtMins(newMins) };
          fixesApplied.push({
            day: dayNum,
            fix: 'checkin-buffer',
            message: `Day ${dayNum}: hotel check-in ${fmtMins(hotelMins)} too close to transport arrival ${fmtMins(transportMins)} — pushed to ${fmtMins(newMins)}`
          });
        }
        break;
      }
    }

    // ── CHECK 5: Dinner venue category ───────────────────────────────────────
    for (const item of tl) {
      if (item.type !== 'food') continue;
      const mins = parseTimeMins(item.time || '');
      if (mins === null || mins < 20 * 60) continue;

      const text = `${item.title || ''} ${item.detail || ''}`;
      if (DINNER_SNACK_RE.test(text)) {
        warnings.push({
          day: dayNum,
          time: item.time,
          check: 'dinner-venue',
          message: `Day ${dayNum} ${item.time}: "${item.title}" — cicchetti/bar keyword at dinner hour (20:00+). Check this is a real dinner restaurant.`
        });
      }
    }

    // ── CHECK 6: Advance booking without ref ─────────────────────────────────
    for (const item of tl) {
      const detail = item.detail || '';
      if (ADVANCE_BOOKING_RE.test(detail) && !HAS_BOOKING_REF_RE.test(detail)) {
        warnings.push({
          day: dayNum,
          time: item.time || '',
          check: 'unbooked-prereq',
          message: `Day ${dayNum} ${item.time || ''}: "${item.title}" requires advance booking but no confirmation ref found.`
        });
      }
    }

    // ── CHECK 7: ticketRequired but pending → add to urgent ──────────────────
    for (const item of tl) {
      if (!item.ticketRequired) continue;
      if ((item.ticketState || 'pending') === 'booked') continue;

      warnings.push({
        day: dayNum,
        time: item.time || '',
        check: 'ticket-pending',
        message: `Day ${dayNum}: "${item.title}" requires a ticket but ticketState is not booked.`
      });

      if (!bookNow.urgent) bookNow.urgent = [];
      const alreadyUrgent = bookNow.urgent.some(u =>
        (u.title || u.name || '').toLowerCase() === (item.title || '').toLowerCase()
      );
      if (!alreadyUrgent) {
        bookNow.urgent.push({
          title: item.title,
          day: dayNum,
          time: item.time || '',
          note: 'Ticket required — not yet confirmed'
        });
        fixesApplied.push({
          day: dayNum,
          fix: 'ticket-to-urgent',
          message: `Day ${dayNum}: "${item.title}" added to urgent booking list`
        });
      }
    }

    // ── CHECK 8: Same venue consecutive days ─────────────────────────────────
    for (const item of tl) {
      const name = (item.title || '').toLowerCase().trim();
      if (!name || item.type === 'transport' || item.type === 'hotel') continue;
      thisVenues.add(name);
      if (prevDayVenues.has(name)) {
        warnings.push({
          day: dayNum,
          time: item.time || '',
          check: 'consecutive-venue',
          message: `Day ${dayNum}: "${item.title}" also appeared on Day ${dayNum - 1} — same venue on consecutive days?`
        });
      }
    }

    prevDayVenues.clear();
    for (const v of thisVenues) prevDayVenues.add(v);

    // Write bookNow back
    result.bookNow = bookNow;
  }

  return { plan: result, warnings, fixesApplied };
}
