// Best-effort parser for Australian shipping-label OCR text.
// Labels are messy — this uses heuristics and treats all output as suggestions
// that the operator must review before saving.

import { detectProviderFromTracking } from './carrierDetect';
import type { OcrResult } from './ocr';

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];
const STATE_RE = new RegExp(`\\b(${AU_STATES.join('|')})\\b`, 'i');
const POSTCODE_RE = /\b(\d{4})\b/;
const AU_PHONE_RE = /\b(?:\+?61|0)[2-478]\d{8}\b|\b04\d{2}\s?\d{3}\s?\d{3}\b/;

// Carrier keyword detection from header text.
export function detectCarrierFromText(text: string): string | null {
  const t = text.toUpperCase();
  if (/\bAUSTRALIA\s*POST\b|\bAUSPOST\b|\bMYPOST\b/.test(t)) return 'australia_post';
  if (/\bCOURIERS\s*PLEASE\b|\bCOURIERSPLEASE\b|\bCP\b/.test(t)) return 'couriers_please';
  if (/\bSTARTRACK\b/.test(t)) return 'startrack';
  if (/\bTOLL\b/.test(t)) return 'toll';
  if (/\bFASTWAY\b|\bARAMEX\b/.test(t)) return 'fastway';
  if (/\bDHL\b/.test(t)) return 'dhl';
  if (/\bFEDEX\b|\bFEDERAL\s*EXPRESS\b/.test(t)) return 'fedex';
  if (/\bTNT\b/.test(t)) return 'tnt';
  return null;
}

