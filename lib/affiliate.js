/**
 * Affiliate URL generator — Level 1 booking
 *
 * Generates pre-filled booking URLs with affiliate tracking.
 * User lands on partner site with dates/details pre-filled → just pays.
 * We earn commission on completed bookings.
 *
 * Revenue per booking (approx):
 *   Hotels (Booking.com via Awin): 4–6% of room cost
 *   Trains (Trainline): 2–4% of ticket price
 *   Activities (GetYourGuide): 8% of ticket price
 *   Car rental (Rentalcars): 5–8% of rental cost
 */

// ── CONFIG ─────────────────────────────────────────────────────────────────
const AWIN = {
  publisherId: process.env.AWIN_PUBLISHER_ID  || '2877223',   // Alex's Awin Publisher ID
  accessToken: process.env.AWIN_ACCESS_TOKEN  || 'c10d4218-fdce-4189-b4a0-8c7c9c344fbe',
  baseUrl:     'https://api.awin.com',
  // Well-known advertiser IDs
  advertisers: {
    booking:      12543,   // Booking.com
    trainline:    2511,    // Trainline
    getyourguide: 16148,   // GetYourGuide
    rentalcars:   8340,    // Rentalcars
  },
};

// ── AWIN LINK BUILDER ──────────────────────────────────────────────────────

/**
 * Create a tracking link via Awin's Link Builder API.
 * Returns the Awin redirect URL with embedded publisher + advertiser IDs.
 * Falls back to the destination URL if the API call fails.
 */
async function createAwinLink(destinationUrl, advertiserId) {
  try {
    const res = await fetch(
      `${AWIN.baseUrl}/publishers/${AWIN.publisherId}/linkbuilder/generate`,
      {
        method: 'POST',
        headers: {
          'Authorization':        `Bearer ${AWIN.accessToken}`,
          'Content-Type':         'application/json',
          'Accept':              'application/json',
        },
        body: JSON.stringify({
          advertiserId:   advertiserId,
          destinationUrl: destinationUrl,
          shorten:        false,
        }),
      }
    );
    if (!res.ok) {
      console.warn(`[Awin] Link Builder failed: ${res.status} ${res.statusText}`);
      return destinationUrl;
    }
    const data = await res.json();
    return data.url || destinationUrl;
  } catch (err) {
    console.warn(`[Awin] Link Builder error: ${err.message}`);
    return destinationUrl;
  }
}

// ── BOOKING.COM ────────────────────────────────────────────────────────────

/**
 * Build a pre-filled Booking.com search URL (no tracking params yet).
 */
function bookingSearchUrl({ city, checkin, checkout, travelers = 2, hotelName = '' }) {
  const params = new URLSearchParams({
    ss:             city || '',
    checkin_year:   checkin ? checkin.slice(0, 4) : '',
    checkin_month:  checkin ? String(parseInt(checkin.slice(5, 7))) : '',
    checkin_day:    checkin ? String(parseInt(checkin.slice(8, 10))) : '',
    checkout_year:   checkout ? checkout.slice(0, 4) : '',
    checkout_month:  checkout ? String(parseInt(checkout.slice(5, 7))) : '',
    checkout_day:    checkout ? String(parseInt(checkout.slice(8, 10))) : '',
    group_adults:   String(travelers),
    no_rooms:       '1',
  });
  if (hotelName) params.set('ss', `${hotelName} ${city}`);
  return `https://www.booking.com/search.html?${params.toString()}`;
}

/**
 * Async wrapper: Booking.com search URL wrapped in Awin tracking link.
 */
export async function hotelLink({ city, checkin, checkout, travelers = 2, hotelName = '' }) {
  const dest = bookingSearchUrl({ city, checkin, checkout, travelers, hotelName });
  return createAwinLink(dest, AWIN.advertisers.booking);
}

/**
 * Sync wrapper — uses old ?aid= approach as fallback when Awin API is unavailable.
 */
export function hotelLinkSync({ city, checkin, checkout, travelers = 2, hotelName = '' }) {
  const dest = bookingSearchUrl({ city, checkin, checkout, travelers, hotelName });
  // Old approach: embed aid as query param (still works for Booking.com)
  return dest + `&aid=${AWIN.publisherId}&label=tripva`;
}

// ── TRAIN LINKS ──────────────────────────────────────────────────────────────

export function trainLink({ from, to, date, time = '09:00', travelers = 2 }) {
  const params = new URLSearchParams({
    origin:       from || '',
    destination:  to   || '',
    outwardDate:  date ? `${date}T${time}:00` : '',
    adults:       String(travelers),
    affiliateId:  AWIN.advertisers.trainline,
  });
  return `https://www.trainline.com/search?${params.toString()}`;
}

export function trenitaliaPrefilled({ from, to, date, travelers = 2 }) {
  return trainLink({ from, to, date, travelers });
}

