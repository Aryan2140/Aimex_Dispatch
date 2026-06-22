// Detect a dispatch provider from a tracking number format.
// Sources: AusPost article/tracking number formats; CP consignment format (CP + digits).
export function detectProviderFromTracking(tn: string): string | null {
  const s = (tn || '').trim().toUpperCase();
  if (!s) return null;
  // Australia Post: classic format starts with a letter, then 9 digits, then "AU"
  if (/^[A-Z]\d{9}AU$/.test(s)) return 'australia_post';
  // AusPost 24-digit / 30-digit shipment IDs
  if (/^\d{24}$/.test(s) || /^\d{30}$/.test(s)) return 'australia_post';
  // StarTrack (owned by AusPost): starts with "ST" + digits
  if (/^ST\d{9,13}$/.test(s)) return 'startrack';
  // Couriers Please: begins with "CP" followed by digits, or "CPH"
  if (/^CP[H]?\d{6,}$/.test(s)) return 'couriers_please';
  // Toll: TOLL / IPEC reference
  if (/^(TOLL|IPEC)/.test(s)) return 'toll';
  // Fastway/Aramex: usually starts with "F" + alphanumeric
  if (/^F[A-Z0-9]{8,}$/.test(s)) return 'fastway';
  // DHL
  if (/^DHL\d+$/.test(s) || /^\d{10}$/.test(s)) return 'dhl';
  // FedEx 12 or 15 or 20 digit
  if (/^\d{12}$|^\d{15}$|^\d{20}$/.test(s)) return 'fedex';
  // TNT
  if (/^(TNT|GE|CP)\d{8,}/.test(s)) return 'tnt';
  return null;
}
