import { FEDERAL_STATE_CODES, parseStateUpstreams } from './state-upstreams';

const entry = (code: string) => ({
  baseUrl: `https://${code.toLowerCase()}.example.test`,
  apiKey: `fixture-${code.toLowerCase()}-key`,
});

describe('parseStateUpstreams', () => {
  it.each(FEDERAL_STATE_CODES)('accepts %s as a one-state subset', (code) => {
    const result = parseStateUpstreams(JSON.stringify({ [code]: entry(code) }));

    expect(result[code]).toEqual(entry(code));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[code])).toBe(true);
  });

  it('accepts a multi-state subset and leaves omitted known states unsupported', () => {
    const result = parseStateUpstreams(JSON.stringify({ BB: entry('BB'), RP: entry('RP') }));

    expect(Object.keys(result)).toEqual(['BB', 'RP']);
    expect(result.BE).toBeUndefined();
  });

  it.each([
    ['malformed JSON', '{'],
    ['non-object JSON', '[]'],
    ['empty map', '{}'],
    ['unknown code', JSON.stringify({ XX: entry('XX') })],
    ['lowercase code', JSON.stringify({ bb: entry('BB') })],
    ['non-object entry', JSON.stringify({ BB: 'invalid' })],
    ['missing field', JSON.stringify({ BB: { baseUrl: 'https://bb.example.test' } })],
    [
      'extra field',
      JSON.stringify({ BB: { ...entry('BB'), unexpected: 'value' } }),
    ],
    ['empty key', JSON.stringify({ BB: { ...entry('BB'), apiKey: '   ' } })],
    ['non-string key', JSON.stringify({ BB: { ...entry('BB'), apiKey: 123 } })],
    ['invalid URL', JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'not-a-url' } })],
    ['HTTP origin', JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'http://bb.example.test' } })],
    [
      'origin credentials',
      JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'https://user@bb.example.test' } }),
    ],
    [
      'origin query',
      JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'https://bb.example.test?x=1' } }),
    ],
    [
      'origin fragment',
      JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'https://bb.example.test#x' } }),
    ],
    [
      'origin path',
      JSON.stringify({ BB: { ...entry('BB'), baseUrl: 'https://bb.example.test/api' } }),
    ],
  ])('rejects %s without exposing fixture keys', (_name, value) => {
    expect(() => parseStateUpstreams(value)).toThrow();
    try {
      parseStateUpstreams(value);
    } catch (error) {
      expect(String(error)).not.toContain('fixture-bb-key');
    }
  });

  it('rejects non-string input', () => {
    expect(() => parseStateUpstreams(undefined)).toThrow(
      'HTTP_CLIENT_STATE_UPSTREAMS must be a JSON object',
    );
  });
});

