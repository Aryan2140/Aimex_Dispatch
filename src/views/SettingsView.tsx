import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, KeyRound, CheckCircle2, AlertCircle, Loader2, Truck, Info } from 'lucide-react';
import { trackShipment, isConfiguredNote, type TrackResult } from '../lib/carrierTrack';
import { useAuth } from '../lib/auth';

type CarrierCheck = {
  key: string;
  name: string;
  envVars: string[];
  required: string[];
};

const CARRIERS: CarrierCheck[] = [
  { key: 'australia_post', name: 'Australia Post', envVars: ['AUSPOST_API_KEY', 'AUSPOST_API_PASSWORD', 'AUSPOST_ACCOUNT_NUMBER'], required: ['AUSPOST_API_KEY', 'AUSPOST_API_PASSWORD'] },
  { key: 'couriers_please', name: 'Couriers Please', envVars: ['CP_API_KEY', 'CP_API_PASSWORD'], required: ['CP_API_KEY', 'CP_API_PASSWORD'] },
];

export default function SettingsView() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [checks, setChecks] = useState<Record<string, TrackResult | null>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Probe the carrier-track edge function with a sample tracking number for each carrier.
  // The function returns a "not configured" note in its body when the env secrets are missing,
  // so we use that to show status without ever exposing the secret values.
  async function check(carrier: CarrierCheck) {
    setBusy((b) => ({ ...b, [carrier.key]: true }));
    try {
      const result = await trackShipment(carrier.key, 'TEST0000');
      setChecks((c) => ({ ...c, [carrier.key]: result }));
    } catch (err) {
      setChecks((c) => ({ ...c, [carrier.key]: {
        carrier: carrier.name, trackingNumber: 'TEST0000', status: `error: ${(err as Error).message}`, events: [],
      }}));
    } finally {
      setBusy((b) => ({ ...b, [carrier.key]: false }));
    }
  }

  useEffect(() => {
    CARRIERS.forEach((c) => check(c));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-slate-500" />
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
      </div>

      {isAdmin && (
        <div className="card border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-blue-600" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold">Your account is an admin</p>
              <p className="text-sm text-blue-700">You can manage products and add more users have them sign up with their own email.</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h2 className="label mb-2 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Carrier API keys</h2>
        <div className="space-y-3">
          {CARRIERS.map((c) => {
            const result = checks[c.key];
            const isBusy = busy[c.key];
            const configured = result ? isConfiguredNote(result.note) : false;
            return (
              <div key={c.key} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <Truck className="mt-0.5 h-5 w-5 text-slate-400" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                      <div className="mt-1 text-xs text-slate-500">Required server environment variables:</div>
                      <ul className="mt-1 space-y-0.5">
                        {c.envVars.map((v) => (
                          <li key={v} className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                            <span className={`h-1.5 w-1.5 rounded-full ${c.required.includes(v) ? 'bg-blue-500' : 'bg-slate-300'}`} />
                            {v}{c.required.includes(v) ? '' : ' (optional)'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isBusy ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                      : configured ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      : result ? <AlertCircle className="h-5 w-5 text-amber-500" /> : null}
                  </div>
                </div>
                <div className="mt-2">
                  {result && (
                    <span className={`badge ${configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {configured ? 'Configured' : 'Not configured'}
                    </span>
                  )}
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500">
                  {isAdmin
                    ? <>Add the keys above as Supabase Edge Function secrets, then tap “Re-check”. Note: tracking APIs return shipment <em>status</em> only. Customer name and order items must always be entered manually.</>
                    : <>Ask the administrator to set the carrier API keys on the server.</>}
                </div>
                <button onClick={() => check(c)} disabled={isBusy} className="btn-secondary mt-3 h-8 text-xs">
                  {isBusy ? 'Checking…' : 'Re-check'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">About label scanning</h2>
        <p className="text-sm text-slate-500">
          Photograph the shipping label to keep it as evidence against the order. The carrier is auto-detected from the tracking-number format you enter. Carrier Tracking APIs only return shipment status — never the customer name, address, or item quantities — so those fields are captured manually from the product search.
        </p>
      </div>
    </div>
  );
}
