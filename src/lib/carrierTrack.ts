import { supabase, CARRIER_TRACK_FN } from './supabase';

export type TrackResult = {
  carrier: string;
  trackingNumber: string;
  status: string | null;
  events: { status?: string; description?: string; location?: string; date?: string }[];
  receiverSuburb?: string | null;
  receiverPostcode?: string | null;
  note?: string;
};

export async function trackShipment(carrier: string, trackingNumber: string): Promise<TrackResult> {
  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${CARRIER_TRACK_FN}`;
  const { data: session } = await supabase.auth.getSession();
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.session?.access_token ?? ''}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify({ carrier, trackingNumber }),
  });
  if (!res.ok) throw new Error(`Tracking failed (${res.status})`);
  const json = (await res.json()) as TrackResult;
  if (!json || typeof json !== 'object' || !('carrier' in json)) {
    throw new Error('Unexpected tracking response shape');
  }
  return json;
}

export function isConfiguredNote(note?: string): boolean {
  return !note || !note.includes('not configured');
}
