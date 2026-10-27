import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton } from '../auth/BackButton';
import { Icon } from '../auth/Icon';
import { themes } from '../auth/theme';
import type { Theme } from '../auth/theme';
import type { Ticket, TicketState } from '../shared';
import type { Resource } from './BrowseProvider';

export const useTheme = (): Theme =>
  themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
export const STATES: Record<
  TicketState,
  { label: string; icon: 'check' | 'lock' | 'person' | 'arrow' }
> = {
  done: { label: 'Done', icon: 'check' },
  blocked: { label: 'Blocked', icon: 'lock' },
  claimed: { label: 'Claimed', icon: 'person' },
  frontier: { label: 'Next up', icon: 'arrow' },
};
export const STATE_ORDER: TicketState[] = [
  'done',
  'claimed',
  'frontier',
  'blocked',
];
export function stateColor(t: Theme, state: TicketState): string {
  return state === 'done'
    ? t.textMuted
    : state === 'blocked'
      ? t.stateBlocked
      : state === 'claimed'
        ? t.stateClaimed
        : t.stateFrontier;
}
export function Page({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.plane }}>
      {children}
    </SafeAreaView>
  );
}
export function Header({
  title,
  back,
  onBack,
  url,
}: {
  title: string;
  back: string;
  onBack: () => void;
  url?: string;
}) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        <BackButton t={t} label={back} onPress={onBack} />
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[styles.headerTitle, { color: t.textPrimary }]}
      >
        {title}
      </Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        {url ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open on GitHub"
            onPress={() => void openExternal(url)}
            style={styles.iconTouch}
          >
            <View style={[styles.iconFace, { borderColor: t.hairline }]}>
              <Icon name="external" color={t.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  await Linking.openURL(url).catch(() => undefined);
}
export function Section({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.section, { color: t.textMuted }]}
    >
      {children.toUpperCase()}
    </Text>
  );
}
export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.hairline },
      ]}
    >
      {children}
    </View>
  );
}
export function Tabs<K extends string>({
  tabs,
  selected,
  onSelect,
  label,
}: {
  tabs: readonly { key: K; label: string }[];
  selected: K;
  onSelect: (key: K) => void;
  label: string;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.tabs, { backgroundColor: t.wash }]}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          accessibilityRole="tab"
          accessibilityState={{ selected: selected === tab.key }}
          onPress={() => onSelect(tab.key)}
          style={[
            styles.tab,
            selected === tab.key && { backgroundColor: t.surface },
          ]}
        >
          <Text
            style={{
              color: selected === tab.key ? t.textPrimary : t.textSecondary,
              fontWeight: selected === tab.key ? '600' : '500',
              fontSize: 14,
            }}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function StateChip({
  state,
  count,
}: {
  state: TicketState;
  count?: number;
}) {
  const t = useTheme();
  const color = stateColor(t, state);
  return (
    <View style={styles.chip}>
      <Icon name={STATES[state].icon} color={color} size={14} />
      <Text style={{ color, fontSize: 12 }}>
        {count !== undefined ? `${count} ` : ''}
        {STATES[state].label}
      </Text>
    </View>
  );
}
export function Progress({
  tickets,
  completed,
  total,
}: {
  tickets?: Ticket[];
  completed: number;
  total: number;
}) {
  const t = useTheme();
  const counts = STATE_ORDER.map((state) => ({
    state,
    count: tickets
      ? tickets.filter((item) => item.state === state).length
      : state === 'done'
        ? completed
        : state === 'blocked'
          ? Math.max(0, total - completed)
          : 0,
  }));
  return (
    <View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: Math.max(1, total), now: completed }}
        accessibilityLabel={`${completed} of ${total} tickets done`}
        style={[styles.progress, { backgroundColor: t.wash }]}
      >
        {counts
          .filter((item) => item.count > 0)
          .map((item) => (
            <View
              key={item.state}
              style={{
                flex: item.count,
                backgroundColor: stateColor(t, item.state),
              }}
            />
          ))}
      </View>
      {tickets ? (
        <View style={styles.legend}>
          {counts.map((item) => (
            <StateChip key={item.state} state={item.state} count={item.count} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
export function TicketRow({
  ticket,
  onPress,
  typeIcon = false,
  tile = false,
}: {
  ticket: Ticket;
  onPress: () => void;
  typeIcon?: boolean;
  tile?: boolean;
}) {
  const t = useTheme();
  const color = stateColor(t, ticket.state);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`#${ticket.number}, ${ticket.title}, ${STATES[ticket.state].label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.ticket,
        {
          backgroundColor: pressed ? t.wash : t.surface,
          borderColor: tile ? color : t.gridline,
          borderWidth: tile ? 1 : 0,
          borderTopWidth: 1,
          borderRadius: tile ? 12 : 0,
          opacity: ticket.state === 'done' && tile ? 0.7 : 1,
        },
      ]}
    >
      <Icon
        name={typeIcon ? (ticket.type ?? 'task') : STATES[ticket.state].icon}
        color={typeIcon ? t.textSecondary : color}
        size={22}
      />
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={3}
          style={[styles.rowTitle, { color: t.textPrimary }]}
        >
          {ticket.title}
        </Text>
        <View style={styles.legend}>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            #{ticket.number}
          </Text>
          {tile ? <StateChip state={ticket.state} /> : null}
          <Text style={{ color: t.textMuted, fontSize: 12 }}>
            {ticket.state === 'blocked'
              ? `Needs ${ticket.openBlockers.map((n) => `#${n}`).join(', ')}`
              : ticket.assignee
                ? `@${ticket.assignee}`
                : (ticket.type ?? 'Issue')}
          </Text>
        </View>
      </View>
      {!tile ? <Icon name="chevron" color={t.textMuted} size={18} /> : null}
    </Pressable>
  );
}
export function ResourceBody<T>({
  resource,
  children,
  warnings = [],
}: {
  resource: Resource<T>;
  children: ReactNode;
  warnings?: string[];
}) {
  const t = useTheme();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={resource.refreshing}
          onRefresh={resource.refresh}
          tintColor={t.textMuted}
        />
      }
    >
      {resource.loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={t.accentText} />
          <Text style={{ color: t.textMuted, marginTop: 12 }}>
            Loading from GitHub…
          </Text>
        </View>
      ) : null}
      {resource.error ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.notice,
            { borderColor: t.hairline, backgroundColor: t.surface },
          ]}
        >
          <Text style={{ color: t.textSecondary }}>{resource.error}</Text>
          {resource.data && resource.savedAt ? (
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>
              Showing saved data from{' '}
              {new Date(resource.savedAt).toLocaleString()}.
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={resource.refresh}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: t.accentText }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {warnings.map((warning) => (
        <Text
          key={warning}
          accessibilityRole="alert"
          style={[
            styles.notice,
            { color: t.textSecondary, borderColor: t.hairline },
          ]}
        >
          {warning}
        </Text>
      ))}
      {resource.data ? children : null}
    </ScrollView>
  );
}
export const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  side: { width: 80 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  iconTouch: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconFace: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 28, flexGrow: 1 },
  section: {
    marginTop: 22,
    marginBottom: 8,
    marginHorizontal: 4,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.52,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tabs: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 3,
    borderRadius: 12,
    flexDirection: 'row',
  },
  tab: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 9,
  },
  chip: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  progress: {
    height: 5,
    borderRadius: 5,
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 2,
    marginTop: 8,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 5,
  },
  ticket: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 66,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  rowTitle: { fontSize: 15.5, lineHeight: 21, fontWeight: '500' },
  empty: { padding: 28, alignItems: 'center' },
  notice: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginVertical: 8,
    fontSize: 14,
  },
});
