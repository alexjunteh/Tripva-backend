/**
 * Photospots library — curated photo location database
 * Sources: Photohound, XHS/Chinese travel blogs, verified coordinates via OSM Nominatim
 * 
 * Photo pipeline:
 *   1. Photohound scrape → spot names + descriptions
 *   2. GPS → OSM Nominatim geocoding (free, no key)
 *   3. Photos → Wikipedia Commons API or Unsplash
 */

// Curated spot database (Photohound + XHS top picks, GPS verified via Google Maps)
const SPOT_DB = {
  venice: [
    {
      id: 'venice-bridge-of-sighs',
      name: 'Bridge of Sighs',
      nameZh: '叹息桥',
      description: 'Shoot from Ponte della Paglia — frame the bridge between the stone columns. Wait for a gondola to pass underneath.',
      tip: 'Stand on Ponte della Paglia, frame the bridge between column pillars. Gondola passing = viral shot. Blue/white bridge, turquoise water.',
      bestTime: 'Morning 08:00–10:00 (soft light, fewer tourists)',
      lat: 45.4337,
      lng: 12.3411,
      mapUrl: 'https://maps.google.com/?q=45.4337,12.3411',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg/900px-Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg',
      source: 'photohound+xhs',
      xhsViralScore: 9.8,
    },
    {
      id: 'venice-st-marks',
      name: "St Mark's Square at Golden Hour",
      nameZh: '圣马可广场黄金时刻',
      description: "Shoot basilica facade from the far end of the square. Campanile tower silhouette against sunset sky. If there's acqua alta, reflections are extraordinary.",
      tip: "Arrive 18:00 — golden light, crowds thinning. Shoot FROM the colonnade looking toward the basilica. Avoid midday — harsh shadows and wall-to-wall tourists.",
      bestTime: 'Dawn 07:00 (empty piazza) or Golden hour 18:00',
      lat: 45.4341,
      lng: 12.3388,
      mapUrl: 'https://maps.google.com/?q=45.4341,12.3388',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg/960px-Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg',
      source: 'photohound+xhs',
      xhsViralScore: 9.5,
    },
    {
      id: 'venice-libreria-acqua-alta',
      name: 'Libreria Acqua Alta',
      nameZh: '高水位书店',
      description: 'Books stacked in gondolas and bathtubs. Climb the book-staircase at the back for a canal view. Free entry.',
      tip: 'Pose ON the book-staircase looking back into the room — THE shot. Second: sit in the gondola full of books. Opens 09:00 — arrive at opening to beat tourists.',
      bestTime: '09:00–10:00 weekdays (before tour groups)',
      lat: 45.4343,
      lng: 12.3397,
      mapUrl: 'https://maps.google.com/?q=45.4343,12.3397',
      photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Libreria_Acqua_Alta,_Venice_(31268151532).jpg?width=900',
      source: 'xhs-viral',
      xhsViralScore: 9.7,
    },
    {
      id: 'venice-accademia-bridge',
      name: 'Accademia Bridge Sunset',
      nameZh: '学院桥日落',
      description: 'Santa Maria della Salute dome framed by the bridge arch with gondolas in foreground. The dome turns gold 18:00–18:30.',
      tip: 'Stand at bridge centre, point toward Santa Maria della Salute. Wait for a gondola to drift into frame. Blue-gold light window is only ~20min.',
      bestTime: 'Sunset 18:00–18:30 (late March)',
      lat: 45.4317,
      lng: 12.3276,
      mapUrl: 'https://maps.google.com/?q=45.4317,12.3276',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg/960px-Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg',
      source: 'photohound+xhs',
      xhsViralScore: 9.3,
    },
    {
      id: 'venice-scala-contarini',
      name: 'Scala Contarini del Bovolo',
      nameZh: '蜗牛楼螺旋阶梯',
      description: 'Hidden Renaissance spiral staircase in a private courtyard. Zero tourists early morning. €7 entry or shoot from gate for free.',
      tip: 'Shoot from ground level looking straight UP the spiral. Portrait mode + wide angle. Hidden gem — not on typical tourist maps.',
      bestTime: '09:00–10:00 (opens at 10:00 — courtyard view is free)',
      lat: 45.4349,
      lng: 12.3344,
      mapUrl: 'https://maps.google.com/?q=45.4349,12.3344',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Scala_Contarini_del_Bovolo_%28Venice%29.jpg/960px-Scala_Contarini_del_Bovolo_%28Venice%29.jpg',
      source: 'photohound+xhs',
      xhsViralScore: 9.0,
    },
    {
      id: 'venice-punta-dogana',
      name: 'Punta della Dogana',
      nameZh: '海关角',
      description: 'Triangular tip of Dorsoduro — water on 3 sides, Santa Maria della Salute dome behind you. The most dramatic "floating city" shot.',
      tip: 'Face the Salute dome with the Grand Canal opening on your right and the Giudecca Canal behind. Shoot at blue hour (just after sunset) for the best sky.',
      bestTime: 'Blue hour 18:30–19:00 or sunrise',
      lat: 45.4305,
      lng: 12.3344,
      mapUrl: 'https://maps.google.com/?q=45.4305,12.3344',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg/960px-Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg',
      source: 'photohound',
      xhsViralScore: 8.8,
    },
    {
      id: 'venice-rialto-bridge',
      name: 'Rialto Bridge — Riva del Vin',
      nameZh: '里亚托桥-酒吧河岸',
      description: 'Shoot the bridge from Riva del Vin (south bank) with gondolas in foreground. Avoid shooting FROM the bridge — shoot it.',
      tip: 'Best angle: from Fondamenta del Vin, slightly east of the bridge. Early morning — gondolas lined up, no tourists, golden light on bridge.',
      bestTime: 'Sunrise 07:00–08:00',
      lat: 45.4380,
      lng: 12.3359,
      mapUrl: 'https://maps.google.com/?q=45.4380,12.3359',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg/900px-Antonio_Contin_-_Ponte_dei_sospiri_%28Venice%29.jpg',
      source: 'photohound',
      xhsViralScore: 9.2,
    },
    {
      id: 'venice-traghetto-vecchio',
      name: 'Traghetto Vecchio View',
      nameZh: '旧渡轮景观',
      description: 'Hidden viewpoint near Accademia — frame the Grand Canal between two buildings with a gondola ferry in mid-crossing. Very few tourists know this spot.',
      tip: "Wait for the traghetto (standing gondola ferry) to be in the middle of the canal crossing — that's the shot. Takes patience but totally worth it.",
      bestTime: 'Morning 09:00–11:00 when traghetti run frequently',
      lat: 45.4322,
      lng: 12.3278,
      mapUrl: 'https://maps.google.com/?q=45.4322,12.3278',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg/960px-Accademia_bridge_in_Venice_%28South_East_exposure%29.jpg',
      source: 'photohound',
      xhsViralScore: 8.5,
    },
    {
      id: 'venice-burano-canal',
      name: 'Burano — Via Baldassare Galuppi Canal',
      nameZh: '布拉诺彩色小岛',
      description: 'The most colourful canal in Burano — pastel houses reflected in still water. Every wall is a different colour. Peak saturation on sunny mornings.',
      tip: 'Crouch low to get canal reflection + coloured walls in same frame. Go before 11:00 before the tour groups arrive. Rainy day = better reflections.',
      bestTime: '09:00–11:00, sunny morning',
      lat: 45.4851,
      lng: 12.4170,
      mapUrl: 'https://maps.google.com/?q=45.4851,12.4170',
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg/960px-Piazza_San_Marco_%28Venice%29_at_night-msu-2021-6449-.jpg',
      source: 'xhs-viral',
      xhsViralScore: 9.6,
    },
  ],
};

/**
 * Get photospots for a city
 * @param {string} city - city slug (e.g. 'venice', 'florence', 'rome')
 * @param {object} opts - { limit, minScore }
 */
export function getPhotoSpots(city, opts = {}) {
  const { limit = 10, minScore = 0 } = opts;
  const spots = SPOT_DB[city.toLowerCase()] || [];
  return spots
    .filter(s => s.xhsViralScore >= minScore)
    .sort((a, b) => b.xhsViralScore - a.xhsViralScore)
    .slice(0, limit);
}

export { SPOT_DB };
