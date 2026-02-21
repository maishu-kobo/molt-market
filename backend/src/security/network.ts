import { isIP } from 'node:net';

function isPrivateIpv4(hostname: string): boolean {
  if (hostname === '0.0.0.0') return true;
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('127.')) return true;
  if (hostname.startsWith('192.168.')) return true;

  if (hostname.startsWith('172.')) {
    const second = Number(hostname.split('.')[1]);
    if (Number.isInteger(second) && second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

export function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return true;

  if (normalized === 'localhost' || normalized.endsWith('.local')) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

export function isWebhookUrlAllowed(rawUrl: string, options?: {
  allowPrivateHosts?: boolean;
  allowHttp?: boolean;
}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  const allowPrivateHosts = options?.allowPrivateHosts ?? process.env.ALLOW_PRIVATE_WEBHOOK_URLS === 'true';
  const allowHttp = options?.allowHttp ?? process.env.ALLOW_HTTP_WEBHOOKS === 'true';

  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    return false;
  }

  if (!allowPrivateHosts && isPrivateHost(parsed.hostname)) {
    return false;
  }

  return true;
}
