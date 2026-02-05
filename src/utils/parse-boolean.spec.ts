import { parseBoolean } from './parse-boolean';

describe('parseBoolean', () => {
  it('returns true for boolean true', () => {
    expect(parseBoolean(true)).toBe(true);
  });

  it('returns false for boolean false', () => {
    expect(parseBoolean(false)).toBe(false);
  });

  it('returns true for truthy string variants', () => {
    expect(parseBoolean('true')).toBe(true);
    expect(parseBoolean('1')).toBe(true);
    expect(parseBoolean('yes')).toBe(true);
    expect(parseBoolean('y')).toBe(true);
    expect(parseBoolean('on')).toBe(true);
    expect(parseBoolean('  True  ')).toBe(true);
  });

  it('returns false for falsy or unknown strings', () => {
    expect(parseBoolean('false')).toBe(false);
    expect(parseBoolean('0')).toBe(false);
    expect(parseBoolean('no')).toBe(false);
    expect(parseBoolean('off')).toBe(false);
    expect(parseBoolean('')).toBe(false);
    expect(parseBoolean('random')).toBe(false);
  });

  it('returns false for non-string non-boolean values', () => {
    expect(parseBoolean(undefined)).toBe(false);
    expect(parseBoolean(null)).toBe(false);
    expect(parseBoolean(1)).toBe(false);
    expect(parseBoolean(0)).toBe(false);
    expect(parseBoolean({})).toBe(false);
  });
});
