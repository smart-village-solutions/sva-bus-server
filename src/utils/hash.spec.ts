import { hashKeyForLogging, sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('returns a 64-char lowercase hex string', () => {
    const result = sha256Hex('test');

    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same input', () => {
    expect(sha256Hex('same')).toBe(sha256Hex('same'));
  });

  it('differs for different inputs', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });
});

describe('hashKeyForLogging', () => {
  it('returns a 32-char lowercase hex string', () => {
    const result = hashKeyForLogging('cache:key');

    expect(result).toMatch(/^[a-f0-9]{32}$/);
  });

  it('is deterministic for the same input', () => {
    expect(hashKeyForLogging('same')).toBe(hashKeyForLogging('same'));
  });

  it('differs for different inputs', () => {
    expect(hashKeyForLogging('a')).not.toBe(hashKeyForLogging('b'));
  });
});
