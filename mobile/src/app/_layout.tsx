import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useIncomingShare } from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { BrowseProvider } from '../maps/BrowseProvider';

function Navigation() {
  const { state } = useAuth();
  const signedIn = state.phase === 'signedIn';
  const { sharedPayloads, clearSharedPayloads, refreshSharePayloads } =
    useIncomingShare();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const payload = sharedPayloads.find(
      (item) => item.shareType === 'text' || item.shareType === 'url',
    );
    if (!payload) {
      handled.current = null;
      return;
    }
    const key = `${payload.shareType}:${payload.value}`;
    if (signedIn && handled.current !== key) {
      handled.current = key;
      router.push({
        pathname: '/public-maps',
        params: { shared: payload.value },
      });
      clearSharedPayloads();
      refreshSharePayloads();
    }
  }, [signedIn, sharedPayloads, clearSharedPayloads, refreshSharePayloads]);
  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="map" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="public-maps" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="signin" />
      </Stack.Protected>
    </Stack>
  );
  return signedIn ? (
    <BrowseProvider key={state.session.login} session={state.session}>
      {stack}
    </BrowseProvider>
  ) : (
    stack
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="auto" />
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
