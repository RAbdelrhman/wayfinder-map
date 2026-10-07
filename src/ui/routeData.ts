/** A tab's successful reads survive navigation. Actions and authentication are never cached. */
export const ROUTE_SCOPE_KEY = 'wayfinder-map:route-scope:v1';
const PREFIX = 'wayfinder-map:route-data:v1:';
const MAX_AGE_MS = 5 * 60_000;
const FRESH_MS = 15_000;

interface Entry {
  at: number;
  value: unknown;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class RouteDataCache {
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly versions = new Map<string, number>();

  constructor(
    private scope: string,
    private readonly storage: StorageLike,
    private readonly shared: StorageLike,
    private readonly request: typeof fetch = fetch.bind(globalThis),
    private readonly now: () => number = Date.now,
  ) {
    if (scope !== '') this.shareScope(scope);
  }

  private shareScope(scope: string): void {
    try {
      const current = this.shared.getItem(ROUTE_SCOPE_KEY);
      if (current !== null && /^\d{13}-/.test(current) && /^\d{13}-/.test(scope) && current.slice(0, 13) > scope.slice(0, 13)) return;
      this.shared.setItem(ROUTE_SCOPE_KEY, scope);
    } catch { /* Storage can be disabled. */ }
  }

  private active(): boolean {
    if (this.scope === '') return false;
    try { return this.shared.getItem(ROUTE_SCOPE_KEY) === this.scope; } catch { return false; }
  }

  private key(url: string): string {
    // A repository snapshot is shared by Home, the repository page and all map views.
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.delete('refresh');
    parsed.searchParams.delete('check');
    if (parsed.pathname.endsWith('/snapshot')) parsed.searchParams.delete('map');
    parsed.searchParams.sort();
    return parsed.pathname + parsed.search;
  }

  private cacheable(url: string): boolean {
    const path = new URL(url, 'http://localhost').pathname;
    return /^\/api\/(home|repositories|models|progress|stall-settings|notification-settings|hand-offs)$/.test(path)
      || /^\/api\/repos\/[^/]+\/[^/]+\/(snapshot|prototypes)$/.test(path);
  }

  private entry(url: string): Entry | null {
    if (!this.active() || !this.cacheable(url)) return null;
    try {
      const raw = this.storage.getItem(PREFIX + this.scope + ':' + this.key(url));
      if (raw === null) return null;
      const entry = JSON.parse(raw) as Entry;
      const age = this.now() - entry.at;
      return Number.isFinite(entry.at) && age >= 0 && age < MAX_AGE_MS && 'value' in entry ? entry : null;
    } catch { return null; }
  }

  peek<T>(url: string): T | null {
    return (this.entry(url)?.value as T | undefined) ?? null;
  }

  adoptScope(response: Response): void {
    const scope = response.headers.get('x-wayfinder-cache-scope');
    if (scope === null || scope === this.scope) return;
    this.scope = scope;
    this.pending.clear();
    this.versions.clear();
    this.shareScope(scope);
  }

  invalidate(url: string): void {
    const key = this.key(url);
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
    for (const pendingKey of this.pending.keys()) if (this.key(pendingKey) === key) this.pending.delete(pendingKey);
    try { this.storage.removeItem(PREFIX + this.scope + ':' + key); } catch { /* Best effort. */ }
  }

  remember(url: string, value: unknown): void {
    this.invalidate(url);
    this.save(url, value);
  }

  private save(url: string, value: unknown): void {
    if (!this.active() || !this.cacheable(url)) return;
    try { this.storage.setItem(PREFIX + this.scope + ':' + this.key(url), JSON.stringify({ at: this.now(), value })); } catch { /* Quota failure never blocks a view. */ }
  }

  async read<T>(url: string, force = false): Promise<T> {
    const cached = force ? null : this.entry(url);
    if (cached !== null && this.now() - cached.at < FRESH_MS) return cached.value as T;
    const key = this.key(url);
    // Forced Sync must not join an ordinary read or conditional check.
    const requestKey = force ? url : key;
    const existing = this.pending.get(requestKey);
    if (existing !== undefined) return existing as Promise<T>;
    const version = (this.versions.get(key) ?? 0) + 1;
    this.versions.set(key, version);
    const scope = this.scope;
    const pending = (async (): Promise<T> => {
      const response = await this.request(url);
      const value: unknown = await response.json();
      if (!response.ok) throw new Error((value as { error?: string }).error ?? 'Request failed.');
      const nextScope = response.headers.get('x-wayfinder-cache-scope');
      if (scope !== '' && (scope !== this.scope || nextScope !== null && nextScope !== scope || !this.active())) throw new Error('The GitHub account changed. Reload this page.');
      if (version !== (this.versions.get(key) ?? 0)) throw new Error('This read was replaced by a newer change.');
      if (scope === this.scope) this.save(url, value);
      return value as T;
    })();
    this.pending.set(requestKey, pending);
    try { return await pending; } finally { if (this.pending.get(requestKey) === pending) this.pending.delete(requestKey); }
  }
}

let cache: RouteDataCache | null = null;
export function routeData(): RouteDataCache {
  if (cache !== null) return cache;
  const unavailable: StorageLike = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  let tabStorage = unavailable;
  let sharedStorage = unavailable;
  try { tabStorage = sessionStorage; sharedStorage = localStorage; } catch { /* Private browsing may deny storage. */ }
  cache = new RouteDataCache(typeof document === 'undefined' ? '' : document.querySelector<HTMLMetaElement>('meta[name="wayfinder-cache-scope"]')?.content ?? '', tabStorage, sharedStorage);
  return cache;
}

export function readRouteJson<T>(url: string, force = false): Promise<T> {
  return routeData().read<T>(url, force || new URL(url, window.location.origin).searchParams.get('refresh') === '1');
}
