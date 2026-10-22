import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from './AuthProvider';
import { Avatar } from './Avatar';
import { BackButton } from './BackButton';
import { displayName, formatSince, initialOf } from './copy';
import type { Session } from './deviceFlow';
import { Icon, type IconName } from './Icon';
import { themes, type Theme } from './theme';

// The Settings page picked in #316 (G-a): profile, Account, and Sign out alone at the bottom.
// The Preferences rows (Notifications, Desktop) arrive with #225 and #224.
export function SettingsScreen({ session, onBack }: { session: Session; onBack: () => void }) {
  const { signOut } = useAuth();
  const t = themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [confirming, setConfirming] = useState(false);

  const confirmSignOut = async () => {
    setConfirming(false);
    try {
      await signOut();
    } catch {
      Alert.alert('Couldn’t sign out', 'Wayfinder couldn’t clear the sign-in from this phone’s secure storage. Try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.plane }]}>
      <View style={styles.bar}>
        <View style={styles.barSide}>
          <BackButton t={t} label="Maps" onPress={onBack} />
        </View>
        <Text style={[styles.barTitle, { color: t.textPrimary }]} accessibilityRole="header">
          Settings
        </Text>
        <View style={styles.barSide} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profile}>
          <Avatar t={t} initial={initialOf(session)} size={72} />
          <Text style={[styles.name, { color: t.textPrimary }]}>{displayName(session)}</Text>
          <Text style={[styles.login, { color: t.textMuted }]}>@{session.login}</Text>
        </View>

        <SectionTitle t={t}>Account</SectionTitle>
        <Group t={t}>
          <Row
            t={t}
            icon="check"
            title="Signed in"
            sub={`With a device code · since ${formatSince(session.signedInAt, Date.now())}`}
          />
          <Row
            t={t}
            icon="github"
            title="Open profile on GitHub"
            trailing="external"
            onPress={() => void Linking.openURL(`https://github.com/${session.login}`)}
          />
        </Group>

        <View style={styles.gap} />
        <Group t={t}>
          <Row
            t={t}
            icon="signout"
            title="Sign out"
            sub="Forgets your GitHub sign-in on this phone"
            danger
            onPress={() => setConfirming(true)}
          />
        </Group>
      </ScrollView>
      <SignOutAlert
        t={t}
        login={session.login}
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void confirmSignOut()}
      />
    </SafeAreaView>
  );
}

function SectionTitle({ t, children }: { t: Theme; children: string }) {
  return (
    <Text style={[styles.sectionTitle, { color: t.textMuted }]} accessibilityRole="header">
      {children.toUpperCase()}
    </Text>
  );
}

function Group({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <View style={[styles.group, { backgroundColor: t.surface, borderColor: t.hairline }]}>{children}</View>;
}

function Row(props: {
  t: Theme;
  icon: IconName;
  title: string;
  sub?: string;
  trailing?: IconName;
  danger?: boolean;
  onPress?: () => void;
}) {
  const { t, icon, title, sub, trailing, danger, onPress } = props;
  const content = (
    <>
      <Icon name={icon} color={danger ? t.stateFailed : t.textSecondary} />
      <View style={styles.rowMain}>
        <Text style={[styles.rowTitle, { color: danger ? t.stateFailed : t.textPrimary }]}>{title}</Text>
        {sub ? (
          <Text style={[styles.rowSub, { color: t.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {trailing ? <Icon name={trailing} color={t.textMuted} size={18} /> : null}
    </>
  );
  const rowStyle = [styles.row, { borderTopColor: t.gridline }];
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: t.wash }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={rowStyle}>{content}</View>
  );
}

// B-confirm from #316: a centred card with Cancel and Sign out side by side.
function SignOutAlert(props: { t: Theme; login: string; visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t, login, visible, onCancel, onConfirm } = props;
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={[styles.alert, { backgroundColor: t.surface }]} accessibilityViewIsModal>
          <Text style={[styles.alertTitle, { color: t.textPrimary }]} accessibilityRole="header">
            Sign out?
          </Text>
          <Text style={[styles.alertBody, { color: t.textSecondary }]}>
            Wayfinder will forget @{login}’s GitHub sign-in on this phone.
          </Text>
          <View style={[styles.alertActions, { borderTopColor: t.gridline }]}>
            <Pressable onPress={onCancel} accessibilityRole="button" style={styles.alertButton}>
              <Text style={[styles.alertLabel, { color: t.accentText }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={[styles.alertButton, { borderLeftWidth: 1, borderLeftColor: t.gridline }]}
            >
              <Text style={[styles.alertLabel, styles.alertStrong, { color: t.stateFailed }]}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  bar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  barSide: { flex: 1, alignItems: 'flex-start' },
  barTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  profile: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  name: { marginTop: 10, marginBottom: 2, fontSize: 20, fontWeight: '600' },
  login: { fontSize: 13.5 },
  sectionTitle: { marginTop: 22, marginBottom: 8, marginHorizontal: 4, fontSize: 13, fontWeight: '600', letterSpacing: 0.52 },
  gap: { height: 24 },
  group: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15.5, fontWeight: '500', lineHeight: 20 },
  rowSub: { marginTop: 2, fontSize: 13 },
  scrim: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.32)' },
  alert: { width: 280, borderRadius: 16, overflow: 'hidden' },
  alertTitle: { marginTop: 20, marginHorizontal: 16, marginBottom: 4, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  alertBody: { marginHorizontal: 16, marginBottom: 18, fontSize: 14, textAlign: 'center' },
  alertActions: { flexDirection: 'row', borderTopWidth: 1 },
  alertButton: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  alertLabel: { fontSize: 16 },
  alertStrong: { fontWeight: '600' },
});
