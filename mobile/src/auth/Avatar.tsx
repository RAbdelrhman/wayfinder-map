import { StyleSheet, Text, View } from 'react-native';

import type { Theme } from './theme';

// The desktop's .avatar without a photo: the first letter on the claimed blue.
export function Avatar({ t, initial, size }: { t: Theme; initial: string; size: number }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: t.stateClaimed, borderColor: t.hairline },
      ]}
    >
      <Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  initial: { color: '#ffffff', fontWeight: '600' },
});
