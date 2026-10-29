import { Linking } from 'react-native';
import { isOpenableLink } from '../../../src/appLinks';

export async function openExternal(url: string): Promise<void> {
  if (!isOpenableLink(url)) return;
  await Linking.openURL(url).catch(() => undefined);
}
