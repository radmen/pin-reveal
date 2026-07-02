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
  builtJavaScript: string
): void {
  expect(indexHtml).not.toContain('src="/registerSW.js"');
  expect(builtJavaScript).toContain('/sw.js');
  expect(builtJavaScript).toContain('workbox-window');
  expect(builtJavaScript).toContain('A new version is ready');
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

function readBuiltTextFiles(): string[] {
  const assetFileNames = readdirSync(join(distPath, 'assets')).filter(
    (fileName: string): boolean => /\.(css|js)$/.test(fileName)
  );

  return [
    readDistFile('index.html'),
    ...assetFileNames.map((fileName: string): string =>
      readDistFile(join('assets', fileName))
    )
  ];
}

function assertNoGoogleFontDependencies(): void {
  for (const fileContents of readBuiltTextFiles()) {
    expect(fileContents).not.toContain('fonts.googleapis.com');
    expect(fileContents).not.toContain('fonts.gstatic.com');
  }

  expect(readDistFile('index.html')).not.toContain(
    'rel="preconnect" href="https://fonts.'
  );
}

function assertLocalFontAssets(): void {
  const assetFileNames = readdirSync(join(distPath, 'assets'));
  const stylesheet = assetFileNames
    .filter((fileName: string): boolean => fileName.endsWith('.css'))
    .map((fileName: string): string => readDistFile(join('assets', fileName)))
    .join('\n');

  expect(stylesheet).toContain('font-family:Space Grotesk');
  expect(stylesheet).toContain('font-family:Space Mono');
  expect(stylesheet).toContain('space-grotesk-latin-400-normal');
  expect(stylesheet).toContain('space-grotesk-latin-500-normal');
  expect(stylesheet).toContain('space-grotesk-latin-600-normal');
  expect(stylesheet).toContain('space-grotesk-latin-700-normal');
  expect(stylesheet).toContain('space-mono-latin-400-normal');
  expect(stylesheet).toContain('space-mono-latin-700-normal');
  expect(
    assetFileNames.some((fileName: string): boolean =>
      fileName.endsWith('.woff2')
    )
  ).toBe(true);
}

function readPrecacheUrls(): string[] {
  return Array.from(readDistFile('sw.js').matchAll(/"url": "([^"]+)"/g)).map(
    (match: RegExpMatchArray): string => match[1]
  );
}

function assertPrecachedFileExists(precacheUrl: string): void {
  expect(existsSync(join(distPath, precacheUrl))).toBe(true);
}

function assertOfflineAppShellAssets(manifest: WebManifest): void {
  const precacheUrls = readPrecacheUrls();

  expect(precacheUrls).toEqual(
    expect.arrayContaining(['index.html', 'manifest.webmanifest'])
  );
  expect(
    precacheUrls.some((url: string): boolean =>
      /^assets\/index-.*\.js$/.test(url)
    )
  ).toBe(true);
  expect(
    precacheUrls.some((url: string): boolean =>
      /^assets\/index-.*\.css$/.test(url)
    )
  ).toBe(true);
  expect(
    precacheUrls.some((url: string): boolean =>
      /^assets\/derive-key\.worker-.*\.js$/.test(url)
    )
  ).toBe(true);
  expect(
    precacheUrls.some((url: string): boolean =>
      /^assets\/.*\.woff2?$/.test(url)
    )
  ).toBe(true);
  expect(
    precacheUrls.some((url: string): boolean =>
      /^assets\/workbox-window\.prod\.es5-.*\.js$/.test(url)
    )
  ).toBe(true);
  expect(precacheUrls).toContain('icons/pin-reveal-apple-touch-icon.png');

  for (const icon of manifest.icons) {
    expect(precacheUrls).toContain(icon.src.replace(/^\//, ''));
  }

  for (const precacheUrl of precacheUrls) {
    assertPrecachedFileExists(precacheUrl);
  }
}

function assertFingerprintWordListIsBundled(): void {
  const builtJavaScript = readdirSync(join(distPath, 'assets'))
    .filter((fileName: string): boolean => fileName.endsWith('.js'))
    .map((fileName: string): string => readDistFile(join('assets', fileName)))
    .join('\n');

  expect(builtJavaScript).toContain('aardvark');
  expect(builtJavaScript).toContain('Zulu');
}

describe('production PWA build artifacts', (): void => {
  it('exposes install metadata and prompted service worker registration', (): void => {
    buildProductionApp();

    const indexHtml = readDistFile('index.html');
    const builtTextFiles = readBuiltTextFiles();
    const builtJavaScript = builtTextFiles.join('\n');
    const manifest = readManifest();

    assertManifestMetadata(manifest, indexHtml);
    assertAppleMetadata(indexHtml);
    assertServiceWorkerRegistration(indexHtml, builtJavaScript);
    assertInstallIcons(manifest);
    assertNoGoogleFontDependencies();
    assertLocalFontAssets();
    assertOfflineAppShellAssets(manifest);
    assertFingerprintWordListIsBundled();
  });
});
