/**
 * Affiliate URL generator — Travelpayouts only (marker 529721)
 *
 * All links use TP's marker parameter for attribution.
 * Hotels → Hotellook (TP-native, best tracking)
 * Activities → GetYourGuide (partner_id=529721)
 * Trains → Rail.ninja / 12Go Asia
 * Cars → Discovercars
 */

const TP_MARKER = '529721';

const GYG_PARTNER_ID = process.env.GYG_PARTNER_ID || TP_MARKER;
const KLOOK_AID      = process.env.KLOOK_AID || '';

// ── HOTEL LINKS ─────────────────────────────────────────────────────────────

export function hotellookUrl({ city, checkin, checkout, adults = 2 }) {
  const p = new URLSearchParams({ destination: city || '', adults: String(adults), rooms: '1', marker: TP_MARKER });
  if (checkin)  p.set('checkIn', checkin);
  if (checkout) p.set('checkOut', checkout);
  return 'https://www.hotellook.com/hotels?' + p.toString();
}


// ── ACTIVITY LINKS ───────────────────────────────────────────────────────────

export function gygUrl({ city, activityName = '', date = '' }) {
  const p = new URLSearchParams({ q: activityName || city || '', partner_id: GYG_PARTNER_ID });
  if (date) p.set('date', date);
  return 'https://www.getyourguide.com/s/?' + p.toString();
}

const KLOOK_REGIONS = ['thailand','bali','indonesia','singapore','malaysia','vietnam','cambodia','japan','korea','taiwan','hong kong','philippines','sri lanka','nepal','india','maldives','myanmar'];

export function activityLinkForDestination({ destination, activityName = '', date = '' }) {
  const d = (destination || '').toLowerCase();
  if (KLOOK_AID && KLOOK_REGIONS.some(r => d.includes(r))) {
    const p = new URLSearchParams({ query: activityName || destination, aid: KLOOK_AID });
    return 'https://www.klook.com/en-US/search/?' + p.toString();
  }
  return gygUrl({ city: destination, activityName, date });
}

// ── FLIGHT LINKS (legacy exports — kept for test compatibility) ──────────────

export function flightLink({ from = '', to = '', date = '', returnDate = '', travelers = 2 }) {
  const affiliateId = process.env.KIWI_AFFILIATE_ID || '';
  const p = new URLSearchParams({ flyFrom: from, to, dateFrom: date, adults: String(travelers) });
  if (returnDate) p.set('dateTo', returnDate);
  if (affiliateId) p.set('shmarker', affiliateId);
  return 'https://www.kiwi.com/en/search/results?' + p.toString();
}

export function tripcomFlightLink({ from = '', to = '', date = '', travelers = 2 }) {
  const allianceCode = process.env.TRIPCOM_ALLIANCE_CODE || '';
  const p = new URLSearchParams({ dcity: from, acity: to, ddate: date, adult: String(travelers) });
  if (allianceCode) p.set('alliancecode', allianceCode);
  return 'https://www.trip.com/flights/?' + p.toString();
}

// ── TRAIN LINKS ──────────────────────────────────────────────────────────────

export function railNinjaUrl({ from = '', to = '', date = '' }) {
  const p = new URLSearchParams({ from, to, marker: TP_MARKER });
  if (date) p.set('date', date);
  return 'https://rail.ninja/?' + p.toString();
}

export function go12Url({ from = '', to = '', date = '' }) {
  const p = new URLSearchParams({ from, to, aff_id: TP_MARKER });
  if (date) p.set('date', date);
  return 'https://12go.asia/en?' + p.toString();
}

// ── CAR RENTAL ───────────────────────────────────────────────────────────────

export function discovercarsUrl({ city = '', pickupDate = '', dropoffDate = '' }) {
  const p = new URLSearchParams({ a_aid: TP_MARKER });
  if (city)       p.set('location', city);
  if (pickupDate) p.set('pickup_date', pickupDate);
  if (dropoffDate) p.set('dropoff_date', dropoffDate);
  return 'https://www.discovercars.com/all?' + p.toString();
}

// ── CITY INFERENCE (for urgent items) ────────────────────────────────────────

