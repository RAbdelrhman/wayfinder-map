import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { SignInScreen } from './src/auth/SignInScreen';
import { themes } from './src/auth/theme';

// Bundles the shared map logic so every build proves Metro resolves ../src.
import './src/shared';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { state } = useAuth();
  const plane = themes[useColorScheme() === 'dark' ? 'dark' : 'light'].plane;
  return (
    <>
      <StatusBar style="auto" />
      {/* Signed in: blank until the repos and maps screens from #229 land. */}
      {state.phase === 'loading' || state.phase === 'signedIn' ? (
        <View style={{ flex: 1, backgroundColor: plane }} />
      ) : (
        <SignInScreen />
      )}
    </>
  );
}
