import { api } from './api';

export type TrackResult = {
  carrier: string;
  trackingNumber: string;
  status: string | null;
  events: Array<{ status?: string; description?: string; location?: string; date?: string }>;
  receiverSuburb?: string | null;
  receiverPostcode?: string | null;
  note?: string;
};

export async function trackShipment(carrier: string, trackingNumber: string): Promise<TrackResult> {
  return api.track.shipment(carrier, trackingNumber);
}

export function isConfiguredNote(note?: string): boolean {
  return !note || !note.includes('not configured');
}
