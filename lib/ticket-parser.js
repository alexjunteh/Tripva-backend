// lib/ticket-parser.js
// Parses raw PDF text from booking confirmations into structured ticket data.
// Supports: Klook, Viator, Trenitalia, Tiqets, SBB, generic

export function parseTicket(pdfText) {
  const text = pdfText || '';

  return {
    title:         extractTitle(text),
    date:          extractDate(text),
    time:          extractTime(text),
    venue:         extractVenue(text),
    refId:         extractRef(text),
    codes:         extractCodes(text),
    travelers:     extractTravelers(text),
    price:         extractPrice(text),
    provider:      detectProvider(text),
    importantInfo: extractImportantInfo(text),
  };
}

function extractTitle(text) {
  // Try common patterns: "Activity: X", "Ticket type:", event name lines
  const patterns = [
    /I Musici Veneziani[^\n]*/i,
    /Doge['']s Palace[^\n]*/i,
    /Vivaldi[^\n]*/i,
    /([A-Z][^.\n]{10,50})(?:\s+(?:Fast Track|Skip|Ticket|Concert|Tour|Entry))/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].trim().slice(0, 80);
  }
  // Fall back: first non-empty line longer than 10 chars
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 10);
  return lines[0] || 'Unknown Ticket';
}

function extractDate(text) {
  // "Mar 25, 2026", "2026-03-25", "25/03/2026"
  const patterns = [
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s+\d{4}/i,
    /\d{4}-\d{2}-\d{2}/,
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return '';
}

function extractTime(text) {
  const m = text.match(/\b(\d{1,2}:\d{2})\s*(?:AM|PM|am|pm)?\b/);
  return m ? m[1] : '';
}

function extractVenue(text) {
  const patterns = [
    /(?:Address|Starting point|Venue|Location)[:\s]+([^\n]{10,100})/i,
    /(?:Piazza San Marco|Campo San|Scuola Grande|Palazzo)[^\n]*/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).trim().slice(0, 120);
  }
  return '';
}

function extractRef(text) {
  const patterns = [
    /(?:Reference ID|Booking ref|Ref\.?|Order|Confirmation)[:\s#.]+([A-Z0-9]{6,20})/i,
    /\b([A-Z0-9]{8,12})\b(?=\s*\n|\s+\d\/\d)/, // standalone code before "1/2" etc
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return (m[1] || m[0]).trim();
  }
  return '';
}

function extractCodes(text) {
  // Individual ticket codes: alphanumeric 8-12 chars, often appear as "CODE 1/2" or "CODE\n2/2"
  const codes = [];
  const pattern = /\b([A-Z0-9]{8,12})\b(?:\s+(?:\d\/\d|\n))/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    if (!codes.includes(m[1])) codes.push(m[1]);
  }
  return codes;
}

function extractTravelers(text) {
  const patterns = [
    /(?:Travellers?|Guests?|Name)[:\s]+([A-Za-z ]+?)(?:\s*[•·]\s*(\d+)\s*adults?)?/i,
    /Ordered by\s+([A-Za-z ]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return '';
}

function extractPrice(text) {
  const m = text.match(/(?:Total|Price|Amount|€|EUR|CHF|USD|RM)\s*[\s:]?\s*([\d,\.]+)/i);
  return m ? m[0].trim() : '';
}

function detectProvider(text) {
  if (/klook/i.test(text)) return 'Klook';
  if (/viator/i.test(text)) return 'Viator';
  if (/tiqets/i.test(text)) return 'Tiqets';
  if (/trenitalia/i.test(text)) return 'Trenitalia';
  if (/sbb/i.test(text)) return 'SBB';
  if (/booking\.com/i.test(text)) return 'Booking.com';
  return 'Unknown';
}

function extractImportantInfo(text) {
  const patterns = [
    /(?:pre-?paid ticket|fast.?track|skip.?the.?line)[^\n]*/gi,
    /(?:dress code)[^\n]*/gi,
    /(?:important information)[:\s\n]+([^\n]{10,200})/gi,
  ];
  const infos = [];
  for (const p of patterns) {
    const matches = text.matchAll ? [...text.matchAll(p)] : [];
    for (const m of matches) infos.push((m[1] || m[0]).trim());
  }
  return infos.slice(0, 3).join(' | ');
}
