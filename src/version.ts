declare const __WAYFINDER_VERSION__: string | undefined;
declare const __WAYFINDER_AUTO_UPDATE__: boolean | undefined;

export const WAYFINDER_VERSION = typeof __WAYFINDER_VERSION__ === 'string' ? __WAYFINDER_VERSION__ : '0.0.0-dev';
export const AUTO_UPDATE_ENABLED = typeof __WAYFINDER_AUTO_UPDATE__ === 'boolean' && __WAYFINDER_AUTO_UPDATE__;