export function sbbLink({ from, to, date, time = '09:00', travelers = 2 }) {
  const params = new URLSearchParams({ from, to, date: date || '', time, adults: String(travelers), lang: 'en' });
  return `https://www.sbb.ch/en/buying/pages/fahrplan/fahrplan.xhtml?${params.toString()}`;
}

// ── ACTIVITY LINKS ──────────────────────────────────────────────────────────

export function activityLink({ city, date, activityName = '' }) {
  const slug = city.toLowerCase().replace(/\s+/g, '-');
  const params = new URLSearchParams({
    q:          activityName || city,
    date:       date || '',
    partner_id: AWIN.advertisers.getyourguide,
    cmp:        'tripva',
  });
  return `https://www.getyourguide.com/${slug}-l?${params.toString()}`;
}

// ── CAR RENTAL LINKS ────────────────────────────────────────────────────────

export function carRentalLink({ pickupCity, dropoffCity, pickupDate, dropoffDate, driverAge = 28 }) {
  const params = new URLSearchParams({
    addrFrom:       pickupCity  || '',
    addrTo:         dropoffCity || pickupCity || '',
    puDay:          pickupDate  ? String(parseInt(pickupDate.slice(8, 10))) : '',
    puMonth:        pickupDate  ? String(parseInt(pickupDate.slice(5, 7)))  : '',
    puYear:         pickupDate  ? pickupDate.slice(0, 4) : '',
    doDay:          dropoffDate ? String(parseInt(dropoffDate.slice(8, 10))) : '',
    doMonth:        dropoffDate ? String(parseInt(dropoffDate.slice(5, 7)))  : '',
    doYear:         dropoffDate ? dropoffDate.slice(0, 4) : '',
    drv1Age:        String(driverAge),
    affiliateCode:  AWIN.publisherId,
  });
  return `https://www.rentalcars.com/SearchResults.do?${params.toString()}`;
}

// ── FLIGHT LINKS ────────────────────────────────────────────────────────────

export function flightLink({ from, to, date, returnDate = '', travelers = 2 }) {
  const trip = returnDate
    ? `${from}/${to}/${date}/${returnDate}`
    : `${from}/${to}/${date}`;
  return `https://www.google.com/flights#flt=${trip};c:USD;e:1;s:0;sd:1;t:f;px:${travelers}`;
}

// ── MASTER ENRICHER ─────────────────────────────────────────────────────────

export async function enrichWithAffiliateLinksAsync(state, travelers = 2) {
  const plan = state.rawPlan;
  if (!plan) return state;

  const lower = (v) => String(v || '').toLowerCase();

  const inferCity = (text) => {
    const t = lower(text);
    if (t.includes('rome') || t.includes('colosseum') || t.includes('vatican')) return 'Rome';
    if (t.includes('florence') || t.includes('uffizi') || t.includes('accademia')) return 'Florence';
    if (t.includes('venice')) return 'Venice';
    if (t.includes('naples') || t.includes('amalfi') || t.includes('positano')) return 'Naples';
    if (t.includes('milan')) return 'Milan';
    if (t.includes('london')) return 'London';
    if (t.includes('paris')) return 'Paris';
    if (t.includes('maldive')) return 'Maldives';
    if (t.includes('bali')) return 'Bali';
    if (t.includes('tokyo')) return 'Tokyo';
    if (t.includes('barcelona')) return 'Barcelona';
    if (t.includes('swiss') || t.includes('zurich') || t.includes('lucerne')) return 'Switzerland';
    return '';
  };

  // Hotels — use Awin API
  if (plan.hotels && plan.hotels.length > 0) {
    const updated = await Promise.all(
      plan.hotels.map(async (hotel) => {
        const dest = bookingSearchUrl({
          city:      hotel.city,
          checkin:   hotel.checkin,
          checkout:  hotel.checkout,
          travelers,
          hotelName: hotel.name,
        });
        const bookUrl = await createAwinLink(dest, AWIN.advertisers.booking);
        const existing = hotel.bookUrl || '';
        return { ...hotel, sourceUrl: existing || undefined, bookUrl };
      })
    );
    plan.hotels = updated;
  }

  // Urgent items
  if (plan.urgent && plan.urgent.length > 0) {
    const updated = await Promise.all(
      plan.urgent.map(async (item) => {
        const label = lower(item.label);
        const url   = lower(item.url);

        const isHotel     = label.includes('hotel') || label.includes('accommodation') || label.includes('stay') || /booking\.com|agoda\.com|hotels?\./.test(url);
        const isTrain     = label.includes('train') || label.includes('frecciarossa') || label.includes('trenitalia') || label.includes('rail') || /trainline\.com|trenitalia\.com|sbb\.ch|eurostar\.com/.test(url);
        const isActivity  = label.includes('ticket') || label.includes('museum') || label.includes('attraction') || label.includes('tour') || /colosseum|vatican|uffizi|accademia/.test(label);
        const isCar       = label.includes('car') || label.includes('rental') || label.includes('drive') || /rentalcars\.com|avis\.|hertz\./.test(url);

        let dest = '';
        if (isHotel) {
          dest = bookingSearchUrl({ city: inferCity(item.label || item.note), travelers });
        } else if (isTrain) {
          const parts = label.match(/([a-z\s]+)\s*→\s*([a-z\s]+)/);
          dest = parts
            ? trainLink({ from: parts[1].trim(), to: parts[2].trim(), travelers })
            : trainLink({ travelers });
        } else if (isActivity) {
          dest = activityLink({ city: inferCity(item.label || item.note), activityName: item.label });
        } else if (isCar) {
          dest = carRentalLink({});
        } else {
          dest = activityLink({ city: inferCity(item.label || item.note), activityName: item.label });
        }

        const existing = item.url || '';
        if (existing && /awin1\.com|awin\. Tracks /.test(existing)) return item;
        if (existing && !dest) return item;

        const trackedUrl = await createAwinLink(dest, isHotel ? AWIN.advertisers.booking : AWIN.advertisers.getyourguide);
        return { ...item, sourceUrl: existing || undefined, url: trackedUrl };
      })
    );
    plan.urgent = updated;
  }

  // Tickets
  if (plan.tickets && plan.tickets.length > 0) {
    const updated = await Promise.all(
      plan.tickets.map(async (ticket) => {
        if (!ticket.legs || ticket.passengers?.some((p) => p.pdfUrl)) return ticket;
        const firstLeg = ticket.legs[0];
        const lastLeg  = ticket.legs[ticket.legs.length - 1];
        if (/train|frecciarossa|EC |IR |IC |RE /i.test(ticket.name || '')) {
          const dest = trainLink({ from: firstLeg?.from || '', to: lastLeg?.to || '', date: ticket.date || '', travelers });
          const trackedUrl = await createAwinLink(dest, AWIN.advertisers.trainline);
          return { ...ticket, affiliateUrl: trackedUrl };
        }
        return ticket;
      })
    );
    plan.tickets = updated;
  }

  return { ...state, rawPlan: plan };
}

