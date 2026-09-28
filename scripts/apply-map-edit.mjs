import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = event.issue;
const trustedAccount = "yohman";
if (issue?.user?.login !== trustedAccount) throw new Error("Only the allowlisted Map Library account may publish metadata edits.");

const csvPath = path.join(root, "data/maps.csv");
const mapJsonPath = path.join(root, "data/maps.json");
const original = fs.readFileSync(csvPath, "utf8");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  let fieldStart = 0;
  let index = 0;
  while (index < text.length) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else value += character;
    } else if (character === '"' && index === fieldStart) quoted = true;
    else if (character === "," || character === "\n" || character === "\r") {
      row.push({ value, start: fieldStart, end: index });
      value = "";
      if (character === ",") fieldStart = index + 1;
      else {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        rows.push(row); row = []; fieldStart = index + 1;
      }
    } else value += character;
    index += 1;
  }
  if (fieldStart < text.length || row.length || value) { row.push({ value, start: fieldStart, end: text.length }); rows.push(row); }
  return rows;
}
function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function parseIssuePayload(body) {
  if (!body.includes("<!-- hypercities-map-edit:start -->") || !body.includes("<!-- hypercities-map-edit:end -->")) throw new Error("This issue does not contain a HyperCities map edit payload.");
  const match = body.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) throw new Error("The map edit JSON block is missing.");
  return JSON.parse(match[1]);
}
function setPath(object, dottedKey, value) {
  const parts = dottedKey.split(".");
  let current = object;
  while (parts.length > 1) {
    const part = parts.shift();
    current[part] ||= {};
    current = current[part];
  }
  current[parts[0]] = value;
}
function jsonValue(key, value) {
  if (key === "publicationDate") return value === "" ? null : value;
  if (key === "state" || ["mapping.altitude", "mapping.dateFrom.timezone_type", "mapping.dateTo.timezone_type", "mapping.zoom"].includes(key)) {
    if (value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (["mapping.isNetworkLink", "mapping.isCollection"].includes(key)) return /^(true|1|yes)$/i.test(value);
  if (key === "mapping.georeferences") {
    try { return JSON.parse(value || "[]"); } catch { throw new Error("Georeferences must contain valid JSON."); }
  }
  if (["mapping.view", "mapping.markerType", "mapping.markerState", "mapping.id"].includes(key) && value === "") return null;
  return value;
}
function validate(payload, headers, records) {
  if (!payload || typeof payload.mapId !== "string" || !payload.changes || typeof payload.changes !== "object" || Array.isArray(payload.changes)) throw new Error("Payload must include a mapId and a changes object.");
  const rowIndex = headers.indexOf("id");
  const recordIndex = records.findIndex((row, index) => index > 0 && row[rowIndex]?.value === payload.mapId);
  if (recordIndex < 1) throw new Error(`Map id ${payload.mapId} does not exist in the source CSV.`);
  const changes = Object.entries(payload.changes);
  if (!changes.length || changes.length > 60) throw new Error("Provide between 1 and 60 field changes.");
  for (const [field, value] of changes) {
    if (!headers.includes(field) || field === "id") throw new Error(`Field ${field} is not editable.`);
    if (typeof value !== "string" || value.length > 30000) throw new Error(`Field ${field} must be text under 30,000 characters.`);
  }
  const record = Object.fromEntries(headers.map((header, index) => [header, records[recordIndex][index]?.value ?? ""]));
  for (const [field, value] of changes) record[field] = value;
  const bounds = ["mapping.swLat", "mapping.swLon", "mapping.neLat", "mapping.neLon"].map((key) => Number(record[key]));
  const anyBound = ["mapping.swLat", "mapping.swLon", "mapping.neLat", "mapping.neLon"].some((key) => changes.some(([field]) => field === key));
  if (anyBound) {
    const [south, west, north, east] = bounds;
    if (![south, west, north, east].every(Number.isFinite) || south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) throw new Error("Geographic bounds must be valid WGS84 coordinates with south < north and west < east.");
  }
  const tileUrl = record.tileUrl.trim();
  if (changes.some(([field]) => field === "tileUrl") && tileUrl && !/^https?:\/\//i.test(tileUrl)) throw new Error("Tile URL must begin with https:// or http://.");
  if (changes.some(([field]) => field === "minZoom" || field === "maxZoom")) {
    const minZoom = Number(record.minZoom);
    const maxZoom = Number(record.maxZoom);
    if (![minZoom, maxZoom].every(Number.isFinite) || minZoom < 0 || maxZoom > 24 || minZoom > maxZoom) throw new Error("Zoom limits must be numbers from 0 to 24, with minimum no higher than maximum.");
  }
  if (changes.some(([field]) => field === "mapping.dateFrom.date") && !/\d{3,4}/.test(record["mapping.dateFrom.date"])) throw new Error("Map start date must contain a year.");
  if (changes.some(([field]) => field === "mapping.georeferences")) jsonValue("mapping.georeferences", record["mapping.georeferences"]);
  return { recordIndex, changes };
}

const payload = parseIssuePayload(issue.body || "");
const rows = parseCsv(original);
const headers = rows[0].map((cell) => cell.value);
const { recordIndex, changes } = validate(payload, headers, rows);
const target = rows[recordIndex];
const edits = changes.map(([field, value]) => {
  const column = headers.indexOf(field);
  return { start: target[column].start, end: target[column].end, value: csvCell(value) };
}).sort((a, b) => b.start - a.start);
let updatedCsv = original;
for (const edit of edits) updatedCsv = `${updatedCsv.slice(0, edit.start)}${edit.value}${updatedCsv.slice(edit.end)}`;

const mapRecords = JSON.parse(fs.readFileSync(mapJsonPath, "utf8"));
const map = mapRecords.find((entry) => String(entry.id) === payload.mapId);
if (!map) throw new Error(`Map id ${payload.mapId} is missing from data/maps.json; no files were written.`);
for (const [field, value] of changes) {
  if (field.startsWith("publicationDate.")) continue;
  if (field.includes(".")) setPath(map, field, jsonValue(field, value));
  else map[field] = jsonValue(field, value);
}

fs.writeFileSync(csvPath, updatedCsv, "utf8");
fs.writeFileSync(mapJsonPath, `${JSON.stringify(mapRecords, null, 2)}\n`, "utf8");
fs.appendFileSync(process.env.GITHUB_OUTPUT, `map_id=${payload.mapId}\nfields=${changes.length}\nmap_title=${(map.titleEn || map.title || "Map").replace(/[\r\n]/g, " ")}\n`);
console.log(`Updated map ${payload.mapId}; ${changes.length} field(s) written to maps.csv and maps.json.`);
