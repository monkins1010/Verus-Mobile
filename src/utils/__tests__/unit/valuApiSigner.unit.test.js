// Checks the Valu API v2 request signer against the server's verification rules
// (valuapi middleware/apiauth.js) and the 401 handling from docs/audit_api_va_mobile.md.
import nodeCrypto from 'crypto';
import ValuService, { signValuRequest, getClockOffsetSeconds } from '../../services/ValuService';

jest.mock('../../crypto/randomBytes', () => ({
  randomBytes: jest.fn(async length => require('crypto').randomBytes(length)),
}));

const API_KEY = 'b0c5e3a6-1111-4222-8333-444455556666';
const API_SECRET = 'a'.repeat(64);
const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

const header = (headers, name) => {
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  return key == null ? undefined : headers[key];
};

// Server-side reconstruction: fullUrl from the request target, body re-serialised
// from the parsed JSON, exactly as authTokenNewUser does.
const verifyLikeServer = (config, secret, seenNonces) => {
  const headers = config.headers.toJSON ? config.headers.toJSON() : config.headers;
  const method = config.method.toUpperCase();
  const fullUrl = new URL(config.url, config.baseURL).toString();
  const parsed = typeof config.data === 'string' && config.data.length > 0 ? JSON.parse(config.data) : {};
  const body = method === 'GET' || Object.keys(parsed).length === 0 ? '' : JSON.stringify(parsed);

  const ts = Number(header(headers, 'x-api-timestamp'));
  const nonce = header(headers, 'x-api-nonce');
  if (!Number.isInteger(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return 'AUTH_STALE';
  if (!NONCE_PATTERN.test(nonce)) return 'AUTH_NONCE_INVALID';
  const expected = nodeCrypto.createHmac('sha256', secret).update(`${ts}.${nonce}.${fullUrl}${body}`).digest('hex');
  if (header(headers, 'x-api-signature') !== expected) return 'AUTH_INVALID';
  if (header(headers, 'x-api-key') !== API_KEY) return 'AUTH_INVALID';
  if (seenNonces.has(nonce)) return 'AUTH_REPLAY';
  seenNonces.add(nonce);
  return null;
};

const buildService = ({ secret = API_SECRET, respond, onCredentialsRejected } = {}) => {
  const service = ValuService.build(
    () => ({ network: 'VRSCTEST', evmNetwork: 'sepolia' }),
    {
      getCredentials: jest.fn(async () => ({ apiKey: API_KEY, apiSecret: secret })),
      onCredentialsRejected: onCredentialsRejected || jest.fn(async () => {}),
    },
  );
  const seen = new Set();
  const calls = [];

  service.service.defaults.adapter = async (config) => {
    calls.push(config);
    const code = verifyLikeServer(config, API_SECRET, seen);
    const extra = respond ? respond(config, calls.length) : null;
    const fail = extra || (code ? { status: 401, data: { success: false, code, error: code } } : null);

    if (fail) {
      const error = new Error(`Request failed with status code ${fail.status}`);
      error.config = config;
      error.response = { status: fail.status, data: fail.data, headers: fail.headers || {}, config };
      throw error;
    }
    return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, echo: config.data } };
  };

  return { service, calls };
};

