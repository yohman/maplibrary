import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = path.join(root, "data/maps.csv");
const outputPath = path.join(root, "data/maps.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && value === "") quoted = true;
    else if (character === ",") { row.push(value); value = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else value += character;
  }
  if (value || row.length) { row.push(value); if (row.some((cell) => cell !== "")) rows.push(row); }
  const [headers, ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function mappedValue(key, value) {
  if (key === "publicationDate") return value ? value : null;
  if (["width", "height"].includes(key) && value === "0") return 0;
  if (["state", "mapping.altitude", "mapping.dateFrom.timezone_type", "mapping.dateTo.timezone_type", "mapping.zoom", "publicationDate.timezone_type"].includes(key)) {
    if (value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (["mapping.isNetworkLink", "mapping.isCollection"].includes(key)) return /^(true|1|yes)$/i.test(value);
  if (key === "mapping.georeferences") {
    try { return JSON.parse(value || "[]"); } catch { throw new Error(`Invalid JSON in map ${key}`); }
  }
  if (["mapping.view", "mapping.markerType", "mapping.markerState", "mapping.id"].includes(key) && value === "") return null;
  return value;
}

function setNested(record, key, value) {
  const parts = key.split(".");
  let target = record;
  while (parts.length > 1) target = target[parts.shift()] ||= {};
  target[parts[0]] = value;
}

const records = parseCsv(fs.readFileSync(csvPath, "utf8"));
const maps = records.map((row) => {
  const map = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "publicationDate") {
      const date = row["publicationDate.date"];
      map.publicationDate = date ? {
        date,
        timezone_type: mappedValue("publicationDate.timezone_type", row["publicationDate.timezone_type"]),
        timezone: row["publicationDate.timezone"] || ""
      } : mappedValue(key, value);
      continue;
    }
    if (key.startsWith("publicationDate.")) continue;
    if (key.includes(".")) setNested(map, key, mappedValue(key, value));
    else {
      map[key] = mappedValue(key, value);
      if (key === "description") map.mapping = {};
    }
  }
  return map;
});
if (process.argv.includes("--check")) {
  const existing = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  const mismatches = maps.reduce((count, map, index) => count + (JSON.stringify(map) === JSON.stringify(existing[index]) ? 0 : 1), 0);
  console.log(`Checked ${maps.length} CSV rows against maps.json; ${mismatches} records differ.`);
  if (mismatches) {
    const first = maps.findIndex((map, index) => JSON.stringify(map) !== JSON.stringify(existing[index]));
    const expected = maps[first];
    const found = existing[first];
    console.log(`First mismatch is record ${first + 1} (id ${expected?.id}); generated keys: ${Object.keys(expected || {}).join(", ")}; existing keys: ${Object.keys(found || {}).join(", ")}.`);
    for (const key of Object.keys(expected || {})) {
      if (JSON.stringify(expected[key]) !== JSON.stringify(found?.[key])) console.log(`${key}: generated ${JSON.stringify(expected[key])}; existing ${JSON.stringify(found?.[key])}`);
    }
    const valueKinds = new Map();
    for (const [index, generated] of maps.entries()) for (const key of Object.keys(generated)) {
      if (JSON.stringify(generated[key]) === JSON.stringify(existing[index]?.[key])) continue;
      const signature = `${key}: ${typeof generated[key]} ${JSON.stringify(generated[key])} / ${typeof existing[index]?.[key]} ${JSON.stringify(existing[index]?.[key])}`;
      valueKinds.set(signature, (valueKinds.get(signature) || 0) + 1);
    }
    console.log([...valueKinds.entries()].slice(0, 15).map(([signature, count]) => `${signature} (${count})`).join("\n"));
  }
  if (existing.length !== maps.length || mismatches) process.exitCode = 1;
} else {
  fs.writeFileSync(outputPath, `${JSON.stringify(maps, null, 2)}\n`, "utf8");
  console.log(`Generated ${maps.length} map records from data/maps.csv.`);
}
