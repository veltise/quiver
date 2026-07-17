import { describe, it, expect } from 'vitest';
import { buildEffectiveHeaders, buildBody } from './request';

describe('buildEffectiveHeaders — auth', () => {
  it('adds a Bearer Authorization header', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'bearer', token: 'abc123' } });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Authorization', value: 'Bearer abc123' }));
  });

  it('adds nothing for bearer auth with no token', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'bearer' } });
    expect(headers.some((h) => h.key === 'Authorization')).toBe(false);
  });

  it('adds a Basic Authorization header, base64-encoded as user:pass', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'basic', username: 'alice', password: 'hunter2' } });
    const expected = `Basic ${btoa('alice:hunter2')}`;
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Authorization', value: expected }));
  });

  it('still encodes Basic auth with empty username/password rather than skipping it', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'basic' } });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Authorization', value: `Basic ${btoa(':')}` }));
  });

  it('adds an API-key header under its own custom key name, not Authorization', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'apikey', key: 'X-API-Key', value: 'secret-key' } });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'X-API-Key', value: 'secret-key' }));
    expect(headers.some((h) => h.key === 'Authorization')).toBe(false);
  });

  it('adds nothing for API-key auth with no key name set', () => {
    const headers = buildEffectiveHeaders({ auth: { type: 'apikey', value: 'secret-key' } });
    expect(headers).toHaveLength(0);
  });

  it('adds nothing when auth type is none or missing', () => {
    expect(buildEffectiveHeaders({ auth: { type: 'none' } })).toHaveLength(0);
    expect(buildEffectiveHeaders({})).toHaveLength(0);
  });
});

describe('buildEffectiveHeaders — Content-Type auto-injection', () => {
  it('adds application/json for a json body', () => {
    const headers = buildEffectiveHeaders({ bodyType: 'json' });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Content-Type', value: 'application/json' }));
  });

  it('adds application/x-www-form-urlencoded for a form body', () => {
    const headers = buildEffectiveHeaders({ bodyType: 'form' });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' }));
  });

  it('adds application/json for a graphql body', () => {
    const headers = buildEffectiveHeaders({ bodyType: 'graphql' });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Content-Type', value: 'application/json' }));
  });

  it('does not add a Content-Type for none/raw body types', () => {
    expect(buildEffectiveHeaders({ bodyType: 'none' })).toHaveLength(0);
    expect(buildEffectiveHeaders({ bodyType: 'raw' })).toHaveLength(0);
  });

  it('does not duplicate an existing Content-Type header, case-insensitively', () => {
    const headers = buildEffectiveHeaders({
      bodyType: 'json',
      headers: [{ key: 'content-type', value: 'application/vnd.custom+json' }],
    });
    const contentTypeHeaders = headers.filter((h) => h.key.toLowerCase() === 'content-type');
    expect(contentTypeHeaders).toHaveLength(1);
    expect(contentTypeHeaders[0].value).toBe('application/vnd.custom+json'); // user's value wins, not overwritten
  });

  it('combines an auto Content-Type and an auth header together', () => {
    const headers = buildEffectiveHeaders({ bodyType: 'json', auth: { type: 'bearer', token: 'xyz' } });
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Content-Type', value: 'application/json' }));
    expect(headers).toContainEqual(expect.objectContaining({ key: 'Authorization', value: 'Bearer xyz' }));
  });

  it('does not mutate the original headers array passed in', () => {
    const original = [{ key: 'X-Custom', value: '1' }];
    buildEffectiveHeaders({ headers: original, auth: { type: 'bearer', token: 'abc' } });
    expect(original).toHaveLength(1); // unchanged — buildEffectiveHeaders returns a new array
  });
});

describe('buildBody', () => {
  it('is always null for GET and HEAD, regardless of bodyType', () => {
    expect(buildBody({ method: 'GET', bodyType: 'json', body: '{"a":1}' })).toBeNull();
    expect(buildBody({ method: 'HEAD', bodyType: 'json', body: '{"a":1}' })).toBeNull();
  });

  it('is null when bodyType is none or missing', () => {
    expect(buildBody({ method: 'POST', bodyType: 'none' })).toBeNull();
    expect(buildBody({ method: 'POST' })).toBeNull();
  });

  it('form-encodes fields, dropping entries with no key', () => {
    const body = buildBody({
      method: 'POST', bodyType: 'form',
      formFields: [{ key: 'a', value: '1' }, { key: '', value: 'skipped' }, { key: 'b', value: '2' }],
    });
    expect(body).toBe('a=1&b=2');
  });

  it('URL-encodes special characters in form fields', () => {
    const body = buildBody({ method: 'POST', bodyType: 'form', formFields: [{ key: 'q', value: 'a b&c' }] });
    expect(body).toBe('q=a%20b%26c');
  });

  it('is null for a form body with no valid fields', () => {
    expect(buildBody({ method: 'POST', bodyType: 'form', formFields: [] })).toBeNull();
    expect(buildBody({ method: 'POST', bodyType: 'form', formFields: [{ key: '', value: 'x' }] })).toBeNull();
  });

  it('wraps a graphql query and parsed variables into one JSON body', () => {
    const body = buildBody({
      method: 'POST', bodyType: 'graphql',
      graphqlQuery: '{ users { id } }',
      graphqlVariables: '{"limit": 10}',
    });
    expect(JSON.parse(body)).toEqual({ query: '{ users { id } }', variables: { limit: 10 } });
  });

  it('falls back to empty variables for invalid graphql variables JSON, rather than throwing', () => {
    const body = buildBody({ method: 'POST', bodyType: 'graphql', graphqlQuery: 'query', graphqlVariables: 'not json' });
    expect(JSON.parse(body)).toEqual({ query: 'query', variables: {} });
  });

  it('returns raw/json body trimmed-checked as-is', () => {
    expect(buildBody({ method: 'POST', bodyType: 'json', body: '{"a":1}' })).toBe('{"a":1}');
    expect(buildBody({ method: 'POST', bodyType: 'raw', body: 'plain text' })).toBe('plain text');
  });

  it('is null for a whitespace-only raw/json body', () => {
    expect(buildBody({ method: 'POST', bodyType: 'json', body: '   ' })).toBeNull();
  });
});
