// lib/ticket-merger.js
// Merges a parsed ticket object into a rawPlan state.
// Takes pre-parsed data (from Claude) — does NOT call parseTicket itself.

const RATES = { EUR: 5.18, '€': 5.18, CHF: 5.16, USD: 4.72, '$': 4.72, GBP: 6.55, '£': 6.55 };

function toRM(priceStr) {
  if (!priceStr) return null;
  const m = String(priceStr).match(/(EUR|CHF|USD|GBP|€|\$|£)?\s*([\d,\.]+)/i);
  if (!m) return null;
  const sym = (m[1] || '').toUpperCase().replace('€', 'EUR').replace('$', 'USD').replace('£', 'GBP');
  const val = parseFloat(m[2].replace(',', ''));
  const rate = RATES[sym] || RATES[m[1]] || null;
  if (!rate || isNaN(val)) return null;
  return Math.round(val * rate);
}

function formatBudgetAmount(parsed) {
  const price = parsed.totalPrice || parsed.pricePerPerson || null;
  if (!price) return 'see receipt';
  const rm = toRM(price);
  return rm ? `${price} (~RM ${rm})` : price;
}

function categoryIcon(parsed) {
  const cat = (parsed.category || '').toLowerCase();
  const title = (parsed.title || '').toLowerCase();
  if (cat === 'concert' || /concert|music|vivaldi|opera|orchestra/.test(title)) return '🎻';
  if (cat === 'train'   || /train|frecciarossa|intercity|eurostar/.test(title)) return '🚆';
  if (cat === 'flight'  || /flight|airline/.test(title)) return '✈️';
  if (cat === 'hotel'   || /hotel|hostel|villa|resort/.test(title)) return '🏨';
  if (/palace|doge|colosseum|borghese|uffizi|gallery|museum|basilica/.test(title)) return '🏛️';
  return '🎟️';
}

/**
 * Merge a parsed ticket into a rawPlan state object.
 * @param {object} parsed - output from parseTicket() or a hardcoded parsed object
 * @param {object} state  - rawPlan state (days, tickets, budget, etc.)
 * @returns {{ state: object, parsed: object }}
 */
export function mergeTicketIntoState(parsed, state) {
  const updatedState = JSON.parse(JSON.stringify(state)); // deep clone

  // ── 1. Build seats array ────────────────────────────────────────────────────
  let seats = [];
  if (parsed.seats && parsed.seats.length > 0) {
    // Claude returned structured seats — use directly
    seats = parsed.seats;
  } else {
    // Fallback: construct from travelers + codes
    const travelers = Array.isArray(parsed.travelers)
      ? parsed.travelers
      : (parsed.travelers || '').split(/[,&]/).map(t => t.trim()).filter(Boolean);
    const codes = parsed.codes || [];
    const count = Math.max(travelers.length, codes.length, 1);

    seats = Array.from({ length: count }, (_, i) => ({
      traveler: travelers[i] || `Traveller ${i + 1}`,
      detail: [
        codes[i] ? `Code: ${codes[i]}` : '',
        parsed.refId ? `Ref: ${parsed.refId}` : '',
      ].filter(Boolean).join(' | '),
    }));
  }

  // ── 2. Add to tickets[] ─────────────────────────────────────────────────────
  const slugTitle = (parsed.title || 'ticket')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const ticketId = `ticket-${slugTitle}-${Date.now().toString(36)}`;

  const newTicket = {
    id:       ticketId,
    title:    parsed.title || 'Unknown Ticket',
    date:     parsed.date || '',
    route:    [parsed.venue, parsed.time].filter(Boolean).join(' • '),
    seats,
    images:   [],
    pdfLabel: `${parsed.provider || 'Booking'} confirmation`,
  };
  if (!updatedState.tickets) updatedState.tickets = [];
  updatedState.tickets.push(newTicket);

  // ── 3. Flip ticketState on matching activity ────────────────────────────────
  const keywords = (parsed.title || '').toLowerCase()
    .split(/[\s\-–—:,]+/).filter(w => w.length > 4);

  let matched = false;
  for (const day of (updatedState.days || [])) {
    if (matched) break;
    for (const item of (day.timeline || [])) {
      const itemTitle = (item.title || '').toLowerCase();
      const hits = keywords.filter(kw => itemTitle.includes(kw)).length;
      if (hits >= 1 && item.ticketRequired) {
        item.ticketState = 'booked';
        const codeInfo   = (parsed.codes || []).length > 0 ? `Codes: ${parsed.codes.join(' · ')}.` : '';
        const refInfo    = parsed.refId ? `Ref: ${parsed.refId}.` : '';
        const howTo      = parsed.importantInfo || '';
        item.detail = [codeInfo, refInfo, howTo].filter(Boolean).join(' ');
        matched = true;
        break;
      }
    }
  }

  // ── 4. Add to budget[] ──────────────────────────────────────────────────────
  if (!updatedState.budget) updatedState.budget = [];
  updatedState.budget.push({
    label:  `${parsed.title || 'Ticket'} (${seats.length} ticket${seats.length > 1 ? 's' : ''})`,
    amount: formatBudgetAmount(parsed),
    icon:   categoryIcon(parsed),
    note:   `Ref ${parsed.refId || '—'} · ${parsed.provider || '?'} ✅ Paid`,
    pct:    2,
  });

  return { state: updatedState, parsed };
}
