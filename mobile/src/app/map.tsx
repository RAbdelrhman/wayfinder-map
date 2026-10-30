import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { SignInScreen } from '../auth/SignInScreen';
import { MapScreen } from '../maps/MapScreen';
import { parseMapAppLink } from '../../../src/appLinks';

/** Keep the destination mounted while signing in so the link survives authentication. */
export default function MapRoute() {
  const { state } = useAuth();
  const params = useLocalSearchParams<{ repo?: string | string[]; number?: string | string[] }>();
  const valid = typeof params.repo === 'string' && typeof params.number === 'string'
    && parseMapAppLink(`wayfinder://map?repo=${encodeURIComponent(params.repo)}&number=${encodeURIComponent(params.number)}`) !== null;
  if (!valid) return <Redirect href="/" />;
  return state.phase === 'signedIn' ? <MapScreen /> : <SignInScreen />;
}
