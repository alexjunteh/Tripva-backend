// lib/ticket-merger.js
import { parseTicket } from './ticket-parser.js';

const EUR_TO_RM = 5.18;
const CHF_TO_RM = 5.16;
const USD_TO_RM = 4.72;

export function mergeTicketIntoState(pdfText, state) {
  const parsed = parseTicket(pdfText);
  const updatedState = JSON.parse(JSON.stringify(state)); // deep clone

  // 1. Build ticket entry
  const slugTitle = (parsed.title || 'ticket').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const ticketId = 'ticket-' + slugTitle + '-' + Date.now().toString(36);

  const travelers = (parsed.travelers || '').split(/[,&]/).map(t => t.trim()).filter(Boolean);
  const codes = parsed.codes || [];

  const seats = travelers.length > 0
    ? travelers.map((name, i) => ({
        traveler: name,
        detail: [codes[i] ? `Code: ${codes[i]}` : '', parsed.refId ? `Ref: ${parsed.refId}` : ''].filter(Boolean).join(' | '),
      }))
    : codes.map((code, i) => ({
        traveler: `Traveller ${i + 1}`,
        detail: `Code: ${code}${parsed.refId ? ' | Ref: ' + parsed.refId : ''}`,
      }));

  const newTicket = {
    id: ticketId,
    title: parsed.title || 'Unknown Ticket',
    date: parsed.date || '',
    route: [parsed.venue, parsed.time].filter(Boolean).join(' • '),
    seats,
    images: [],
    pdfLabel: `${parsed.provider || 'Booking'} confirmation`,
  };
  if (!updatedState.tickets) updatedState.tickets = [];
  updatedState.tickets.push(newTicket);

  // 2. Find matching activity and flip ticketState
  const titleLower = (parsed.title || '').toLowerCase();
  const keywords = titleLower.split(/\s+/).filter(w => w.length > 4);

  for (const day of (updatedState.days || [])) {
    for (const item of (day.timeline || [])) {
      const itemTitle = (item.title || '').toLowerCase();
      const matches = keywords.some(kw => itemTitle.includes(kw));
      if (matches && item.ticketRequired) {
        item.ticketState = 'booked';
        const codeInfo = codes.length > 0
          ? `Codes: ${codes.join(' · ')}.`
          : '';
        const refInfo = parsed.refId ? `Ref: ${parsed.refId}.` : '';
        const howTo = parsed.importantInfo || '';
        item.detail = [codeInfo, refInfo, howTo].filter(Boolean).join(' ');
        break;
      }
    }
  }

  // 3. Add to budget
  if (!updatedState.budget) updatedState.budget = [];
  const priceText = parsed.price || '';
  const eurMatch = priceText.match(/€\s*([\d,\.]+)/);
  const chfMatch = priceText.match(/CHF\s*([\d,\.]+)/);
  let rmAmount = 0;
  let displayPrice = priceText;
  if (eurMatch) {
    rmAmount = parseFloat(eurMatch[1].replace(',', '')) * EUR_TO_RM;
    displayPrice = `€${eurMatch[1]} (~RM ${Math.round(rmAmount)})`;
  } else if (chfMatch) {
    rmAmount = parseFloat(chfMatch[1].replace(',', '')) * CHF_TO_RM;
    displayPrice = `CHF ${chfMatch[1]} (~RM ${Math.round(rmAmount)})`;
  }

  const ticketCount = Math.max(seats.length, codes.length, 1);
  updatedState.budget.push({
    label: `${parsed.title || 'Ticket'} (${ticketCount} ticket${ticketCount > 1 ? 's' : ''})`,
    amount: displayPrice || 'see receipt',
    icon: /concert|music|vivaldi|opera/i.test(parsed.title || '') ? '🎻'
        : /palace|doge|museum|gallery/i.test(parsed.title || '') ? '🏛️'
        : /train|frecciarossa/i.test(parsed.title || '') ? '🚆'
        : '🎟️',
    note: `Ref ${parsed.refId || '—'} · ${parsed.provider || '?'} ✅ Paid`,
    pct: 2,
  });

  return { state: updatedState, parsed };
}
