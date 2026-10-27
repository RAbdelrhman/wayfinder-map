import { router } from 'expo-router';
import { SettingsScreen } from '../auth/SettingsScreen';
import { useBrowse } from '../maps/BrowseProvider';

export default function Settings() {
  const { session } = useBrowse();
  return (
    <SettingsScreen
      session={session}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