function findTrackingNumber(text: string): string | null {
  // Try AusPost article format first
  const aus = text.match(/\b([A-Z]\d{9}AU)\b/);
  if (aus) return aus[1];
  // CP consignment
  const cp = text.match(/\b(CP[H]?\d{6,})\b/);
  if (cp) return cp[1];
  // StarTrack
  const st = text.match(/\b(ST\d{9,13})\b/);
  if (st) return st[1];
  // Generic long all-caps alnum token between 10 and 30 chars that includes a letter+digit mix
  const tokens = text.split(/\s+/);
  const candidate = tokens.find((tk) => /^[A-Z0-9]{10,30}$/.test(tk) && /[A-Z]/.test(tk) && /\d/.test(tk));
  return candidate ?? null;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function isProbablyPhone(line: string): boolean {
  return !!line.match(AU_PHONE_RE);
}

function isProbablyPostcodeLine(line: string): { postcode: string; state: string | null } | null {
  const stateMatch = line.match(STATE_RE);
  const pcMatch = line.match(POSTCODE_RE);
  if (pcMatch) return { postcode: pcMatch[1], state: stateMatch ? stateMatch[1].toUpperCase() : null };
  if (stateMatch) return { postcode: '', state: stateMatch[1].toUpperCase() };
  return null;
}

// A line is "name-like" if it's short (1-4 words), has no digits, and
// isn't a known header keyword.
function isNameLike(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  if (/\d/.test(line)) return false;
  const upper = line.toUpperCase();
  if (/\b(DELIVER|TO|SHIP|ADDRESS|NAME|PHONE|FROM|REF|CONSIGNMENT|TRACKING|WEIGHT)\b/.test(upper)) return false;
  // Each word should look more like a name (alphabetic, capitalised) than a sentence fragment.
  const nameLikeWords = words.filter((w) => /^[A-Z][a-zA-Z'\-]+$/.test(w));
  return nameLikeWords.length >= Math.ceil(words.length / 2);
}

// A line is "address-like" if it starts with a street number, or contains a street suffix.
function isAddressLike(line: string): boolean {
  if (/^\s*\d+[A-Z]?\s/.test(line)) return true;
  return /\b(STREET|ST|ROAD|RD|AVENUE|AVE|DRIVE|DR|COURT|CT|PLACE|PL|CRESCENT|CR|CRESC|BOULEVARD|BLVD|LANE|LN|TERRACE|TCE|WAY|CLOSE|CL|GROVE|GR|CIRCUIT|CCT|HIGHWAY|HWY|PARADE|PDE|PARK|PK|ROW|STREET)\b/i.test(line);
}

export type ParsedLabel = {
  trackingNumber: string | null;
  carrierKey: string | null;
  name: string | null;
  addressLines: string[];
  postcode: string | null;
  state: string | null;
  suburb: string | null;
  phone: string | null;
};

export function parseLabel(ocr: OcrResult): ParsedLabel {
  const fullText = ocr.text;
  const lines = ocr.lines.map((l) => normalizeLine(l.text)).filter(Boolean);
  if (!lines.length && fullText) {
    lines.push(...fullText.split(/\r?\n/).map(normalizeLine).filter(Boolean));
  }

  const trackingNumber = findTrackingNumber(fullText);
  const carrierKey =
    detectCarrierFromText(fullText) ??
    (trackingNumber ? detectProviderFromTracking(trackingNumber) : null);

  let phone: string | null = null;
  const phoneLineIdx = lines.findIndex((l) => isProbablyPhone(l));
  if (phoneLineIdx >= 0) {
    const m = lines[phoneLineIdx].match(AU_PHONE_RE);
    if (m) phone = m[0].replace(/\s+/g, '');
  }

  // Locate the delivery section: prefer after a "DELIVER TO" / "SHIP TO" header.
  const headerIdx = lines.findIndex((l) => /\b(DELIVER|SHIP)\s*TO\b/i.test(l));
  const sectionLines = headerIdx >= 0 ? lines.slice(headerIdx + 1, headerIdx + 8) : lines;

  // Find the postcode/state line in the section — usually the last address line.
  let pcLineIdx = -1;
  let postcode: string | null = null;
  let state: string | null = null;
  for (let i = sectionLines.length - 1; i >= 0; i--) {
    const r = isProbablyPostcodeLine(sectionLines[i]);
    if (r) {
      pcLineIdx = i;
      postcode = r.postcode || null;
      state = r.state;
      break;
    }
  }

  // Suburb: usually the same line as or just before the state/postcode line.
  let suburb: string | null = null;
  if (pcLineIdx >= 0) {
    const line = sectionLines[pcLineIdx];
    // Remove state and postcode from the line — what's left is the suburb.
    const rem = line
      .replace(STATE_RE, '')
      .replace(POSTCODE_RE, '')
      .replace(/\d+/g, '')
      .replace(/[,\s]+/g, ' ')
      .trim();
    if (rem.length >= 2) suburb = rem.toUpperCase();
  }

  // Address lines = address-like lines in the section (excluding the postcode line).
  const addressLines: string[] = [];
  for (let i = 0; i < sectionLines.length; i++) {
    if (i === pcLineIdx) continue;
    const l = sectionLines[i];
    if (isAddressLike(l)) addressLines.push(l);
    else if (addressLines.length > 0 && l && !isProbablyPhone(l) && i < pcLineIdx && l.split(/\s+/).length <= 8) {
      // Continuation of the previous address line (e.g. unit / PO box).
      addressLines[addressLines.length - 1] += ', ' + l;
    }
  }

  // Compose a single address string (street + suburb + state + postcode).
  let addressStr: string | null = null;
  if (addressLines.length > 0) {
    const parts = [...addressLines];
    if (suburb) parts.push(suburb);
    if (state) parts.push(state);
    if (postcode) parts.push(postcode);
    addressStr = parts.join(', ');
  } else if (suburb || state || postcode) {
    const meta = [suburb, state, postcode].filter(Boolean).join(' ');
    addressStr = meta || null;
  }

  // Name: first name-like line in the section before the address lines.
  let name: string | null = null;
  for (let i = 0; i < sectionLines.length; i++) {
    if (pcLineIdx >= 0 && i >= pcLineIdx) break;
    const l = sectionLines[i];
    if (!l || isAddressLike(l) || isProbablyPhone(l)) continue;
    if (isNameLike(l)) {
      name = l;
      break;
    }
  }

  return {
    trackingNumber,
    carrierKey,
    name,
    addressLines: addressStr ? [addressStr] : [],
    postcode,
    state,
    suburb,
    phone,
  };
}
