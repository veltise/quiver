import { describe, it, expect } from 'vitest';
import { stripCrlf, buildHeaderMap } from './headers';

describe('stripCrlf', () => {
  it('removes carriage returns and line feeds', () => {
    expect(stripCrlf('value\r\nX-Injected: evil')).toBe('valueX-Injected: evil');
    expect(stripCrlf('a\rb\nc')).toBe('abc');
  });

  it('leaves ordinary strings untouched', () => {
    expect(stripCrlf('Bearer abc123')).toBe('Bearer abc123');
  });

  it('handles null/undefined without throwing', () => {
    expect(stripCrlf(null)).toBe('');
    expect(stripCrlf(undefined)).toBe('');
  });
});

describe('buildHeaderMap', () => {
  it('converts a headers array into a plain object', () => {
    const map = buildHeaderMap([{ key: 'Content-Type', value: 'application/json' }, { key: 'Accept', value: '*/*' }]);
    expect(map).toEqual({ 'Content-Type': 'application/json', Accept: '*/*' });
  });

  it('strips CRLF injection attempts from both keys and values', () => {
    const map = buildHeaderMap([{ key: 'X-Evil\r\nX-Injected', value: 'ok\r\nSet-Cookie: hijacked=1' }]);
    expect(Object.keys(map)).toEqual(['X-EvilX-Injected']);
    expect(map['X-EvilX-Injected']).toBe('okSet-Cookie: hijacked=1');
  });

  it('drops entries with an empty or whitespace-only key', () => {
    const map = buildHeaderMap([{ key: '  ', value: 'x' }, { key: '', value: 'y' }, { key: 'Real', value: 'z' }]);
    expect(map).toEqual({ Real: 'z' });
  });

  it('trims whitespace from keys', () => {
    const map = buildHeaderMap([{ key: '  Authorization  ', value: 'Bearer x' }]);
    expect(Object.keys(map)).toEqual(['Authorization']);
  });

  it('treats a missing value as empty string rather than throwing', () => {
    const map = buildHeaderMap([{ key: 'X-Flag' }]);
    expect(map['X-Flag']).toBe('');
  });

  it('handles an empty or missing headers array', () => {
    expect(buildHeaderMap([])).toEqual({});
    expect(buildHeaderMap(undefined)).toEqual({});
  });
});
