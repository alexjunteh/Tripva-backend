/**
 * lib/places.js — Code-level enrichment engine
 *
 * Provides history / funFact / tip facts for known places, plus curated
 * GPS-verified photo spots per city.  Wire into any plan via enrichPlan().
 *
 * Design: pure keyword-matching (no AI, no network), so it's fast, free,
 * and works offline.  Add entries to PLACES_DB / CITY_PHOTOSPOTS to expand.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PLACES DATABASE  (keyword → facts)
// Keys are lowercase substrings that may appear in an activity title.
// ─────────────────────────────────────────────────────────────────────────────
export const PLACES_DB = {
  // ── Cinque Terre ────────────────────────────────────────────────────────────
  "riomaggiore": {
    history: "Riomaggiore is the oldest of the five villages, established in the 13th century. Its name derives from 'Rio Maggiore' (major stream). The steep colourful houses were built tall and narrow — wine cellars at the bottom, living quarters above.",
  },
  "via dell'amore": {
    history: "The Via dell'Amore (Path of Love) was built in the 1920s for workers commuting between Riomaggiore and Manarola. It collapsed in a landslide in 2012 and only fully reopened in 2024 after €23 million in restoration.",
  },
  "monterosso": {
    history: "Monterosso is the largest of the five villages and the only one with a proper sandy beach (Fegina). Its anchovy fishing tradition dates to the 13th century — DOP-protected and salt-cured for 12 months in terracotta jars.",
  },
  "manarola": {
    history: "Manarola has been continuously inhabited since 1338. The terraced vineyards were all built by hand — no machinery could reach them. The sweet Sciacchetrà wine produces only ~5,000 bottles per year.",
  },
  "vernazza": {
    history: "Vernazza is the only natural harbour in Cinque Terre. It was a key Genoese fleet base in the Middle Ages and the Torre Doria was built to watch for Saracen pirates.",
  },

  // ── Lake Como ────────────────────────────────────────────────────────────────
  "varenna": {
    history: "Varenna is built on a rocky promontory jutting into Lake Como. For centuries a fishing village, it fought a brutal war with Como over fishing rights. Today it's one of the quietest and most beautiful towns on the lake.",
  },
  "villa monastero": {
    history: "Villa Monastero was a Cistercian convent from 1208 until Napoleon suppressed it in 1805. Today it's one of Italy's most photographed lakeside gardens — 2km of botanical terraces descending to the water.",
  },
  "lake como": {
    funFact: "Lake Como is Italy's deepest lake at 425 metres. George Clooney has owned Villa Oleandra in Laglio since 2002. The town of Como produces 80% of Europe's silk.",
  },

  // ── Lucerne / Switzerland ────────────────────────────────────────────────────
  "chapel bridge": {
    history: "The Kapellbrücke (1365) is the oldest covered wooden bridge in Europe. 30 of its original 111 triangular roof paintings survived a fire in August 1993. The bridge was rebuilt within a year.",
  },
  "kapellbrücke": {
    history: "The Kapellbrücke (1365) is the oldest covered wooden bridge in Europe. 30 of its original 111 triangular roof paintings survived a fire in August 1993. The bridge was rebuilt within a year.",
  },
  "lion monument": {
    history: "The Lion Monument was carved into sandstone in 1820 to commemorate 786 Swiss Guards killed defending the Tuileries Palace in 1792. Mark Twain called it 'the most mournful and moving piece of stone in the world.'",
  },
  "mount pilatus": {
    history: "Mount Pilatus (2,132m) was named after Pontius Pilate — medieval legend said his ghost stirred up storms from a summit lake. Today it's home to the world's steepest cogwheel railway (48% gradient), built in 1889.",
  },
  "pilatus": {
    history: "Mount Pilatus (2,132m) was named after Pontius Pilate — medieval legend said his ghost stirred up storms from a summit lake. Today it's home to the world's steepest cogwheel railway (48% gradient), built in 1889.",
  },
  "lucerne": {
    history: "Lucerne grew around a chapel lit by a miraculous lamp — the name derives from 'Luciaria' (place of light). The medieval city walls still stand largely intact — nine towers from the 1400s.",
  },

  // ── Grindelwald / Bernese Oberland ───────────────────────────────────────────
  "grindelwald": {
    history: "Grindelwald sits directly beneath the Eiger's North Face, nicknamed 'Mordwand' (murder wall) after 8 climbers died attempting the first ascent. It was finally conquered in July 1938 after 3.5 days on the wall.",
  },
  "eiger": {
    history: "The Eiger North Face is 1,800m of near-vertical limestone — the highest cliff in the Alps. Eight climbers died attempting the first ascent between 1935-1938. The successful first ascent took 3.5 days.",
  },
  "jungfraujoch": {
    history: "Jungfraujoch (3,454m) has the highest railway station in Europe. The tunnel through the Eiger and Mönch took 16 years to build (1896-1912). Workers lived inside the mountain for years.",
  },

  // ── Florence ─────────────────────────────────────────────────────────────────
  "uffizi": {
    history: "The Uffizi was built in 1560 by Vasari as government offices for Cosimo I de' Medici (uffizi = offices). The Medici art collection was donated to Florence in 1737 on condition it could never leave the city.",
  },
  "ponte vecchio": {
    history: "The Ponte Vecchio has had shops since 1345 — originally butchers, then jewellers. During WWII it was the only Florence bridge not blown up by the retreating Germans — Hitler personally ordered it spared.",
  },
  "duomo": {
    history: "Brunelleschi's dome (1436) is still the largest masonry dome ever built — 45m wide, 91m tall. Brunelleschi invented his own double-shell technique and built it without external scaffolding.",
  },
  "david": {
    history: "Michelangelo's David (1504) was carved from a block of marble abandoned by two previous sculptors for 25 years. Michelangelo was 26 when he started. The statue stands 5.17m tall and weighs 6 tonnes.",
  },
  "accademia": {
    history: "The Galleria dell'Accademia (1784) also contains Michelangelo's unfinished 'Prisoners' — four statues abandoned when the Pope Julius II tomb commission fell through. The rough figures appear to be struggling out of the marble.",
  },
  "piazza della signoria": {
    history: "In 1497, Savonarola held his 'Bonfire of the Vanities' here — burning books, art, and mirrors. A year later, he was burned alive on the same spot. A bronze disc marks the exact location.",
  },
  "bistecca": {
    funFact: "Bistecca alla Fiorentina must be from Chianina cattle, cut at least 5cm thick, grilled over oak or olive wood, and served rare (al sangue). Medium or well-done is an insult — some restaurants refuse.",
  },

  // ── Rome ──────────────────────────────────────────────────────────────────────
  "colosseum": {
    history: "The Colosseum held 50,000-80,000 spectators, completed in just 10 years (80 AD). It had a retractable canvas awning operated by 1,000 sailors, and 80 trap doors for dramatic arena entries. In 400 years, an estimated 400,000 people and 1 million animals died here.",
  },
  "roman forum": {
    history: "The Roman Forum was the centre of Rome for 1,000 years. By the Middle Ages it was so buried it was called Campo Vaccino (cow field) and used as a cattle market until excavations began in 1803.",
  },
  "trevi fountain": {
    history: "The Trevi Fountain (1762) marks the end of the Aqua Virgo aqueduct, built 19 BC and still carrying water today. Over 1.5 million euros in coins are thrown in annually. One coin = return to Rome, two = find love, three = marry.",
  },
  "trevi": {
    history: "The Trevi Fountain (1762) marks the end of the Aqua Virgo aqueduct, built 19 BC and still carrying water today. Over 1.5 million euros in coins are thrown in annually — collected nightly for Caritas.",
  },
  "pantheon": {
    history: "The Pantheon's unreinforced concrete dome (43.3m) has stood for 1,900 years. The oculus (8.8m wide) is the only light source. Roman concrete used volcanic ash that actually gets stronger when wet — rediscovered by scientists in 2017.",
  },
  "borghese": {
    history: "The Borghese Gallery holds Cardinal Scipione Borghese's private collection. Bernini's sculptures here — Apollo and Daphne, The Rape of Persephone, David — were all commissioned before he was 30.",
  },
  "spanish steps": {
    funFact: "The Spanish Steps (1725) are actually French — built with French money to connect a French church to the Spanish Embassy below. Sitting on the steps with food or drink is illegal — 250 euro fine.",
  },
  "vatican": {
    history: "Vatican City (0.44 km2) is the world's smallest country. The Sistine Chapel ceiling was painted by Michelangelo over 4 years (1508-1512) — he was 33 when he started and reportedly went partially blind from paint dripping into his eyes.",
  },
  "sistine": {
    history: "The Sistine Chapel ceiling contains 343 figures painted in 4 years. Michelangelo fired his original team and did most of it alone. The 'Creation of Adam' is the most reproduced image in Western art history.",
  },
  "st peter": {
    history: "St Peter's Basilica stands where Peter was crucified and buried in 64 AD. Building took 120 years (1506-1626). The dome was designed by Michelangelo at age 72 and completed after his death.",
  },
  "trastevere": {
    history: "Trastevere was ancient Rome's working-class neighbourhood. Its oldest church, Santa Maria in Trastevere, has been in continuous operation since 340 AD — one of the oldest in the Christian world.",
  },
  "piazza navona": {
    history: "Piazza Navona follows the exact oval shape of the ancient Domitian Stadium (86 AD). Bernini's Fountain of the Four Rivers (1651) represents the Nile, Ganges, Danube and Rio de la Plata.",
  },
  "leonardo express": {
    funFact: "The Leonardo Express runs non-stop Termini to Fiumicino in exactly 32 minutes, 14 euros at Termini machines. Named after Leonardo da Vinci, who is actually buried in France (Chateau d'Amboise) — not Italy.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CITY PHOTOSPOTS  (GPS-verified)
// ─────────────────────────────────────────────────────────────────────────────
export const CITY_PHOTOSPOTS = {
  "venice": [
    {
      id: "venice-bridge-of-sighs",
      name: "Bridge of Sighs",
      description: "Shoot from Ponte della Paglia — frame the bridge between the stone columns. Wait for a gondola to pass underneath.",
      tip: "Stand on Ponte della Paglia, frame the bridge between column pillars. Gondola passing = viral shot.",
      bestTime: "Morning 08:00–10:00",
      lat: 45.4337, lng: 12.3411,
      mapUrl: "https://maps.google.com/?q=45.4337,12.3411",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg/900px-Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg",
      type: "photospot",
    },
    {
      id: "venice-st-marks",
      name: "St Mark's Square at Golden Hour",
      description: "Shoot basilica facade from the far end of the square. Campanile silhouette against sunset sky.",
      tip: "Arrive 18:00 — golden light, crowds thinning. Shoot FROM the colonnade looking toward the basilica.",
      bestTime: "Dawn 07:00 or Golden hour 18:00",
      lat: 45.4341, lng: 12.3388,
      mapUrl: "https://maps.google.com/?q=45.4341,12.3388",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg/960px-Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg",
      type: "photospot",
    },
    {
      id: "venice-libreria-acqua-alta",
      name: "Libreria Acqua Alta",
      description: "Books stacked in gondolas and bathtubs. Climb the book-staircase at the back for a canal view.",
      tip: "Pose ON the book-staircase looking back into the room — THE shot. Opens 09:00 — arrive at opening.",
      bestTime: "09:00–10:00 weekdays",
      lat: 45.4343, lng: 12.3397,
      mapUrl: "https://maps.google.com/?q=45.4343,12.3397",
      photoUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Libreria_Acqua_Alta,_Venice_(31268151532).jpg?width=900",
      type: "photospot",
    },
    {
      id: "venice-accademia-bridge",
      name: "Accademia Bridge Sunset",
      description: "Santa Maria della Salute dome framed by the bridge arch with gondolas in foreground.",
      tip: "Stand at bridge centre, point toward Santa Maria della Salute. Wait for a gondola to drift into frame.",
      bestTime: "Sunset 18:00–18:30",
      lat: 45.4317, lng: 12.3276,
      mapUrl: "https://maps.google.com/?q=45.4317,12.3276",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg/960px-Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg",
      type: "photospot",
    },
    {
      id: "venice-burano-canal",
      name: "Burano — Colourful Canal",
      description: "The most colourful canal in Burano — pastel houses reflected in still water.",
      tip: "Crouch low to get canal reflection + coloured walls in same frame. Go before 11:00.",
      bestTime: "09:00–11:00, sunny morning",
      lat: 45.4851, lng: 12.4170,
      mapUrl: "https://maps.google.com/?q=45.4851,12.4170",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg/960px-Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg",
      type: "photospot",
    },
  ],

  "florence": [
    {
      id: "florence-piazzale-michelangelo",
      name: "Piazzale Michelangelo — Panorama",
      description: "The classic panoramic shot of Florence — Duomo, Palazzo Vecchio and red rooftops in one frame.",
      tip: "Arrive at sunrise (before 07:00) to beat tour groups. Golden light hits the Duomo dome perfectly.",
      bestTime: "Sunrise 06:30–07:30",
      lat: 43.7629, lng: 11.2650,
      mapUrl: "https://maps.google.com/?q=43.7629,11.2650",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Firenze_piazzale_michelangelo.jpg/960px-Firenze_piazzale_michelangelo.jpg",
      type: "photospot",
    },
    {
      id: "florence-ponte-vecchio",
      name: "Ponte Vecchio from Ponte Santa Trinita",
      description: "Frame the Ponte Vecchio with Arno reflections from Ponte Santa Trinita.",
      tip: "Shoot from the middle of Ponte Santa Trinita at sunrise — the bridge turns gold and the Arno is mirror-still.",
      bestTime: "Sunrise 07:00",
      lat: 43.7672, lng: 11.2531,
      mapUrl: "https://maps.google.com/?q=43.7672,11.2531",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Florence_Ponte_Vecchio_Sunset_2.jpg/960px-Florence_Ponte_Vecchio_Sunset_2.jpg",
      type: "photospot",
    },
  ],

  "rome": [
    {
      id: "rome-trevi-fountain",
      name: "Trevi Fountain — Early Morning",
      description: "The iconic baroque fountain — shoot before 07:30 when it's almost empty.",
      tip: "Arrive at 06:30 — nearly empty. The fountain is lit at night too. Coin toss: throw right-handed over left shoulder.",
      bestTime: "06:30–07:30 (empty) or 21:00 (night lighting)",
      lat: 41.9009, lng: 12.4833,
      mapUrl: "https://maps.google.com/?q=41.9009,12.4833",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg/900px-Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg",
      type: "photospot",
    },
    {
      id: "rome-colosseum-golden-hour",
      name: "Colosseum at Golden Hour",
      description: "Shoot the Colosseum from Via Sacra with the arch of Constantine in the same frame.",
      tip: "Stand on the hill above the Roman Forum looking down — Colosseum framed by ancient columns. Sunset = warm stone.",
      bestTime: "Golden hour 18:00–19:00",
      lat: 41.8902, lng: 12.4922,
      mapUrl: "https://maps.google.com/?q=41.8902,12.4922",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Colosseo_2020.jpg/960px-Colosseo_2020.jpg",
      type: "photospot",
    },
    {
      id: "rome-pantheon-oculus",
      name: "Pantheon — The Oculus",
      description: "Shoot straight up at the 8.8m oculus — best on a sunny day when the light beam sweeps the floor.",
      tip: "Lie on the floor to shoot straight up. The light beam moves across the floor like a sundial. Midday = best light column.",
      bestTime: "11:00–13:00 on a sunny day",
      lat: 41.8986, lng: 12.4769,
      mapUrl: "https://maps.google.com/?q=41.8986,12.4769",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Pantheon_Rome_aperture.jpg/960px-Pantheon_Rome_aperture.jpg",
      type: "photospot",
    },
  ],

  "lucerne": [
    {
      id: "lucerne-chapel-bridge",
      name: "Kapellbrücke — Chapel Bridge",
      description: "Europe's oldest covered wooden bridge over the Reuss river with the Water Tower behind.",
      tip: "Shoot from the south bank looking north-east — bridge, water tower, and Mt. Pilatus in background. Dawn for reflections.",
      bestTime: "Sunrise 07:00 or blue hour",
      lat: 47.0520, lng: 8.3072,
      mapUrl: "https://maps.google.com/?q=47.0520,8.3072",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Luzern_IMG_4374.jpg/960px-Luzern_IMG_4374.jpg",
      type: "photospot",
    },
  ],

  "grindelwald": [
    {
      id: "grindelwald-eiger-view",
      name: "Eiger North Face Viewpoint",
      description: "The most dramatic Alpine wall in the world, directly above the village.",
      tip: "Walk 10 min north of the village centre to the open meadow. North face fills the entire frame — no zoom needed.",
      bestTime: "Morning 08:00–10:00 (before clouds build)",
      lat: 46.6244, lng: 8.0412,
      mapUrl: "https://maps.google.com/?q=46.6244,8.0412",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Eiger_Nordwand.jpg/960px-Eiger_Nordwand.jpg",
      type: "photospot",
    },
  ],

  "cinque terre": [
    {
      id: "cinque-terre-riomaggiore-harbour",
      name: "Riomaggiore Harbour — Colourful Boats",
      description: "Tiny fishing harbour with stacked colourful houses rising behind it.",
      tip: "Shoot from the top of the harbour steps — boats and houses in one frame. Golden hour makes the colours pop.",
      bestTime: "Golden hour 18:00–19:00",
      lat: 44.0997, lng: 9.7380,
      mapUrl: "https://maps.google.com/?q=44.0997,9.7380",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Riomaggiore-Hafen.jpg/960px-Riomaggiore-Hafen.jpg",
      type: "photospot",
    },
    {
      id: "cinque-terre-manarola-panorama",
      name: "Manarola — The Classic Panorama",
      description: "The most photographed view in Cinque Terre — entire village perched on cliffs above the sea.",
      tip: "Follow signs to 'Punta Bonfiglio' — the rocky viewpoint 5 min walk. Sunset = iconic golden shot.",
      bestTime: "Sunset 18:30–19:00",
      lat: 44.1066, lng: 9.7288,
      mapUrl: "https://maps.google.com/?q=44.1066,9.7288",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Manarola_from_Via_dell%27Amore.jpg/960px-Manarola_from_Via_dell%27Amore.jpg",
      type: "photospot",
    },
  ],

  "riomaggiore": [
    {
      id: "cinque-terre-riomaggiore-harbour",
      name: "Riomaggiore Harbour — Colourful Boats",
      description: "Tiny fishing harbour with stacked colourful houses rising behind it.",
      tip: "Shoot from the top of the harbour steps — boats and houses in one frame. Golden hour makes the colours pop.",
      bestTime: "Golden hour 18:00–19:00",
      lat: 44.0997, lng: 9.7380,
      mapUrl: "https://maps.google.com/?q=44.0997,9.7380",
      photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Riomaggiore-Hafen.jpg/960px-Riomaggiore-Hafen.jpg",
      type: "photospot",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match an activity title against PLACES_DB and return enrichment facts.
 * Returns { history?, funFact?, tip? } or null if no match found.
 *
 * @param {string} title   - Activity title (e.g. "Uffizi Gallery visit")
 * @param {string} [city]  - Optional city hint (unused currently, reserved for future disambiguation)
 * @returns {{ history?: string, funFact?: string, tip?: string } | null}
 */
