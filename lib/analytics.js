import { readFileSync, writeFileSync } from "fs";

const FILE = "/tmp/tripva-analytics.json";

export function trackClick({ partner, destination, tripId }) {
  let data = {};
  try { data = JSON.parse(readFileSync(FILE, "utf8")); } catch {}
  if (!data.clicks) data.clicks = { booking: 0, trainline: 0, gyg: 0, rentalcars: 0 };
  if (data.clicks[partner] !== undefined) data.clicks[partner]++;
  data.totalClicks = Object.values(data.clicks).reduce((a, b) => a + b, 0);
  writeFileSync(FILE, JSON.stringify(data));
}

export function getClickStats() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return { clicks: { booking: 0, trainline: 0, gyg: 0, rentalcars: 0 }, totalClicks: 0 }; }
}
