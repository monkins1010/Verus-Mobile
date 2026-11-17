import axios from 'axios';
import crypto from 'crypto'
import { Platform } from 'react-native'

import { VALU_URL } from '../constants/constants';
import { randomBytes } from '../crypto/randomBytes';

// Turns an axios error into a user-facing message. The server's own message is shown for
// 4xx responses; 500s carry generic text by design, so they are not parsed.
const parseError = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data;

  if (status === 429) return "Too many requests to the Valu server. Please wait a moment and try again.";
  if (status === 503) return "The Valu service is temporarily unavailable. Please try again later.";
  if (status >= 500) return "The Valu server could not complete the request. Please try again later.";
  if (data && typeof data === 'object') {
    return data.error || data.message || error.toString();
  }
  return error?.response ? error.toString() : (error?.message || String(error));
};

const toValuError = (error) => {
  const e = new Error(parseError(error));
  e.status = error?.response?.status;
  e.code = error?.response?.data?.code;
  if (error?.response?.status === 429) e.retryAfter = error.response.headers?.["retry-after"];
  return e;
};

// Headers that tell the Valu API which network (mainnet/testnet) the wallet is on.
// The API uses these to pick the matching provider keys (MoonPay/Paybis/Stripe/Sumsub
// sandbox vs production) so a single API deployment can serve both networks.
export const VALU_NETWORK_HEADER = "x-valu-network";
export const VALU_EVM_NETWORK_HEADER = "x-valu-evm-network";

// 401 codes from the server's request signer (see docs/audit_api_va_mobile.md, section 4)
export const VALU_AUTH_CODES = Object.freeze({
  UPGRADE_REQUIRED: 'AUTH_UPGRADE_REQUIRED',
  TIMESTAMP_REQUIRED: 'AUTH_TIMESTAMP_REQUIRED',
  STALE: 'AUTH_STALE',
  NONCE_INVALID: 'AUTH_NONCE_INVALID',
  REPLAY: 'AUTH_REPLAY',
  INVALID: 'AUTH_INVALID',
  MISSING: 'AUTH_MISSING',
  CHALLENGE_INVALID: 'CHALLENGE_INVALID',
  NETWORK_MISMATCH: 'NETWORK_MISMATCH',
  LEGACY_AUTH_DISABLED: 'LEGACY_AUTH_DISABLED',
  RATE_LIMITED: 'RATE_LIMITED',
});

// Server time minus device time, in seconds. Learned from AUTH_STALE responses.
let clockOffsetSeconds = 0;

export const getClockOffsetSeconds = () => clockOffsetSeconds;

const nowSeconds = () => Math.floor(Date.now() / 1000) + clockOffsetSeconds;

// 32 hex chars, new for every request (including retries)
const createNonce = async () => (await randomBytes(16)).toString('hex');