export function enrichActivity(title, city) {
  if (!title || typeof title !== 'string') return null;
  const lower = title.toLowerCase();

  // Sort keys by length descending so longer/more specific keys win
  const keys = Object.keys(PLACES_DB).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) {
      return { ...PLACES_DB[key] };
    }
  }
  return null;
}

/**
 * Get curated photo spots for a city.
 *
 * @param {string} city - City name (case-insensitive)
 * @returns {Array<object>} Array of photospot objects (may be empty)
 */
export function getCityPhotospots(city) {
  if (!city || typeof city !== 'string') return [];
  return CITY_PHOTOSPOTS[city.toLowerCase()] || [];
}

/**
 * Enrich a rawPlan object in-place.
 *
 * For each day:
 *   1. Detect city from day.city / day.title / day.subtitle
 *   2. Enrich activity/food timeline items with history/funFact/tip (non-destructive)
 *   3. Add city photospots (de-duped by id) with type:"photospot"
 *   4. Sort timeline by time
 *
 * @param {object} plan - Raw plan object with .days array
 * @returns {object} The same plan object (mutated), enriched
 */
export function enrichPlan(plan) {
  if (!plan || !Array.isArray(plan.days)) return plan;

  for (const day of plan.days) {
    // ── 1. Detect city ─────────────────────────────────────────────────────
    const cityRaw = day.city
      || (typeof day.title === 'string' ? _extractCity(day.title) : null)
      || (typeof day.subtitle === 'string' ? _extractCity(day.subtitle) : null)
      || '';
    const city = cityRaw.toLowerCase().trim();

    // ── 2. Enrich activities ───────────────────────────────────────────────
    if (Array.isArray(day.timeline)) {
      for (const item of day.timeline) {
        if (item.type === 'activity' || item.type === 'food') {
          const facts = enrichActivity(item.title, city);
          if (facts) {
            // Non-destructive merge — don't overwrite existing fields
            for (const [k, v] of Object.entries(facts)) {
              if (item[k] === undefined || item[k] === null) {
                item[k] = v;
              }
            }
          }
        }
      }

      // ── 3. Add photospots (de-duped) ───────────────────────────────────
      const spots = getCityPhotospots(city);
      if (spots.length > 0) {
        const existingIds = new Set(
          day.timeline
            .filter(t => t.type === 'photospot' && t.id)
            .map(t => t.id)
        );
        // Also skip if a spot with the same name already exists
        const existingNames = new Set(
          day.timeline
            .filter(t => t.type === 'photospot' && t.name)
            .map(t => t.name.toLowerCase())
        );

        for (const spot of spots) {
          if (existingIds.has(spot.id)) continue;
          if (existingNames.has((spot.name || '').toLowerCase())) continue;

          // Assign a time slightly after mid-afternoon as default
          day.timeline.push({
            ...spot,
            time: spot.time || '16:00',
            type: 'photospot',
          });
        }

        // ── 4. Sort timeline by time ──────────────────────────────────────
        day.timeline.sort((a, b) => {
          const ta = a.time || '23:59';
          const tb = b.time || '23:59';
          return ta.localeCompare(tb);
        });
      }
    }
  }

  return plan;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Try to extract a city name from a free-form day title like "Rome Day 3" */
function _extractCity(text) {
  if (!text) return '';
  // Strip day numbers and common words, take the first meaningful word
  const cleaned = text
    .replace(/\bday\s*\d+\b/gi, '')
    .replace(/\b(travel|arrive|depart|morning|afternoon|evening|night)\b/gi, '')
    .trim();
  // Return the first token as a best-guess city
  const parts = cleaned.split(/[\s,–—-]+/).filter(Boolean);
  return parts[0] || '';
}
