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
  rentalcars:   process.env.ROAM_RENTALCARS_ID || process.env.RENTALCARS_AFFILIATE_ID || 'ROAM_RENTALCARS_ID',
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

  const lower = (v) => String(v || '').toLowerCase();
  const hasAffiliateParams = (url) => {
    const u = String(url || '').toLowerCase();
    return (
      (u.includes('booking.com') && u.includes('aid=')) ||
      (u.includes('trainline.com') && u.includes('affiliateid=')) ||
      (u.includes('getyourguide.com') && u.includes('partner_id=')) ||
      (u.includes('rentalcars.com') && u.includes('affiliatecode='))
    );
  };

  const inferCity = (text) => {
    const t = lower(text);
    if (t.includes('rome') || t.includes('colosseum') || t.includes('vatican')) return 'Rome';
    if (t.includes('florence') || t.includes('uffizi') || t.includes('accademia')) return 'Florence';
    if (t.includes('venice')) return 'Venice';
    if (t.includes('naples') || t.includes('amalfi') || t.includes('positano')) return 'Naples';
    if (t.includes('milan')) return 'Milan';
    if (t.includes('london')) return 'London';
    return '';
  };

  if (plan.hotels) {
    plan.hotels = plan.hotels.map((hotel) => {
      const affiliateUrl = hotelLink({
        city: hotel.city,
        checkin: hotel.checkin,
        checkout: hotel.checkout,
        travelers,
        hotelName: hotel.name,
      });
      const existing = hotel.bookUrl || '';
      if (!existing || !hasAffiliateParams(existing)) {
        return { ...hotel, sourceUrl: existing || undefined, bookUrl: affiliateUrl };
      }
      return { ...hotel, bookUrl: existing };
    });
  }

  if (plan.urgent) {
    plan.urgent = plan.urgent.map((item) => {
      const label = lower(item.label);
      const url = lower(item.url);

      const isHotel = label.includes('hotel') || label.includes('accommodation') || label.includes('stay') || /booking\.com|agoda\.com|hotels?\./.test(url);
      const isTrain = label.includes('train') || label.includes('frecciarossa') || label.includes('trenitalia') || label.includes('rail') || /trainline\.com|trenitalia\.com|sbb\.ch|eurostar\.com/.test(url);
      const isActivity = label.includes('ticket') || label.includes('museum') || label.includes('attraction') || label.includes('tour') || label.includes('colosseum') || label.includes('vatican') || label.includes('uffizi') || label.includes('accademia');
      const isCar = label.includes('car') || label.includes('rental') || label.includes('drive') || /rentalcars\.com|avis\.|hertz\./.test(url);

      let affiliateUrl = '';

      if (isHotel) {
        affiliateUrl = hotelLink({ city: inferCity(item.label || item.note), checkin: '', checkout: '', travelers });
      } else if (isTrain) {
        const parts = label.match(/([a-z\s]+)\s*→\s*([a-z\s]+)/);
        affiliateUrl = parts
          ? trainLink({ from: parts[1].trim(), to: parts[2].trim(), date: '', travelers })
          : trainLink({ from: '', to: '', date: '', travelers });
      } else if (isActivity) {
        affiliateUrl = activityLink({ city: inferCity(item.label || item.note), activityName: item.label || '' });
      } else if (isCar) {
        affiliateUrl = carRentalLink({ pickupCity: '', dropoffCity: '' });
      }

      if (!affiliateUrl) affiliateUrl = activityLink({ city: inferCity(item.label || item.note), activityName: item.label || '' });
      if (item.url && hasAffiliateParams(item.url)) return item;
      return { ...item, sourceUrl: item.url || undefined, url: affiliateUrl };
    });
  }

  if (plan.tickets) {
    plan.tickets = plan.tickets.map((ticket) => {
      if (!ticket.legs || ticket.passengers?.some((p) => p.pdfUrl)) return ticket;
      const legs = ticket.legs;
      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];

      if (/train|frecciarossa|EC |IR |IC |RE /i.test(ticket.name || '')) {
        const affiliateUrl = trainLink({
          from: firstLeg?.from || '',
          to: lastLeg?.to || '',
          date: ticket.date || '',
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