const CITY_MAP = [
  [['rome','colosseum','vatican'], 'Rome'],
  [['florence','uffizi','accademia'], 'Florence'],
  [['venice'], 'Venice'],
  [['naples','amalfi','positano'], 'Naples'],
  [['milan'], 'Milan'],
  [['london'], 'London'],
  [['paris'], 'Paris'],
  [['amsterdam'], 'Amsterdam'],
  [['berlin'], 'Berlin'],
  [['madrid'], 'Madrid'],
  [['lisbon','porto'], 'Lisbon'],
  [['prague'], 'Prague'],
  [['vienna'], 'Vienna'],
  [['dubrovnik','croatia'], 'Dubrovnik'],
  [['santorini','mykonos','athens','greece'], 'Athens'],
  [['new york','manhattan'], 'New York'],
  [['los angeles','hollywood'], 'Los Angeles'],
  [['bangkok','chao phraya'], 'Bangkok'],
  [['phuket','phi phi','krabi'], 'Phuket'],
  [['chiang mai'], 'Chiang Mai'],
  [['singapore'], 'Singapore'],
  [['kuala lumpur',' kl ','petronas'], 'Kuala Lumpur'],
  [['bali','ubud','seminyak','canggu'], 'Bali'],
  [['tokyo','shibuya','shinjuku','asakusa'], 'Tokyo'],
  [['kyoto','fushimi','arashiyama'], 'Kyoto'],
  [['osaka','dotonbori'], 'Osaka'],
  [['seoul','myeongdong','gangnam'], 'Seoul'],
  [['barcelona','sagrada'], 'Barcelona'],
  [['dubai','burj khalifa'], 'Dubai'],
  [['istanbul','hagia sophia'], 'Istanbul'],
  [['sydney','opera house','bondi'], 'Sydney'],
  [['melbourne'], 'Melbourne'],
];

function inferCity(text) {
  const t = String(text || '').toLowerCase();
  for (const [keys, city] of CITY_MAP) {
    if (keys.some(k => t.includes(k))) return city;
  }
  return '';
}

// ── MASTER ENRICHER ──────────────────────────────────────────────────────────

function enrichPlan(state, travelers = 2) {
  const plan = state.rawPlan;
  if (!plan) return state;

  // Hotels → Hotellook
  if (plan.hotels && plan.hotels.length > 0) {
    plan.hotels = plan.hotels.map(h => ({
      ...h,
      bookUrl: hotellookUrl({ city: h.city, checkin: h.checkin, checkout: h.checkout, adults: travelers }),
    }));
  }

  // Urgent items
  if (plan.urgent && plan.urgent.length > 0) {
    plan.urgent = plan.urgent.map(item => {
      const label = String(item.label || '').toLowerCase();
      const url   = String(item.url   || '').toLowerCase();
      const isHotel    = label.includes('hotel') || label.includes('accommodation') || label.includes('stay') || /booking\.com|agoda\.com/.test(url);
      const isTrain    = label.includes('train') || label.includes('rail') || /trainline|trenitalia|eurostar/.test(url);
      const isCar      = label.includes('car') || label.includes('rental') || /rentalcars|avis|hertz/.test(url);

      const city = inferCity(item.label + ' ' + (item.note || ''));
      let affiliateUrl = '';
      if (isHotel)         affiliateUrl = hotellookUrl({ city, adults: travelers });
      else if (isTrain)    affiliateUrl = railNinjaUrl({});
      else if (isCar)      affiliateUrl = discovercarsUrl({ city });
      else                 affiliateUrl = gygUrl({ city, activityName: item.label });

      if (!affiliateUrl || (item.url && /tp\.media|marker=/.test(item.url))) return item;
      return { ...item, url: affiliateUrl };
    });
  }

  // Tickets (train/bus) → Rail Ninja / 12Go
  if (plan.tickets && plan.tickets.length > 0) {
    const tripDest = (plan.trip?.destination || '').toLowerCase();
    const useAsia = KLOOK_REGIONS.some(r => tripDest.includes(r));
    plan.tickets = plan.tickets.map(t => {
      if (t.bookUrl && /marker=|aff_id=/.test(t.bookUrl)) return t;
      const linkFn = useAsia ? go12Url : railNinjaUrl;
      return { ...t, bookUrl: linkFn({ from: t.from || '', to: t.to || '', date: t.date || '' }) };
    });
  }

  // Timeline activities + transport
  if (plan.days && plan.days.length > 0) {
    const tripDest = plan.trip?.destination || '';
    const destLower = tripDest.toLowerCase();
    const useAsia = KLOOK_REGIONS.some(r => destLower.includes(r));
    plan.days = plan.days.map(day => {
      if (!day.timeline) return day;
      return {
        ...day,
        timeline: day.timeline.map(tl => {
          if (tl.bookUrl) return tl;
          if (tl.type === 'transport') {
            const linkFn = useAsia ? go12Url : railNinjaUrl;
            return { ...tl, bookUrl: linkFn({ from: tl.from || '', to: tl.to || '', date: day.date || '' }) };
          }
          if (tl.type === 'activity') {
            return { ...tl, bookUrl: activityLinkForDestination({ destination: tripDest, activityName: tl.title }) };
          }
          return tl;
        }),
      };
    });
  }

  return { ...state, rawPlan: plan };
}

export async function enrichWithAffiliateLinksAsync(state, travelers = 2) {
  return enrichPlan(state, travelers);
}

export function enrichWithAffiliateLinks(state, travelers = 2) {
  return enrichPlan(state, travelers);
}
