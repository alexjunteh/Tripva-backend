import { readFileSync, writeFileSync } from 'fs';
import { enrichPlan } from '../lib/places.js';

const [,, inputFile, outputFile] = process.argv;
if (!inputFile || !outputFile) { console.error('Usage: node scripts/enrich-state.mjs <input.html> <output.html>'); process.exit(1); }

const html = readFileSync(inputFile, 'utf8');
const match = html.match(/const APP_STATE = (\{[\s\S]*?\}); \/\/ END STATE/);
if (!match) { console.error('APP_STATE not found'); process.exit(1); }

const state = JSON.parse(match[1]);
const rawPlan = JSON.parse(JSON.stringify(state.rawPlan)); // deep clone

const before = {
  items: rawPlan.days.reduce((n,d)=>n+(d.timeline||[]).length,0),
  facts: rawPlan.days.reduce((n,d)=>n+(d.timeline||[]).filter(t=>t.history||t.funFact).length,0),
  spots: rawPlan.days.reduce((n,d)=>n+(d.timeline||[]).filter(t=>t.type==='photospot').length,0),
};

const enriched = enrichPlan(rawPlan);
state.rawPlan = enriched;

const after = {
  items: enriched.days.reduce((n,d)=>n+(d.timeline||[]).length,0),
  facts: enriched.days.reduce((n,d)=>n+(d.timeline||[]).filter(t=>t.history||t.funFact).length,0),
  spots: enriched.days.reduce((n,d)=>n+(d.timeline||[]).filter(t=>t.type==='photospot').length,0),
};

console.log('\n=== ENGINE ENRICHMENT DIFF ===');
console.log(`Timeline items:  ${before.items} → ${after.items}  (+${after.items-before.items} new)`);
console.log(`History/facts:   ${before.facts} → ${after.facts}  (+${after.facts-before.facts} new)`);
console.log(`Photo spots:     ${before.spots} → ${after.spots}  (+${after.spots-before.spots} new)`);

console.log('\n=== PER-DAY RESULT ===');
for (const d of enriched.days) {
  const spots = d.timeline.filter(t=>t.type==='photospot').length;
  const facts = d.timeline.filter(t=>t.history||t.funFact).length;
  const flag = facts > 0 || spots > 0 ? '' : '  ⚠️  bare';
  console.log(`  Day ${String(d.day).padStart(2)} ${(d.title||'').slice(0,28).padEnd(30)} ${d.timeline.length} items | 📖 ${facts} | 📸 ${spots}${flag}`);
}

const newJson = JSON.stringify(state);
const idxS = html.indexOf('const APP_STATE = ') + 'const APP_STATE = '.length;
const idxE = html.indexOf('; // END STATE', idxS);
writeFileSync(outputFile, html.slice(0, idxS) + newJson + html.slice(idxE));
console.log(`\nWritten: ${outputFile}`);
