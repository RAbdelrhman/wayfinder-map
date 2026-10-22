import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import type { Theme } from './theme';

// The top bar's Back: the desktop's neutral .ghost look (hairline border, 9px radius) drawn at 34px inside a 44px touch area.
export function BackButton({ t, label, onPress }: { t: Theme; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label === 'Back' ? 'Back' : `Back to ${label}`}
      style={styles.touch}
    >
      {({ pressed }) => (
        <View style={[styles.face, { borderColor: t.hairline, backgroundColor: pressed ? t.wash : 'transparent' }]}>
          <Icon name="back" color={t.textSecondary} size={18} />
          <Text style={[styles.label, { color: t.textSecondary }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  face: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
    paddingRight: 12,
    borderWidth: 1,
    borderRadius: 9,
  },
  label: { fontSize: 14, fontWeight: '500' },
});
