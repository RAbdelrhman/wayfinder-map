import { Linking } from 'react-native';
import { isOpenableLink, nativeThreadLink } from '../../../src/appLinks';

export async function openExternal(url: string): Promise<void> {
  if (!isOpenableLink(url)) return;
  await Linking.openURL(nativeThreadLink(url) ?? url).catch(() => undefined);
}
