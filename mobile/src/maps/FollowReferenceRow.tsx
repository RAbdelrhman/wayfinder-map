import { Pressable, Text, View } from 'react-native';
import { Icon } from '../auth/Icon';
import { styles, useTheme } from './components';
import { followReason } from './unreadableFollows';
import type { UnavailableFollow } from './unreadableFollows';

export function FollowReferenceRow({ follow, busy, onUnfollow, grouped = true }: { follow: UnavailableFollow; busy: boolean; onUnfollow?: () => void; grouped?: boolean }) {
  const t = useTheme();
  const reason = followReason(follow);
  return (
    <View style={{ padding: 14, borderTopWidth: 1, borderColor: t.gridline, flexDirection: 'row', gap: 10, alignItems: reason.centered ? 'center' : 'flex-start' }}>
      <Icon name={reason.icon} color={t.textMuted} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: t.textPrimary, fontFamily: 'monospace', fontSize: 14.5 }]}>{grouped ? `#${follow.number}` : `${follow.repo}#${follow.number}`}</Text>
        {reason.text ? <Text style={{ color: t.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 3 }}><Text style={{ fontWeight: '600' }}>{reason.head}. </Text>{reason.text}</Text> : null}
      </View>
      {onUnfollow ? <Pressable accessibilityRole="button" accessibilityLabel={`Unfollow map ${follow.repo}#${follow.number}`} disabled={busy} onPress={onUnfollow} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: t.hairline, borderRadius: 9 }}><Text style={{ color: t.textSecondary, fontWeight: '600' }}>Unfollow</Text></Pressable> : null}
    </View>
  );
}
