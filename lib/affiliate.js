/**
 * Affiliate URL generator — Level 1 booking
 *
 * Generates pre-filled booking URLs with affiliate tracking.
 * User lands on partner site with dates/details pre-filled → just pays.
 * We earn commission on completed bookings.
 *
 * Revenue per booking (approx):
 *   Hotels (Booking.com): 4–6% of room cost
 *   Trains (Trainline): 2–4% of ticket price
 *   Activities (GetYourGuide): 8% of ticket price
 *   Car rental (Rentalcars): 5–8% of rental cost
 */

// ── AFFILIATE IDS ─────────────────────────────────────────────────────────────
// Replace with real IDs after signing up to each program
const AFFILIATE_IDS = {
  booking:      process.env.BOOKING_AFFILIATE_ID    || 'ROAM_BOOKING_ID',
  trainline:    process.env.TRAINLINE_AFFILIATE_ID  || 'ROAM_TRAINLINE_ID',
  getyourguide: process.env.GYG_AFFILIATE_ID        || 'ROAM_GYG_ID',
  rentalcars:   process.env.RENTALCARS_AFFILIATE_ID || 'ROAM_RENTALCARS_ID',
};

// ── HOTEL LINKS ───────────────────────────────────────────────────────────────

/**
 * Generate a Booking.com affiliate deep-link for a hotel.
 * Pre-fills: destination, check-in, check-out, number of adults.
 */
export function hotelLink({ city, checkin, checkout, travelers = 2, hotelName = '' }) {
  const params = new URLSearchParams({
    ss:            city || '',
    checkin_year:  checkin ? checkin.slice(0, 4) : '',
    checkin_month: checkin ? String(parseInt(checkin.slice(5, 7))) : '',
    checkin_day:   checkin ? String(parseInt(checkin.slice(8, 10))) : '',
    checkout_year:  checkout ? checkout.slice(0, 4) : '',
    checkout_month: checkout ? String(parseInt(checkout.slice(5, 7))) : '',
    checkout_day:   checkout ? String(parseInt(checkout.slice(8, 10))) : '',
    group_adults:  String(travelers),
    no_rooms:      '1',
    aid:           AFFILIATE_IDS.booking,
    label:         'roam-ai-trip',
  });

  // If we have a specific hotel name, add it as search term
  if (hotelName) params.set('ss', `${hotelName} ${city}`);

  return `https://www.booking.com/search.html?${params.toString()}`;
}

// ── TRAIN LINKS ───────────────────────────────────────────────────────────────

/**
 * Generate a Trainline affiliate deep-link.
 * Pre-fills: origin, destination, date, time, passengers.
 */
export function trainLink({ from, to, date, time = '09:00', travelers = 2, country = 'gb' }) {
  // Trainline URL format
  const params = new URLSearchParams({
    origin:      from || '',
    destination: to   || '',
    outwardDate: date ? `${date}T${time}:00` : '',
    adults:      String(travelers),
    affiliateCode: AFFILIATE_IDS.trainline,
  });
  return `https://www.trainline.com/search?${params.toString()}`;
}

/**
 * Generate a Trenitalia link (Italian trains).
 * Trainline handles Trenitalia, but direct link for Italy.
 */
export function trenitaliaPrefilled({ from, to, date, travelers = 2 }) {
  // Trenitalia doesn't have a clean deep-link API, use Trainline as aggregator
  return trainLink({ from, to, date, travelers });
}

/**
 * Generate an SBB (Swiss trains) link.
 */
export function sbbLink({ from, to, date, time = '09:00', travelers = 2 }) {
  const params = new URLSearchParams({
    from,
    to,
    date:      date || '',
    time,
    adults:    String(travelers),
    lang:      'en',
  });
  // SBB doesn't have public affiliate program — use direct booking link
  return `https://www.sbb.ch/en/buying/pages/fahrplan/fahrplan.xhtml?${params.toString()}`;
}

// ── ACTIVITY LINKS ────────────────────────────────────────────────────────────

/**
 * Generate a GetYourGuide affiliate search link.
 * Pre-fills: city, date.
 */
export function activityLink({ city, date, activityName = '' }) {
  const slug = city.toLowerCase().replace(/\s+/g, '-');
  const params = new URLSearchParams({
    q:    activityName || city,
    date: date || '',
    partner_id: AFFILIATE_IDS.getyourguide,
    cmp:        'roam-ai',
  });
  return `https://www.getyourguide.com/${slug}-l?${params.toString()}`;
}

// ── CAR RENTAL LINKS ──────────────────────────────────────────────────────────

/**
 * Generate a Rentalcars.com affiliate link.
 * Pre-fills: pickup city, dropoff city, dates, age.
 */
