import { describe, it, expect } from 'vitest';
import { validateSsrfTargetUrl, isPrivateOrBlockedIp, SsrfError } from '../utils/ssrf-protection.js';

describe('SSRF Protection Security Controls', () => {
  it('identifies private, loopback, link-local, and cloud metadata IPs correctly', () => {
    // Loopback
    expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('127.0.1.5')).toBe(true);
    expect(isPrivateOrBlockedIp('::1')).toBe(true);

    // Private IPv4 ranges
    expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('10.255.255.254')).toBe(true);
    expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('172.31.255.255')).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.1.1')).toBe(true);

    // Cloud Metadata & Link-local (169.254.169.254)
    expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.1.1')).toBe(true);

    // Current network / Broadcast
    expect(isPrivateOrBlockedIp('0.0.0.0')).toBe(true);
    expect(isPrivateOrBlockedIp('255.255.255.255')).toBe(true);

    // Public IPs should NOT be blocked
    expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrBlockedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrBlockedIp('142.250.190.46')).toBe(false);
  });

  it('rejects prohibited URL protocols (file, gopher, ftp, etc.)', async () => {
    await expect(validateSsrfTargetUrl('file:///etc/passwd')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('gopher://127.0.0.1:6379/_FLUSHALL')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('ftp://example.com/file')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('javascript:alert(1)')).rejects.toThrow(SsrfError);
  });

  it('rejects loopback and internal hostname targets', async () => {
    await expect(validateSsrfTargetUrl('http://localhost:8080/api')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('http://127.0.0.1:4000/internal')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('http://metadata.google.internal/computeMetadata/v1')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('http://app.local/secret')).rejects.toThrow(SsrfError);
  });

  it('rejects AWS/GCP/Azure cloud metadata IP addresses', async () => {
    await expect(validateSsrfTargetUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(SsrfError);
    await expect(validateSsrfTargetUrl('http://169.254.169.254/computeMetadata/v1/')).rejects.toThrow(SsrfError);
  });

  it('permits valid public URLs', async () => {
    // Note: mockResponse bypasses fetch, but for real outbound URLs validateSsrfTargetUrl approves public domains
    const result = await validateSsrfTargetUrl('https://httpbin.org/get');
    expect(result.url.hostname).toBe('httpbin.org');
    expect(result.resolvedIp).toBeDefined();
    expect(isPrivateOrBlockedIp(result.resolvedIp!)).toBe(false);
  });
});
