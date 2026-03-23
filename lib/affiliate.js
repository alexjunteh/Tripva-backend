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
const AFFILIATE_IDS = {
  booking:      process.env.ROAM_BOOKING_ID      || 'ROAM_BOOKING_ID',
  trainline:    process.env.ROAM_TRAINLINE_ID    || 'ROAM_TRAINLINE_ID',
  getyourguide: process.env.ROAM_GYG_ID          || 'ROAM_GYG_ID',
  rentalcars:   process.env.RENTALCARS_AFFILIATE_ID || 'ROAM_RENTALCARS_ID',
};

// ── HOTEL LINKS ───────────────────────────────────────────────────────────────

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

  if (hotelName) params.set('ss', `${hotelName} ${city}`);

  return `https://www.booking.com/search.html?${params.toString()}`;
}

// ── TRAIN LINKS ───────────────────────────────────────────────────────────────

export function trainLink({ from, to, date, time = '09:00', travelers = 2, country = 'gb' }) {
  const params = new URLSearchParams({
    origin:      from || '',
    destination: to   || '',
    outwardDate: date ? `${date}T${time}:00` : '',
    adults:      String(travelers),
    affiliateId: AFFILIATE_IDS.trainline,
  });
  return `https://www.trainline.com/search?${params.toString()}`;
}

export function trenitaliaPrefilled({ from, to, date, travelers = 2 }) {
  return trainLink({ from, to, date, travelers });
}

export function sbbLink({ from, to, date, time = '09:00', travelers = 2 }) {
  const params = new URLSearchParams({
    from,
    to,
    date:      date || '',
    time,
    adults:    String(travelers),
    lang:      'en',
  });
  return `https://www.sbb.ch/en/buying/pages/fahrplan/fahrplan.xhtml?${params.toString()}`;
}

// ── ACTIVITY LINKS ────────────────────────────────────────────────────────────

export function activityLink({ city, date, activityName = '' }) {
  const slug = city.toLowerCase().replace(/\s+/g, '-');
  const params = new URLSearchParams({
    q:          activityName || city,
    date:       date || '',
    partner_id: AFFILIATE_IDS.getyourguide,
    cmp:        'roam-ai',
  });
  return `https://www.getyourguide.com/${slug}-l?${params.toString()}`;
}

// ── CAR RENTAL LINKS ──────────────────────────────────────────────────────────

export function carRentalLink({ pickupCity, dropoffCity, pickupDate, dropoffDate, driverAge = 28 }) {
  const params = new URLSearchParams({
    addrFrom:      pickupCity  || '',
    addrTo:        dropoffCity || pickupCity || '',
    puDay:         pickupDate  ? String(parseInt(pickupDate.slice(8, 10))) : '',
    puMonth:       pickupDate  ? String(parseInt(pickupDate.slice(5, 7))) : '',
    puYear:        pickupDate  ? pickupDate.slice(0, 4) : '',
    doDay:         dropoffDate ? String(parseInt(dropoffDate.slice(8, 10))) : '',
    doMonth:       dropoffDate ? String(parseInt(dropoffDate.slice(5, 7))) : '',
    doYear:        dropoffDate ? dropoffDate.slice(0, 4) : '',
    drv1Age:       String(driverAge),
    affiliateCode: AFFILIATE_IDS.rentalcars,
  });
  return `https://www.rentalcars.com/SearchResults.do?${params.toString()}`;
}

// ── FLIGHT LINKS ──────────────────────────────────────────────────────────────

export function flightLink({ from, to, date, returnDate = '', travelers = 2 }) {
  const trip = returnDate
    ? `${from}/${to}/${date}/${returnDate}`
    : `${from}/${to}/${date}`;
  return `https://www.google.com/flights#flt=${trip};c:USD;e:1;s:0;sd:1;t:f;px:${travelers}`;
}

// ── MASTER ENRICHER ───────────────────────────────────────────────────────────

export function enrichWithAffiliateLinks(state, travelers = 2) {
  const plan = state.rawPlan;
  if (!plan) return state;

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

  if (plan.urgent) {
    plan.urgent = plan.urgent.map(item => {
      if (item.url) return item;
      const label = (item.label || '').toLowerCase();

      if (label.includes('hotel') || label.includes('accommodation')) {
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

  if (plan.tickets) {
    plan.tickets = plan.tickets.map(ticket => {
      if (!ticket.legs || ticket.passengers?.some(p => p.pdfUrl)) return ticket;
      const legs = ticket.legs;
      const firstLeg = legs[0];
      const lastLeg  = legs[legs.length - 1];

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

export const AFFILIATE_PROGRAMS = {
  booking:      'https://www.booking.com/affiliateprogram/index.html',
  trainline:    'https://www.thetrainline.com/affiliates',
  getyourguide: 'https://partner.getyourguide.com/',
  rentalcars:   'https://www.rentalcars.com/affiliates/',
  skyscanner:   'https://www.partners.skyscanner.net/',
};
