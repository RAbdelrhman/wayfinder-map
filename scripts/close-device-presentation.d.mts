import type { Server } from 'node:http';
import type { Browser } from 'playwright-core';

export function closeDevicePresentation(browser: Pick<Browser, 'close'> | undefined, server: Pick<Server, 'close' | 'closeAllConnections'> | undefined, fixture: string): Promise<void>;
