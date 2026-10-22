import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/auth/AuthProvider';
import { SignedIn } from './src/auth/SignedIn';
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
      {state.phase === 'loading' ? (
        <View style={{ flex: 1, backgroundColor: plane }} />
      ) : state.phase === 'signedIn' ? (
        <SignedIn session={state.session} />
      ) : (
        <SignInScreen />
      )}
    </>
  );
}
