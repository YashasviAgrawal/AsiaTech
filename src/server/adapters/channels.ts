import 'server-only';

/**
 * OTA connectivity behind one interface. "mock" (default) accepts every update except when the listing is
 * blocked (e.g. Booking.com "Parked business"), so the sync log, retries and alerts can be seen working.
 * "channex" sends ARI to the Channex channel API, which fans out to Booking.com, Expedia, Airbnb and 78+ OTAs.
 * MakeMyTrip / Goibibo connect through the hotel code + access token the hotel shares from the InGo-MMT extranet.
 */
export interface AriUpdate {
  kind: 'availability' | 'rates' | 'restrictions' | 'promotion' | 'listing';
  hotelCode: string | null;
  values: Record<string, unknown>[];
}

export interface PushResult {
  ok: boolean;
  message: string;
  retryable?: boolean;
}

export interface ChannelContext {
  ota: string;
  hotelCode: string | null;
  listingStatus: string;
  credentials: Record<string, string>;
}

async function mockPush(channel: ChannelContext, update: AriUpdate): Promise<PushResult> {
  await new Promise((r) => setTimeout(r, 30));
  if (['parked_business', 'closed', 'suspended'].includes(channel.listingStatus)) {
    return { ok: false, message: `Listing is ${channel.listingStatus.replace('_', ' ')}. Updates are not accepted.`, retryable: true };
  }
  return { ok: true, message: `Accepted ${update.values.length} ${update.kind} value(s)` };
}

async function channexPush(channel: ChannelContext, update: AriUpdate): Promise<PushResult> {
  const apiKey = process.env.CHANNEX_API_KEY ?? channel.credentials.apiKey;
  if (!apiKey) return { ok: false, message: 'Channex API key missing', retryable: false };
  const endpoint = update.kind === 'availability' ? 'availability' : 'restrictions';
  const response = await fetch(`https://app.channex.io/api/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'user-api-key': apiKey },
    body: JSON.stringify({ values: update.values }),
  });
  if (!response.ok) return { ok: false, message: `Channex ${response.status}: ${(await response.text()).slice(0, 200)}`, retryable: response.status >= 500 };
  return { ok: true, message: 'Accepted by Channex' };
}

export async function pushToChannel(channel: ChannelContext, update: AriUpdate): Promise<PushResult> {
  const provider = process.env.CHANNEL_PROVIDER ?? 'mock';
  try {
    return provider === 'channex' ? await channexPush(channel, update) : await mockPush(channel, update);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Network error', retryable: true };
  }
}

/** Ask the OTA for the current listing health (mock: a fixed listing becomes "open"). */
export async function checkListing(channel: ChannelContext & { fixRequested?: boolean }): Promise<{ status: 'open' | 'closed' | 'parked_business' | 'suspended' | 'unknown'; message: string | null }> {
  if ((process.env.CHANNEL_PROVIDER ?? 'mock') === 'mock') {
    if (channel.fixRequested) return { status: 'open', message: null };
    return { status: (channel.listingStatus as 'open') ?? 'unknown', message: null };
  }
  return { status: 'unknown', message: 'Check the extranet for listing status' };
}
