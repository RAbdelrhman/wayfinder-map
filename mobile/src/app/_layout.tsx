import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { BrowseProvider } from '../maps/BrowseProvider';

function Navigation() {
  const { state } = useAuth();
  const signedIn = state.phase === 'signedIn';
  const stack = (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="ticket" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="signin" />
      </Stack.Protected>
      <Stack.Screen name="map" />
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
