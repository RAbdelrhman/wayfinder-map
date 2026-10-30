import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../auth/AuthProvider';
import { SignInScreen } from '../../../auth/SignInScreen';
import { DestinationScreen } from '../../../links/DestinationScreen';
import { parseObjectAppLink } from '../../../../../src/objectLinks';

/** Keep this route through sign-in; resolve with the newly signed-in viewer. */
export default function ObjectRoute() {
  const { state } = useAuth();
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const query = new URLSearchParams();
  for (const key of ['canvas', 'rev', 'page', 'item']) {
    const value = params[key];
    if (Array.isArray(value)) return <Redirect href="/" />;
    if (typeof value === 'string') query.set(key, value);
  }
  const link = typeof params.kind === 'string' && typeof params.id === 'string'
    ? parseObjectAppLink(`wayfinder://${params.kind}/${encodeURIComponent(params.id)}${query.size ? `?${query}` : ''}`) : null;
  if (!link) return <Redirect href="/" />;
  return state.phase === 'signedIn' ? <DestinationScreen link={link} /> : <SignInScreen />;
}
