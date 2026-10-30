import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  phase: 'signedOut',
  params: { repo: 'owner/repo', number: '217' } as { repo: string | string[]; number: string | string[] },
}));
vi.mock('expo-router', () => ({ useLocalSearchParams: () => mocks.params, Redirect: () => null }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ state: { phase: mocks.phase } }) }));
vi.mock('../auth/SignInScreen', () => ({ SignInScreen: () => null }));
vi.mock('../maps/MapScreen', () => ({ MapScreen: () => null }));
import MapRoute from '../app/map';
import { MapScreen } from '../maps/MapScreen';
import { SignInScreen } from '../auth/SignInScreen';
import { Redirect } from 'expo-router';

beforeEach(() => {
  mocks.phase = 'signedOut';
  mocks.params = { repo: 'owner/repo', number: '217' };
});

it('keeps the map route through loading and sign-in and opens it only after authentication', () => {
  mocks.phase = 'loading';
  expect(MapRoute().type).toBe(SignInScreen);
  mocks.phase = 'signedOut';
  expect(MapRoute().type).toBe(SignInScreen);
  mocks.phase = 'signedIn';
  expect(MapRoute().type).toBe(MapScreen);
  expect(mocks.params).toEqual({ repo: 'owner/repo', number: '217' });
});

it('rejects invalid and ambiguous links before rendering the map loader', () => {
  mocks.phase = 'signedIn';
  mocks.params.number = ['217', '35'];
  expect(MapRoute().type).toBe(Redirect);
  mocks.params.number = '0';
  expect(MapRoute().type).toBe(Redirect);
});
