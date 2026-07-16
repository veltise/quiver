import { describe, it, expect } from 'vitest';
import { applyEnv } from './env';

describe('applyEnv', () => {
  const vars = [{ key: 'baseUrl', value: 'https://api.example.com' }, { key: 'token', value: 'abc123' }];

  it('substitutes known variables', () => {
    expect(applyEnv('{{baseUrl}}/users', vars)).toBe('https://api.example.com/users');
  });

  it('substitutes multiple variables in one string', () => {
    expect(applyEnv('{{baseUrl}}?token={{token}}', vars)).toBe('https://api.example.com?token=abc123');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(applyEnv('{{doesNotExist}}/users', vars)).toBe('{{doesNotExist}}/users');
  });

  it('leaves plain strings with no placeholders untouched', () => {
    expect(applyEnv('https://example.com', vars)).toBe('https://example.com');
  });

  it('passes through falsy input unchanged', () => {
    expect(applyEnv('', vars)).toBe('');
    expect(applyEnv(null, vars)).toBe(null);
    expect(applyEnv(undefined, vars)).toBe(undefined);
  });
});
