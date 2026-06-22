import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const AUSPOST_API_KEY = Deno.env.get("AUSPOST_API_KEY");
const AUSPOST_API_PASSWORD = Deno.env.get("AUSPOST_API_PASSWORD");
const CP_API_KEY = Deno.env.get("CP_API_KEY");
const CP_API_PASSWORD = Deno.env.get("CP_API_PASSWORD") ?? Deno.env.get("CP_API_SECRET");

type TrackResult = {
  carrier: string;
  trackingNumber: string;
  status: string | null;
  events: { status?: string; description?: string; location?: string; date?: string }[];
  receiverSuburb?: string | null;
  receiverPostcode?: string | null;
  raw?: unknown;
  // The carrier Tracking APIs never return order details (customer name/items).
  // The frontend must key those in manually.
  note?: string;
};

function notConfigured(carrier: string): TrackResult {
  return {
    carrier,
    trackingNumber: "",
    status: null,
    events: [],
    note: `${carrier} API credentials are not configured on the server. Ask the admin to add them in Settings.`,
  };
}

async function trackAuspost(trackingNumber: string): Promise<TrackResult> {
  if (!AUSPOST_API_KEY || !AUSPOST_API_PASSWORD) return notConfigured("Australia Post");
  // Australia Post Shipping & Tracking API uses HTTP Basic auth with the API key as
  // username and the user-chosen password as password.
  const basic = btoa(`${AUSPOST_API_KEY}:${AUSPOST_API_PASSWORD}`);
  const url = `https://digitalapi.auspost.com.au/track/v3/search?q=${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json",
      "Account-Number": Deno.env.get("AUSPOST_ACCOUNT_NUMBER") ?? "",
    },
  });
  const body = await res.json();
  if (!res.ok) {
    return { carrier: "Australia Post", trackingNumber, status: `error ${res.status}`, events: [], raw: body };
  }
  const t = body?.tracks?.[0] ?? body?.TrackableItems?.[0] ?? body;
  const events: TrackResult["events"] = (t?.events ?? t?.TrackEvents ?? []).map((e: any) => ({
    status: e.status ?? e.EventDescription,
    description: e.description ?? e.EventDescription,
    location: e.location ?? e.Location,
    date: e.date ?? e.EventDateTime,
  }));
  return {
    carrier: "Australia Post",
    trackingNumber,
    status: t?.status ?? t?.ConsignmentStatus ?? null,
    events,
    receiverSuburb: t?.address?.suburb ?? null,
    receiverPostcode: t?.address?.postcode ?? null,
    raw: body,
    note: "Australia Post Tracking returns shipment status only, not order items or customer name.",
  };
}

async function trackCp(trackingNumber: string): Promise<TrackResult> {
  if (!CP_API_KEY || !CP_API_PASSWORD) return notConfigured("Couriers Please");
  // CouriersPlease Tracking API: basic auth with API key + secret.
  const basic = btoa(`${CP_API_KEY}:${CP_API_PASSWORD}`);
  const url = `https://api.couriersplease.com.au/v2/track/${encodeURIComponent(trackingNumber)}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Basic ${basic}`, "Accept": "application/json" },
  });
  const body = await res.json();
  if (!res.ok) {
    return { carrier: "Couriers Please", trackingNumber, status: `error ${res.status}`, events: [], raw: body };
  }
  const cons = body?.data?.[0] ?? body?.consignments?.[0] ?? body;
  const events: TrackResult["events"] = (cons?.events ?? cons?.trackingEvents ?? []).map((e: any) => ({
    status: e.status ?? e.actionCode,
    description: e.description ?? e.actionDescription,
    location: e.location ?? e.address,
    date: e.eventDate ?? e.timestamp,
  }));
  return {
    carrier: "Couriers Please",
    trackingNumber,
    status: cons?.status ?? cons?.consignmentStatus ?? null,
    events,
    receiverSuburb: cons?.receiver?.suburb ?? cons?.address?.suburb ?? null,
    receiverPostcode: cons?.receiver?.postcode ?? cons?.address?.postcode ?? null,
    raw: body,
    note: "Couriers Please Tracking returns shipment status only, not order items or customer name.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  try {
    const { carrier, trackingNumber } = await req.json();
    if (!trackingNumber || typeof trackingNumber !== "string") {
      return new Response(JSON.stringify({ error: "trackingNumber is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let result: TrackResult;
    if (carrier === "australia_post") result = await trackAuspost(trackingNumber);
    else if (carrier === "couriers_please") result = await trackCp(trackingNumber);
    else result = { carrier: carrier ?? "unknown", trackingNumber, status: null, events: [], note: "No carrier API for this provider." };
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
