import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { WAYFINDER_LINK_ORIGIN } from './httpsLinks.js';

describe('native HTTPS ownership configuration', () => {
  it('keeps the app, generator and deployed association on the exact same host and package', async () => {
    const app = JSON.parse(await readFile(new URL('../mobile/app.json', import.meta.url), 'utf8'));
    const deployment = JSON.parse(await readFile(new URL('../link-host/deployment.json', import.meta.url), 'utf8'));
    const android = JSON.parse(await readFile(new URL('../link-host/public/.well-known/assetlinks.json', import.meta.url), 'utf8'));
    expect(deployment.productionOrigin).toBe(WAYFINDER_LINK_ORIGIN);
    expect(app.expo.ios.associatedDomains).toContain(`applinks:${new URL(WAYFINDER_LINK_ORIGIN).hostname}`);
    expect(android).toHaveLength(1);
    expect(android[0].target.package_name).toBe(app.expo.android.package);
    expect(android[0].target.sha256_cert_fingerprints).toEqual(['FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C']);
    expect(app.expo.android.intentFilters).toHaveLength(1);
    const filter = app.expo.android.intentFilters[0];
    expect(filter).toMatchObject({ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'] });
    expect(filter.data).toEqual(['repo', 'map', 'ticket', 'prototype'].map(kind => ({
      scheme: 'https', host: new URL(WAYFINDER_LINK_ORIGIN).hostname, pathPrefix: `/open/${kind}/`,
    })));
  });
});
