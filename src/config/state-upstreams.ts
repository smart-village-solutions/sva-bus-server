export const FEDERAL_STATE_CODES = [
  'BB',
  'BE',
  'BW',
  'BY',
  'HB',
  'HE',
  'HH',
  'MV',
  'NI',
  'NW',
  'RP',
  'SH',
  'SL',
  'SN',
  'ST',
  'TH',
] as const;

export type FederalStateCode = (typeof FEDERAL_STATE_CODES)[number];

export interface StateUpstream {
  readonly baseUrl: string;
  readonly apiKey: string;
}

export type StateUpstreams = Readonly<Partial<Record<FederalStateCode, StateUpstream>>>;

const knownCodes = new Set<string>(FEDERAL_STATE_CODES);

export function parseStateUpstreams(value: unknown): StateUpstreams {
  if (typeof value !== 'string') {
    throw new Error('HTTP_CLIENT_STATE_UPSTREAMS must be a JSON object');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('HTTP_CLIENT_STATE_UPSTREAMS must contain valid JSON');
  }

  if (!isPlainObject(parsed) || Object.keys(parsed).length === 0) {
    throw new Error('HTTP_CLIENT_STATE_UPSTREAMS must be a non-empty JSON object');
  }

  const result: Partial<Record<FederalStateCode, StateUpstream>> = {};
  for (const [code, entry] of Object.entries(parsed)) {
    if (!knownCodes.has(code)) {
      throw new Error(`HTTP_CLIENT_STATE_UPSTREAMS contains unknown state code ${code}`);
    }
    if (!isPlainObject(entry)) {
      throw new Error(`HTTP_CLIENT_STATE_UPSTREAMS entry ${code} must be an object`);
    }

    const entryKeys = Object.keys(entry);
    if (entryKeys.length !== 2 || !entryKeys.includes('baseUrl') || !entryKeys.includes('apiKey')) {
      throw new Error(
        `HTTP_CLIENT_STATE_UPSTREAMS entry ${code} must contain exactly baseUrl and apiKey`,
      );
    }

    const baseUrl = entry.baseUrl;
    const apiKey = entry.apiKey;
    if (typeof baseUrl !== 'string') {
      throw new Error(`HTTP_CLIENT_STATE_UPSTREAMS entry ${code} has an invalid baseUrl`);
    }
    validateOrigin(baseUrl, code);
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error(`HTTP_CLIENT_STATE_UPSTREAMS entry ${code} has an invalid apiKey`);
    }

    result[code as FederalStateCode] = Object.freeze({ baseUrl, apiKey });
  }

  return Object.freeze(result);
}

function validateOrigin(value: string, code: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`HTTP_CLIENT_STATE_UPSTREAMS entry ${code} has an invalid baseUrl`);
  }

  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== '/')
  ) {
    throw new Error(
      `HTTP_CLIENT_STATE_UPSTREAMS entry ${code} baseUrl must be an origin-only HTTPS URL`,
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
