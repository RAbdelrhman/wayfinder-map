import { View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { SignInScreen } from '../auth/SignInScreen';
import { useTheme } from '../maps/components';

export default function SignIn() {
  const { state } = useAuth();
  const t = useTheme();
  return state.phase === 'loading' ? (
    <View style={{ flex: 1, backgroundColor: t.plane }} />
  ) : (
    <SignInScreen />
  );
}
