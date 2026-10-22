import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from './Avatar';
import { initialOf } from './copy';
import type { Session } from './deviceFlow';
import { themes } from './theme';

// Only the top bar of #223's Maps screen (R-C2): the title and the avatar that opens Settings (#316).
// The list under it is #229's; until then the page is empty.
export function MapsScreen({ session, onOpenSettings }: { session: Session; onOpenSettings: () => void }) {
  const t = themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.plane }]}>
      <View style={styles.bar}>
        <View style={styles.row}>
          <Pressable
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel={`Account, signed in as ${session.login}`}
            style={styles.avatarTouch}
          >
            <Avatar t={t} initial={initialOf(session)} size={30} />
          </Pressable>
        </View>
        <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
          Maps
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  row: { minHeight: 44, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  avatarTouch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.3 },
});
