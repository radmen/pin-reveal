import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const distPath = join(projectRoot, 'dist');

type WebManifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }>;
};

function buildProductionApp(): void {
  execFileSync('npx', ['vite', 'build', '--emptyOutDir'], {
    cwd: projectRoot,
    stdio: 'pipe'
  });
}

function readDistFile(relativePath: string): string {
  return readFileSync(join(distPath, relativePath), 'utf8');
}

function readManifest(): WebManifest {
  return JSON.parse(readDistFile('manifest.webmanifest')) as WebManifest;
}

function assertManifestMetadata(
  manifest: WebManifest,
  indexHtml: string
): void {
  expect(manifest).toMatchObject({
    name: 'Pin Reveal',
    short_name: 'Pin Reveal',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#f8fafc'
  });

  expect(indexHtml).toContain('rel="manifest"');
  expect(indexHtml).toContain('href="/manifest.webmanifest"');
}

function assertAppleMetadata(indexHtml: string): void {
  expect(indexHtml).toContain(
    'name="apple-mobile-web-app-capable" content="yes"'
  );
  expect(indexHtml).toContain(
    'name="apple-mobile-web-app-title" content="Pin Reveal"'
  );
  expect(indexHtml).toContain('rel="apple-touch-icon"');
  expect(indexHtml).toContain('href="/icons/pin-reveal-apple-touch-icon.png"');
  expect(
    existsSync(join(distPath, 'icons/pin-reveal-apple-touch-icon.png'))
  ).toBe(true);
}

function assertServiceWorkerRegistration(
  indexHtml: string,
  registerServiceWorkerScript: string
): void {
  expect(indexHtml).toContain('src="/registerSW.js"');
  expect(registerServiceWorkerScript).toContain("'serviceWorker' in navigator");
  expect(registerServiceWorkerScript).toContain(
    "navigator.serviceWorker.register('/sw.js'"
  );
  expect(existsSync(join(distPath, 'sw.js'))).toBe(true);
  expect(
    readdirSync(distPath).some((fileName: string): boolean =>
      fileName.startsWith('workbox-')
    )
  ).toBe(true);
}

function assertInstallIcons(manifest: WebManifest): void {
  for (const icon of manifest.icons) {
    expect(icon.type).toBe('image/png');
    expect(existsSync(join(distPath, icon.src))).toBe(true);
  }

  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: '/icons/pin-reveal-icon-192.png',
        sizes: '192x192'
      }),
      expect.objectContaining({
        src: '/icons/pin-reveal-icon-512.png',
        sizes: '512x512'
      }),
      expect.objectContaining({
        src: '/icons/pin-reveal-maskable-512.png',
        purpose: 'maskable',
        sizes: '512x512'
      })
    ])
  );
}

describe('production PWA build artifacts', (): void => {
  it('exposes install metadata and generated service worker registration', (): void => {
    buildProductionApp();

    const indexHtml = readDistFile('index.html');
    const registerServiceWorkerScript = readDistFile('registerSW.js');
    const manifest = readManifest();

    assertManifestMetadata(manifest, indexHtml);
    assertAppleMetadata(indexHtml);
    assertServiceWorkerRegistration(indexHtml, registerServiceWorkerScript);
    assertInstallIcons(manifest);
  });
});