/**
 * Sync (legacy) enricher — used when async is not available.
 * Falls back to ?aid= approach for Booking.com.
 */
export function enrichWithAffiliateLinks(state, travelers = 2) {
  const plan = state.rawPlan;
  if (!plan) return state;

  const lower = (v) => String(v || '').toLowerCase();

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
      const bookUrl = hotelLinkSync({ city: hotel.city, checkin: hotel.checkin, checkout: hotel.checkout, travelers, hotelName: hotel.name });
      const existing = hotel.bookUrl || '';
      return { ...hotel, sourceUrl: existing || undefined, bookUrl };
    });
  }

  if (plan.urgent) {
    plan.urgent = plan.urgent.map((item) => {
      const label = lower(item.label);
      const url   = lower(item.url);
      const isHotel    = label.includes('hotel') || label.includes('accommodation') || label.includes('stay') || /booking\.com|agoda\.com|hotels?\./.test(url);
      const isTrain    = label.includes('train') || label.includes('frecciarossa') || label.includes('trenitalia') || label.includes('rail') || /trainline\.com|trenitalia\.com|sbb\.ch|eurostar\.com/.test(url);
      const isActivity = label.includes('ticket') || label.includes('museum') || label.includes('attraction') || label.includes('tour') || /colosseum|vatican|uffizi|accademia/.test(label);
      const isCar      = label.includes('car') || label.includes('rental') || label.includes('drive') || /rentalcars\.com|avis\.|hertz\./.test(url);

      let affiliateUrl = '';
      if (isHotel) {
        affiliateUrl = hotelLinkSync({ city: inferCity(item.label || item.note), travelers });
      } else if (isTrain) {
        const parts = label.match(/([a-z\s]+)\s*→\s*([a-z\s]+)/);
        affiliateUrl = parts
          ? trainLink({ from: parts[1].trim(), to: parts[2].trim(), travelers })
          : trainLink({ travelers });
      } else if (isActivity) {
        affiliateUrl = activityLink({ city: inferCity(item.label || item.note), activityName: item.label });
      } else if (isCar) {
        affiliateUrl = carRentalLink({});
      } else {
        affiliateUrl = activityLink({ city: inferCity(item.label || item.note), activityName: item.label });
      }
      const existing = item.url || '';
      if (existing && /awin1\.com/.test(existing)) return item;
      return { ...item, sourceUrl: existing || undefined, url: affiliateUrl };
    });
  }

  if (plan.tickets) {
    plan.tickets = plan.tickets.map((ticket) => {
      if (!ticket.legs || ticket.passengers?.some((p) => p.pdfUrl)) return ticket;
      const firstLeg = ticket.legs[0];
      const lastLeg  = ticket.legs[ticket.legs.length - 1];
      if (/train|frecciarossa|EC |IR |IC |RE /i.test(ticket.name || '')) {
        const affiliateUrl = trainLink({ from: firstLeg?.from || '', to: lastLeg?.to || '', date: ticket.date || '', travelers });
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