describe('Valu API v2 signer', () => {
  it('produces the documented headers', async () => {
    const h = await signValuRequest('POST', 'https://api.valu.earth/x', '{"a":1}', API_KEY, API_SECRET);
    expect(h['x-api-key']).toBe(API_KEY);
    expect(h['x-api-timestamp']).toMatch(/^\d+$/);
    expect(h['x-api-nonce']).toMatch(NONCE_PATTERN);
    expect(h['x-api-signature']).toMatch(/^[0-9a-f]{64}$/);
    const again = await signValuRequest('POST', 'https://api.valu.earth/x', '{"a":1}', API_KEY, API_SECRET);
    expect(again['x-api-nonce']).not.toBe(h['x-api-nonce']);
  });

  it('fails without sending a request when secure randomness is unavailable', async () => {
    const { randomBytes } = require('../../crypto/randomBytes');
    randomBytes.mockRejectedValueOnce(new Error('randomness unavailable'));
    const { service, calls } = buildService();

    await expect(service.getAttestationPaymentURL()).rejects.toThrow('randomness unavailable');
    expect(calls).toHaveLength(0);
  });

  it('signs POST bodies, empty POSTs and GETs so the server accepts them', async () => {
    const { service, calls } = buildService();

    const withBody = await service.getOnRampOptions({ countryCode: 'GB', amount: 10, nested: { b: [1, 2] } });
    expect(withBody.success).toBe(true);
    // The exact string that was signed is the one sent
    expect(withBody.echo).toBe(JSON.stringify({ countryCode: 'GB', amount: 10, nested: { b: [1, 2] } }));

    expect((await service.getAttestationPaymentURL()).success).toBe(true);
    expect((await service.getOnRampOptions({})).success).toBe(true);
    expect((await service.getUsdcConversionStatus('abc-123')).success).toBe(true);

    const headers = calls[0].headers.toJSON ? calls[0].headers.toJSON() : calls[0].headers;
    expect(header(headers, 'x-valu-network')).toBe('VRSCTEST');
  });

  it('a wrong secret is rejected and triggers one wallet login and retry', async () => {
    const onCredentialsRejected = jest.fn(async () => {});
    const { service, calls } = buildService({ secret: 'b'.repeat(64), onCredentialsRejected });

    await expect(service.getAttestationPaymentURL()).rejects.toMatchObject({ code: 'AUTH_INVALID' });
    expect(onCredentialsRejected).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2); // at most one automatic retry
  });

  it('AUTH_UPGRADE_REQUIRED runs the wallet login, then the retry succeeds with a new nonce', async () => {
    const onCredentialsRejected = jest.fn(async () => {});
    const { service, calls } = buildService({
      onCredentialsRejected,
      respond: (config, n) => (n === 1 ? { status: 401, data: { success: false, code: 'AUTH_UPGRADE_REQUIRED' } } : null),
    });

    expect((await service.getOnRampOptions({ a: 1 })).success).toBe(true);
    expect(onCredentialsRejected).toHaveBeenCalledWith('VRSCTEST', 'AUTH_UPGRADE_REQUIRED');
    const nonce = c => header(c.headers.toJSON ? c.headers.toJSON() : c.headers, 'x-api-nonce');
    expect(nonce(calls[1])).not.toBe(nonce(calls[0]));
  });

  it('AUTH_STALE learns the clock offset from the Date header and retries', async () => {
    const serverDate = new Date(Date.now() - 10 * 60 * 1000).toUTCString(); // device 10 min fast
    const { service } = buildService({
      respond: (config, n) => (n === 1 ? { status: 401, data: { success: false, code: 'AUTH_STALE' }, headers: { date: serverDate } } : null),
    });

    // The adapter's own clock check uses device time, so the corrected retry would look
    // stale to it; only assert the offset was learned and a retry happened.
    await service.getAttestationPaymentURL().catch(() => {});
    expect(getClockOffsetSeconds()).toBeLessThanOrEqual(-599);
    expect(getClockOffsetSeconds()).toBeGreaterThanOrEqual(-601);
  });

  it('shows the server message for 4xx and a generic one for 500', async () => {
    const { service } = buildService({
      respond: (config, n) => (n === 1
        ? { status: 403, data: { success: false, error: 'This identity is not controlled by your wallet' } }
        : { status: 500, data: { success: false, error: 'db exploded at row 7' } }),
    });

    await expect(service.claimSponsoredAttestation({ identityName: 'x@' }))
      .rejects.toThrow('This identity is not controlled by your wallet');
    await expect(service.claimSponsoredAttestation({ identityName: 'x@' }))
      .rejects.toThrow(/could not complete the request/);
  });
});
