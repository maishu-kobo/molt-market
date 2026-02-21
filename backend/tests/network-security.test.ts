import { describe, expect, it } from 'vitest';
import { isPrivateHost, isWebhookUrlAllowed } from '../src/security/network.js';

describe('network security helpers', () => {
  it('detects private hosts', () => {
    expect(isPrivateHost('localhost')).toBe(true);
    expect(isPrivateHost('127.0.0.1')).toBe(true);
    expect(isPrivateHost('10.1.2.3')).toBe(true);
    expect(isPrivateHost('172.16.5.1')).toBe(true);
    expect(isPrivateHost('192.168.1.1')).toBe(true);
    expect(isPrivateHost('::1')).toBe(true);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(isPrivateHost('example.com')).toBe(false);
  });

  it('allows only safe webhook URLs by default', () => {
    expect(isWebhookUrlAllowed('https://example.com/hook')).toBe(true);
    expect(isWebhookUrlAllowed('http://example.com/hook')).toBe(false);
    expect(isWebhookUrlAllowed('https://127.0.0.1/hook')).toBe(false);
    expect(isWebhookUrlAllowed('javascript:alert(1)')).toBe(false);
  });

  it('supports explicit override options', () => {
    expect(
      isWebhookUrlAllowed('http://127.0.0.1/hook', {
        allowHttp: true,
        allowPrivateHosts: true
      })
    ).toBe(true);
  });
});
