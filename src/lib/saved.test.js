import { describe, it, expect } from 'vitest';
import { nameToSlug, stripTld, suggestName } from './saved';

describe('stripTld', () => {
  it('drops a single-label TLD', () => {
    expect(stripTld('jsonplaceholder.typicode.com')).toBe('jsonplaceholder.typicode');
    expect(stripTld('pokeapi.co')).toBe('pokeapi');
    expect(stripTld('mit.edu')).toBe('mit');
  });

  it('drops two-part public suffixes', () => {
    expect(stripTld('example.co.uk')).toBe('example');
    expect(stripTld('api.example.com.au')).toBe('api.example');
  });

  it('leaves hosts with nothing to strip alone', () => {
    expect(stripTld('localhost')).toBe('localhost');
    expect(stripTld('intranet')).toBe('intranet');
  });

  it('never truncates an IP address', () => {
    expect(stripTld('127.0.0.1')).toBe('127.0.0.1');
    expect(stripTld('192.168.1.10')).toBe('192.168.1.10');
    expect(stripTld('[::1]')).toBe('[::1]');
  });

  it('does not strip past the last remaining label', () => {
    // 'co' is a second-level suffix, but removing it would leave nothing
    expect(stripTld('co.uk')).toBe('co');
  });
});

describe('suggestName', () => {
  it('omits the HTTP method', () => {
    expect(suggestName('https://jsonplaceholder.typicode.com/posts')).toBe('jsonplaceholder.typicode');
  });

  it('strips a www prefix as well as the TLD', () => {
    expect(suggestName('https://www.example.com/a/b')).toBe('example');
  });

  it('ignores path, query and port', () => {
    expect(suggestName('https://api.github.com:8443/repos?x=1#f')).toBe('api.github');
  });

  it('returns empty string for an unparseable URL', () => {
    expect(suggestName('not a url')).toBe('');
    expect(suggestName('')).toBe('');
  });

  it('keeps localhost usable as a name', () => {
    expect(suggestName('http://localhost:3000/api')).toBe('localhost');
  });
});

describe('nameToSlug', () => {
  it('slugifies a suggested name', () => {
    expect(nameToSlug('jsonplaceholder.typicode')).toBe('jsonplaceholder-typicode');
  });

  it('trims leading and trailing separators', () => {
    expect(nameToSlug('  My Request!  ')).toBe('my-request');
  });
});
