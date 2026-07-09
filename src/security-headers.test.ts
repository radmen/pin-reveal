import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const nginxConfig = readFileSync(
  join(projectRoot, 'config', 'nginx.conf.erb'),
  'utf8'
);

const contentSecurityPolicyDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'"
];

const deniedPermissionsPolicyDirectives = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'bluetooth=()',
  'browsing-topics=()',
  'camera=()',
  'clipboard-read=()',
  'clipboard-write=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=()',
  'gamepad=()',
  'geolocation=()',
  'gyroscope=()',
  'hid=()',
  'identity-credentials-get=()',
  'idle-detection=()',
  'local-fonts=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'otp-credentials=()',
  'payment=()',
  'picture-in-picture=()',
  'screen-wake-lock=()',
  'serial=()',
  'speaker-selection=()',
  'storage-access=()',
  'usb=()',
  'web-share=()',
  'window-management=()',
  'xr-spatial-tracking=()'
];

function expectHeader(headerName: string, expectedValue: string): void {
  expect(nginxConfig).toContain(
    `add_header ${headerName} "${expectedValue}" always;`
  );
}

function expectPolicyDirectives(directives: string[]): void {
  for (const directive of directives) {
    expect(nginxConfig).toContain(directive);
  }
}

describe('static deployment security headers', (): void => {
  it('sends a restrictive content security policy on every response', (): void => {
    expectHeader('Content-Security-Policy', '<%= content_security_policy %>');
    expectPolicyDirectives(contentSecurityPolicyDirectives);
  });

  it('sends browser hardening headers on every response', (): void => {
    expectHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains'
    );
    expectHeader('X-Frame-Options', 'DENY');
    expectHeader('X-Content-Type-Options', 'nosniff');
    expectHeader('Referrer-Policy', 'no-referrer');
    expectHeader('Permissions-Policy', '<%= permissions_policy %>');
    expectPolicyDirectives(deniedPermissionsPolicyDirectives);
    expectPolicyDirectives([
      'publickey-credentials-create=(self)',
      'publickey-credentials-get=(self)'
    ]);
  });
});