export function carRentalLink({ pickupCity, dropoffCity, pickupDate, dropoffDate, driverAge = 28 }) {
  const params = new URLSearchParams({
    addrFrom:     pickupCity  || '',
    addrTo:       dropoffCity || pickupCity || '',
    puDay:        pickupDate  ? String(parseInt(pickupDate.slice(8, 10))) : '',
    puMonth:      pickupDate  ? String(parseInt(pickupDate.slice(5, 7))) : '',
    puYear:       pickupDate  ? pickupDate.slice(0, 4) : '',
    doDay:        dropoffDate ? String(parseInt(dropoffDate.slice(8, 10))) : '',
    doMonth:      dropoffDate ? String(parseInt(dropoffDate.slice(5, 7))) : '',
    doYear:       dropoffDate ? dropoffDate.slice(0, 4) : '',
    drv1Age:      String(driverAge),
    affiliateCode: AFFILIATE_IDS.rentalcars,
  });
  return `https://www.rentalcars.com/SearchResults.do?${params.toString()}`;
}

// ── FLIGHT LINKS ──────────────────────────────────────────────────────────────

/**
 * Generate a Google Flights link (no affiliate — use for price discovery).
 * Affiliate flights via Skyscanner if needed later.
 */
export function flightLink({ from, to, date, returnDate = '', travelers = 2 }) {
  // Google Flights deep link
  const trip = returnDate
    ? `${from}/${to}/${date}/${returnDate}`
    : `${from}/${to}/${date}`;
  return `https://www.google.com/flights#flt=${trip};c:USD;e:1;s:0;sd:1;t:f;px:${travelers}`;
}

// ── MASTER ENRICHER ───────────────────────────────────────────────────────────

/**
 * Enrich a trip-state.json with affiliate booking URLs.
 * Adds `bookUrl` to hotels, `bookingUrl` to urgent items, and 
 * `affiliateUrl` to tickets.
 *
 * @param {object} state - Full trip-state object
 * @param {number} travelers - Number of travelers
 * @returns {object} Enriched state
 */
export function enrichWithAffiliateLinks(state, travelers = 2) {
  const plan = state.rawPlan;
  if (!plan) return state;

  // Enrich hotels
  if (plan.hotels) {
    plan.hotels = plan.hotels.map(hotel => ({
      ...hotel,
      bookUrl: hotel.bookUrl || hotelLink({
        city:      hotel.city,
        checkin:   hotel.checkin,
        checkout:  hotel.checkout,
        travelers,
        hotelName: hotel.name,
      }),
    }));
  }

  // Enrich urgent items with booking URLs
  if (plan.urgent) {
    plan.urgent = plan.urgent.map(item => {
      if (item.url) return item; // already has URL

      const label = (item.label || '').toLowerCase();

      if (label.includes('hotel') || label.includes('accommodation')) {
        // Extract city from label if possible
        const city = label.split(' in ')[1] || label.split(' for ')[1] || '';
        return { ...item, url: hotelLink({ city, checkin: '', checkout: '', travelers }) };
      }

      if (label.includes('train') || label.includes('frecciarossa') || label.includes('trenitalia')) {
        const parts = label.match(/([a-z\s]+)\s*→\s*([a-z\s]+)/);
        if (parts) return { ...item, url: trainLink({ from: parts[1].trim(), to: parts[2].trim(), date: '', travelers }) };
        return { ...item, url: 'https://www.trainline.com' };
      }

      if (label.includes('ticket') || label.includes('museum') || label.includes('colosseum') || label.includes('uffizi')) {
        const city = label.includes('rome') || label.includes('colosseum') ? 'Rome'
                   : label.includes('florence') || label.includes('uffizi') ? 'Florence'
                   : label.includes('venice') ? 'Venice' : '';
        return { ...item, url: activityLink({ city, activityName: item.label }) };
      }

      if (label.includes('car') || label.includes('rental')) {
        return { ...item, url: carRentalLink({ pickupCity: '', dropoffCity: '' }) };
      }

      return item;
    });
  }

  // Enrich tickets with affiliate URLs where possible
  if (plan.tickets) {
    plan.tickets = plan.tickets.map(ticket => {
      if (!ticket.legs || ticket.passengers?.some(p => p.pdfUrl)) return ticket;

      const legs = ticket.legs;
      const firstLeg = legs[0];
      const lastLeg  = legs[legs.length - 1];

      // Train ticket
      if (/train|frecciarossa|EC |IR |IC |RE /i.test(ticket.name || '')) {
        const affiliateUrl = trainLink({
          from:     firstLeg?.from || '',
          to:       lastLeg?.to || '',
          date:     ticket.date || '',
          travelers,
        });
        return { ...ticket, affiliateUrl };
      }

      return ticket;
    });
  }

  return { ...state, rawPlan: plan };
}

// ── AFFILIATE SIGNUP URLS ─────────────────────────────────────────────────────
export const AFFILIATE_PROGRAMS = {
  booking:      'https://www.booking.com/affiliateprogram/index.html',
  trainline:    'https://www.thetrainline.com/affiliates',
  getyourguide: 'https://partner.getyourguide.com/',
  rentalcars:   'https://www.rentalcars.com/affiliates/',
  skyscanner:   'https://www.partners.skyscanner.net/',
};