// The exact string that is signed and sent as the body. The server rebuilds it with
// JSON.stringify(req.body), and treats an empty body as "".
const serializeBody = (method, data) => {
  if (String(method).toUpperCase() === 'GET' || data == null) return "";

  let obj = data;
  if (typeof data === 'string') {
    if (data.length === 0) return "";
    try {
      obj = JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  if (typeof obj === 'object' && !Array.isArray(obj) && Object.keys(obj).length === 0) return "";
  return JSON.stringify(obj);
};

export const signValuRequest = async (method, fullUrl, bodyString, apiKey, apiSecret) => {
  const nonce = await createNonce();
  const timestamp = String(nowSeconds());
  const body = String(method).toUpperCase() !== 'GET' ? bodyString : '';
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(`${timestamp}.${nonce}.${fullUrl}${body}`)
    .digest('hex');

  return {
    'x-api-key': apiKey,
    'x-api-timestamp': timestamp,
    'x-api-nonce': nonce,
    'x-api-signature': signature,
  };
};

class ValuService {
  /**
   * @param {string} url
   * @param {import('axios').AxiosInstance} service
   * @param {() => {network: string, evmNetwork: string}} getNetworkContext
   * @param {{
   *   getCredentials: (network: string) => Promise<{apiKey: string, apiSecret: string}>,
   *   onCredentialsRejected: (network: string, code: string) => Promise<void>,
   * }} auth
   */
  constructor(url, service, getNetworkContext = null, auth = null) {
    this.url = url;
    this.service = service;
    this.getNetworkContext = getNetworkContext;
    this.auth = auth;

    // Plain client for the unauthenticated login endpoints
    this.loginService = axios.create({
      baseURL: url,
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });
    this.loginService.interceptors.request.use((config) => {
      config.headers = { ...config.headers, ...this.networkHeaders() };
      return config;
    });

    // Every other call goes through the signer
    this.service.interceptors.request.use(
      (config) => this.signConfig(config),
      (error) => Promise.reject(error)
    );
    this.service.interceptors.response.use(
      (response) => response,
      (error) => this.handleAuthFailure(error)
    );
  }

  static build(getNetworkContext = null, auth = null) {
    const service = axios.create({
      baseURL: VALU_URL,
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    return new ValuService(VALU_URL, service, getNetworkContext, auth);
  }

  networkHeaders() {
    const context = this.getNetworkContext ? this.getNetworkContext() : null;
    if (context == null) return {};

    return {
      [VALU_NETWORK_HEADER]: context.network,
      [VALU_EVM_NETWORK_HEADER]: context.evmNetwork,
    };
  }

  currentNetwork() {
    const context = this.getNetworkContext ? this.getNetworkContext() : null;
    return context ? context.network : null;
  }

  fullUrl(config) {
    let uri = axios.getUri(config);
    if (uri.substr(0, 4) !== "http") {
      uri = (config.baseURL || this.url).replace(/\/+$/, "") + uri;
    }
    return uri;
  }

  async signConfig(config) {
    if (this.auth == null) throw new Error("Valu API client has no credential provider");

    const network = this.currentNetwork();
    const { apiKey, apiSecret } = await this.auth.getCredentials(network);

    // Serialise once, sign that string, and send the same string
    const bodyString = serializeBody(config.method, config.data);
    if (String(config.method).toUpperCase() !== 'GET') {
      config.data = bodyString.length > 0 ? bodyString : undefined;
    }

    config.headers = {
      ...config.headers,
      ...this.networkHeaders(),
      ...await signValuRequest(config.method, this.fullUrl(config), bodyString, apiKey, apiSecret),
    };
    config.valuNetwork = network;

    return config;
  }

  // Handles the 401/409/410 codes from section 4 of the audit brief, with at most one retry.
  async handleAuthFailure(error) {
    const response = error?.response;
    const config = error?.config;
    const code = response?.data?.code;

    if (response == null || config == null || config.valuRetried) {
      return Promise.reject(error);
    }

    const network = config.valuNetwork || this.currentNetwork();
    let retry = false;

    if (response.status === 401) {
      switch (code) {
        case VALU_AUTH_CODES.STALE: {
          const serverDate = Date.parse(response.headers?.date);
          if (!Number.isNaN(serverDate)) {
            clockOffsetSeconds = Math.round((serverDate - Date.now()) / 1000);
          }
          retry = true;
          break;
        }
        case VALU_AUTH_CODES.REPLAY:
          retry = true;
          break;
        case VALU_AUTH_CODES.UPGRADE_REQUIRED:
        case VALU_AUTH_CODES.INVALID:
          // Stored credentials are stale or were never upgraded: run the wallet login again
          await this.auth.onCredentialsRejected(network, code);
          retry = true;
          break;
        default:
          // AUTH_TIMESTAMP_REQUIRED / AUTH_NONCE_INVALID / AUTH_MISSING are signer bugs
          console.warn(`Valu API rejected a signed request: ${code || 'unknown'}`);
      }
    } else if (response.status === 409 && code === VALU_AUTH_CODES.NETWORK_MISMATCH) {
      // The stored key belongs to the other network; get credentials for this one
      await this.auth.onCredentialsRejected(network, code);
      retry = true;
    } else if (response.status === 410 && code === VALU_AUTH_CODES.LEGACY_AUTH_DISABLED) {
      await this.auth.onCredentialsRejected(network, code);
      retry = true;
    }

    if (!retry) return Promise.reject(error);

    // Re-runs the request interceptor: new timestamp, new nonce, current credentials
    return this.service.request({ ...config, valuRetried: true });
  }

  static formatCall = async (call) => {
    try {
      const { data } = await call();
      return data;
    } catch (error) {
      throw toValuError(error);
    }
  };

  static formatUploadUri = (uri) => {
    return Platform.OS === "android" ? uri : uri.replace("file://", "");
  };

  // ── Wallet login (unauthenticated) ────────────────────────────────────────────

  // Step 1: one-time challenge, valid for 5 minutes
  requestLoginChallenge = async (network) => {
    return await ValuService.formatCall(() => {
      return this.loginService.post(`${this.url}/sessions/auth/challenge`, { network }, {
        headers: { [VALU_NETWORK_HEADER]: network },
      });
    });
  };

  // Step 2: exchange the wallet-signed challenge for apiKey + apiSecret
  submitWalletLogin = async (network, requestB64) => {
    return await ValuService.formatCall(() => {
      return this.loginService.post(`${this.url}/sessions/auth/wallet`, { network, request: requestB64 }, {
        headers: { [VALU_NETWORK_HEADER]: network },
      });
    });
  };

  // Challenge for /attestation-status, tied to the api key, reusable for 10 minutes
  getAuthChallenge = async (purpose) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/auth/challenge`, { purpose });
    });
  };

  getOnRampURL = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/onramp/getonrampsession`, payload);
    });
  };

  // Outcome of an onramp order: { outcome: 'paid' | 'pending' | 'not_paid' | 'failed' }
  getOnRampStatus = async (requestId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/onramp/status/${encodeURIComponent(requestId)}`);
    });
  };

  getOffRampURL = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/offramp/getofframpsession`, payload);
    });
  };

  getAttestationPaymentStatus = async (signedRequest) => {
    
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/attestation-status`,signedRequest);
    });
  };

  getAttestationPaymentURL = async () => {

    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/attestation-payment`);
    });
  };

  retryAttestationPayment = async (signedRequest) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/attestation-retry-new-payment`,signedRequest);
    });
  };

  getValuIdDeepLink = async (payload = {}) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/valu-id-deeplink`, payload);
    });
  };

  getValuAttestationStatus = async (address) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/get-attestation`,address);
    });
  };

  getOnRampOptions = async (taxCountry) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/onramp/getonrampoptions`, taxCountry);
    });
  };

  getOffRampOptions = async (taxCountry) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/offramp/getofframpoptions`, taxCountry);
    });
  };


  createAccount = async (valuAccount) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/accounts`, valuAccount);
    }, true);
  };

  getAccount = async (id) => {   
    const account = await ValuService.formatCall(() => {
      return this.service.get(`/accounts/${id}`);
    }, true);

    return account
  };

  getPaymentMethod = async (id) => {
    return await ValuService.formatCall(() => {
      return this.service.get(`/paymentMethod/${id}`);
    }, true);
  };

  updateAccount = async (id, updateObj) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/accounts/${id}`, updateObj);
    }, true);
  };


  createPaymentMethod = async (paymentMethod) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/paymentMethods`, paymentMethod);
    }, true);
  };

  deletePaymentMethod = async (paymentMethod) => {
    return await ValuService.formatCall(() => {
      return this.service.delete(`${this.url}/paymentMethod/${paymentMethod.id}`);
    }, true);
  };

  listPaymentMethods = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get("/paymentMethods");
    }, true);
  };

  createTransfer = async (
    source,
    sourceCurrency,
    sourceAmount,
    dest,
    destCurrency,
    message,
    autoConfirm,
    amountIncludesFees = false
  ) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/transfers`, {
        source,
        sourceCurrency,
        sourceAmount,
        dest,
        destCurrency,
        message: message == null ? "" : message,
        autoConfirm,
        amountIncludesFees
      });
    }, true);
  };

  confirmTransfer = async (transferId) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/transfers/${transferId}/confirm`);
    }, true);
  };

  getTransferInstructions = async (transferId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(`/transfer/${transferId}`);
    }, true);
  }

  getTransferHistory = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get("/transfers");
    }, true);
  };

  getTransfer = async (transferId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(`/transfers/${transferId}`);
    }, true);
  };

  getRates = async (mode = "PRICED") => {
    const oneTimeService = axios.create({
      baseURL: this.url,
      headers: {
        "Content-Type": "application/json",
        ...this.networkHeaders(),
      },
    });

    return await ValuService.formatCall(() => {
      return oneTimeService.get(`/rates?as=${mode}`);
    });
  };

  getSupportedCountries = async () => {
    const oneTimeService = axios.create({
      baseURL: this.url,
      headers: {
        "Content-Type": "application/json",
        ...this.networkHeaders(),
      },
    });

    return await ValuService.formatCall(() => {
      return oneTimeService.get("/widget/supportedCountries");
    });
  };

  authenticateRegisteredUser = async (email, password) => {
    return await ValuService.formatCall(() => {
      return this.service.post("/authenticateRegisteredUser");
    });
  }

  checkIdentityAvailable = async (identityName) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/check-identity-available`, {
        identityName: identityName
      });
    });
  }

  // returns the login consent request
  provisionIdentityRequest = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/provision-identity-request`, payload);
    });
  }

  startSumsubSession = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/start-sumsub-session`, payload);
    });
  }

  // Check if user is eligible for Proof of Personhood after completing KYC
  // Uses x-api-key header to identify user and check Paybis KYC status
  checkPopEligibility = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/check-pop-eligibility`, payload);
    });
  }

  // Claim sponsored Proof of Personhood attestation for a specific identity
  // Sends the selected identity address to backend to issue the attestation
  claimSponsoredAttestation = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/claim-sponsored-attestation`, payload);
    });
  }

  // Initiate an Apple In-App Purchase session
  // Creates a pending payment record on the server and returns an invoice number
  initiateIAPSession = async () => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/attestation-iap-initiate`);
    });
  }

  // Confirm an Apple In-App Purchase payment
  // Verifies the transaction receipt with Apple and marks payment as complete
  confirmIAPPayment = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/attestation-iap-confirm`, payload);
    });
  }

  // ── USDC → vUSDC onramp ──────────────────────────────────────────────────────

  // Get the active network and USDC contract address for the onramp
  getUsdcDepositInfo = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/onramp/usdc-to-verus/deposit-info`);
    });
  };

  // Register a new USDC → vUSDC conversion; returns conversionId + uniquePaymentAddress
  initiateUsdcToVerus = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/onramp/initiate-usdc-to-verus`, payload);
    });
  };

  // Poll a conversion's status by conversionId
  getUsdcConversionStatus = async (conversionId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(
        `${this.url}/onramp/usdc-to-verus/status/${conversionId}`,
      );
    });
  };

  // Returns all PENDING / PROCESSING conversions for the authenticated user
  getActiveUsdcConversions = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/onramp/usdc-to-verus/active`);
    });
  };

  // Returns the last 50 conversions (all statuses) for the authenticated user
  getUsdcConversionHistory = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/onramp/usdc-to-verus/history`);
    });
  };

  // ── Part A: vUSDC → EVM USDC (offramp from Verus) ────────────────────────────

  // Discover the active network and the server's permanent Verus deposit address
  getVerusToEvmDepositInfo = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/offramp/verus-to-evm/deposit-info`);
    });
  };

  // Register a new vUSDC → USDC conversion; returns conversionId + verusDepositAddress
  initiateVerusToEvmOfframp = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/offramp/verus-to-evm/initiate`, payload);
    });
  };

  // Poll conversion status by conversionId
  getVerusToEvmStatus = async (conversionId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(
        `${this.url}/offramp/verus-to-evm/status/${conversionId}`,
      );
    });
  };

  // Returns all non-final conversions for crash-recovery
  getActiveVerusToEvmConversions = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/offramp/verus-to-evm/active`);
    });
  };

  // Returns the last 50 conversions (all statuses)
  getVerusToEvmHistory = async () => {
    return await ValuService.formatCall(() => {
      return this.service.get(`${this.url}/offramp/verus-to-evm/history`);
    });
  };

  // ── Part B: EVM USDC → Fiat (Paybis cashout) ─────────────────────────────────

  // Fetch available cashout options for a given country and USDC amount
  getEvmToFiatOptions = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/offramp/evm-to-fiat/options`, payload);
    });
  };

  // Initiate a Paybis cashout session; returns requestId + widgetUrl
  initiateEvmToFiat = async (payload) => {
    return await ValuService.formatCall(() => {
      return this.service.post(`${this.url}/offramp/evm-to-fiat/initiate`, payload);
    });
  };

  // Poll until the Paybis deposit address + amount are ready
  getEvmToFiatPaymentDetails = async (requestId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(
        `${this.url}/offramp/evm-to-fiat/payment-details/${requestId}`,
      );
    });
  };

  // Poll cashout status by requestId
  getEvmToFiatStatus = async (requestId) => {
    return await ValuService.formatCall(() => {
      return this.service.get(
        `${this.url}/offramp/evm-to-fiat/status/${requestId}`,
      );
    });
  };
}

export default ValuService;
