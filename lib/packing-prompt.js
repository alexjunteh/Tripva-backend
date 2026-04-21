// Pure builder for the /api/packing prompt. Kept separate from the handler so
// unit tests can assert on the prompt construction without needing to mock req/res
// or hit the OpenAI API.

export const ARCHETYPE_HINTS = {
  solo:      'Solo traveler. Minimize weight. Include basic safety (whistle, small first-aid kit).',
  couple:    'Couple. Include romantic-dinner attire. Skip kid items.',
  family:    'Family. Include kid essentials: snacks, entertainment, basic meds, spare clothes, sun protection. Stroller if relevant.',
  friends:   'Group of friends. Include shared items (speaker, cards, group first-aid kit).',
  adventure: 'Adventure/outdoor trip. Heavy on gear: sturdy boots, layers, waterproof, first-aid, water purification, power bank, headlamp.',
  nomad:     'Slow-travel / nomad. Work-from-anywhere essentials: laptop, universal adapter, noise-cancelling headphones, small-apartment toiletries.',
  generic:   'Standard trip essentials.',
};

export function computeNights(startDate, endDate) {
  if (!startDate || !endDate) return '';
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  if (isNaN(d1) || isNaN(d2)) return '';
  const n = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
  return ` ${n} days`;
}

export function buildPackingPrompt(input) {
  const archetype = input.archetype || 'generic';
  const travelers = input.travelers || 1;
  const nights = computeNights(input.startDate, input.endDate);
  const childAges = Array.isArray(input.child_ages) && input.child_ages.length
    ? ` — children ages ${input.child_ages.join(', ')}`
    : '';

  let hint = ARCHETYPE_HINTS[archetype] || ARCHETYPE_HINTS.generic;
  if (archetype === 'family' && childAges) {
    hint = `Family with ${childAges.trim()}. Include kid essentials: snacks, entertainment, basic meds, spare clothes, sun protection. Stroller if relevant.`;
  }
  if (archetype === 'friends') {
    hint = `Group of ${travelers} friends. Include shared items (speaker, cards, group first-aid kit).`;
  }

  return `Generate a comprehensive, archetype-aware packing list for this trip:

Destination: ${input.destination}${nights}
Travelers: ${travelers}
Archetype: ${archetype}${childAges}

Context: ${hint}

Return ONLY JSON in this schema:
{
  "categories": [
    {
      "icon": "👕",
      "name": "Clothing",
      "items": [
        { "title": "3× T-shirts", "note": "Mix colors" },
        { "title": "1× light jacket", "note": "Evenings can be cool" }
      ]
    }
  ]
}

REQUIREMENTS:
- 5-8 categories (Documents, Clothing, Toiletries, Electronics, Health & Safety, Destination-specific, etc.)
- 4-10 items per category
- Each item has "title" (count + item) and optional "note" (why or when)
- Include items specific to the destination (e.g., water shoes for beach, thermal layer for cold, sim card advice)
- Include items specific to the archetype (kid snacks for family, business casual for nomad, etc.)
- Skip obvious universal items (phone charger is fine; don't list "phone", "wallet")
- Note weather/climate-appropriate items explicitly

Return ONLY the JSON object. No markdown fences, no prose.`;
}
