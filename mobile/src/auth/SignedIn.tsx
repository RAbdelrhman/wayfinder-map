import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';

import { MapsScreen } from './MapsScreen';
import type { Session } from './deviceFlow';
import { SettingsScreen } from './SettingsScreen';

// Maps and the Settings page it opens. #229 replaces this switch with real navigation.
export function SignedIn({ session }: { session: Session }) {
  const [screen, setScreen] = useState<'maps' | 'settings'>('maps');

  useEffect(() => {
    if (screen !== 'settings') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setScreen('maps');
      return true;
    });
    return () => subscription.remove();
  }, [screen]);

  return screen === 'settings' ? (
    <SettingsScreen session={session} onBack={() => setScreen('maps')} />
  ) : (
    <MapsScreen session={session} onOpenSettings={() => setScreen('settings')} />
  );
}
