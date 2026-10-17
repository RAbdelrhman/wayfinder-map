import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from './AuthProvider';
import { failureCopy, formatCountdown } from './copy';
import type { DeviceGrant, FailureReason } from './deviceFlow';
import { Icon, type IconName } from './Icon';
import { themes, type Theme } from './theme';

const mono: TextStyle['fontFamily'] = Platform.select({ ios: 'Menlo', default: 'monospace' });

// The chosen sign-in direction from #223 (S-A): a welcome with one button, then the code, then waiting for GitHub.
export function SignInScreen() {
  const { state, signIn, copyCodeAndOpenGitHub, cancel } = useAuth();
  const t = themes[useColorScheme() === 'dark' ? 'dark' : 'light'];

  let body;
  switch (state.phase) {
    case 'code':
    case 'waiting':
      body = (
        <CodeStep
          t={t}
          grant={state.grant}
          waiting={state.phase === 'waiting'}
          onCopy={copyCodeAndOpenGitHub}
          onBack={cancel}
        />
      );
      break;
    case 'failed':
      body = <Failed t={t} reason={state.reason} onRetry={signIn} />;
      break;
    default:
      body = <Welcome t={t} busy={state.phase === 'requesting'} onSignIn={signIn} />;
  }
  return <SafeAreaView style={[styles.fill, { backgroundColor: t.plane }]}>{body}</SafeAreaView>;
}

function Welcome({ t, busy, onSignIn }: { t: Theme; busy: boolean; onSignIn: () => void }) {
  return (
    <>
      <View style={styles.hero}>
        <Logo icon="compass" background={t.textPrimary} color={t.plane} />
        <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
          Wayfinder
        </Text>
        <Text style={[styles.lead, { color: t.textSecondary }]}>Follow your maps from anywhere.</Text>
      </View>
      <View style={styles.foot}>
        <Button t={t} tone="dark" icon="github" label="Sign in with GitHub" busy={busy} onPress={onSignIn} />
        <Text style={[styles.fine, { color: t.textMuted }]}>Wayfinder reads your repos and issues through GitHub.</Text>
      </View>
    </>
  );
}

function CodeStep(props: { t: Theme; grant: DeviceGrant; waiting: boolean; onCopy: () => void; onBack: () => void }) {
  const { t, grant, waiting, onCopy, onBack } = props;
  return (
    <>
      <View style={styles.bar}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" style={styles.backTouch}>
          {({ pressed }) => (
            <View
              style={[styles.backFace, { borderColor: t.hairline, backgroundColor: pressed ? t.wash : 'transparent' }]}
            >
              <Icon name="back" color={t.textSecondary} size={18} />
              <Text style={[styles.backLabel, { color: t.textSecondary }]}>Back</Text>
            </View>
          )}
        </Pressable>
        <Text style={[styles.barTitle, { color: t.textPrimary }]} accessibilityRole="header">
          Sign in
        </Text>
        <View style={styles.barSpacer} />
      </View>
      <View style={[styles.hero, styles.heroTop]}>
        <Text style={[styles.lead, { color: t.textSecondary }]}>
          Enter this code on GitHub to let Wayfinder read your maps.
        </Text>
        <Code t={t} userCode={grant.userCode} />
        <Countdown t={t} expiresAt={grant.expiresAt} />
      </View>
      <View style={styles.foot}>
        {waiting ? (
          <>
            <Button t={t} tone="quiet" label="Waiting for GitHub…" spinner />
            <Text style={[styles.fine, { color: t.textMuted }]} accessibilityLiveRegion="polite">
              Approve on github.com/login/device. This screen moves on by itself.
            </Text>
          </>
        ) : (
          <Button t={t} tone="accent" icon="copy" label="Copy code and open GitHub" onPress={onCopy} />
        )}
      </View>
    </>
  );
}

function Code({ t, userCode }: { t: Theme; userCode: string }) {
  return (
    <View style={styles.code} accessible accessibilityLabel={`Device code ${userCode.split('').join(' ')}`}>
      {userCode.split('').map((ch, i) =>
        ch === '-' ? (
          <Text key={i} style={[styles.codeChar, styles.codeDash, { color: t.textMuted }]}>
            –
          </Text>
        ) : (
          <Text
            key={i}
            style={[
              styles.codeChar,
              styles.codeBox,
              { color: t.textPrimary, backgroundColor: t.surface, borderColor: t.hairline },
            ]}
          >
            {ch}
          </Text>
        ),
      )}
    </View>
  );
}

function Countdown({ t, expiresAt }: { t: Theme; expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text style={[styles.fine, { color: t.textMuted }]}>Expires in {formatCountdown(expiresAt - now)}</Text>;
}

function Failed({ t, reason, onRetry }: { t: Theme; reason: FailureReason; onRetry: () => void }) {
  const { title, body } = failureCopy[reason];
  return (
    <>
      <View style={styles.hero} accessibilityRole="alert">
        <Logo icon="refresh" background={t.stateBlocked} color="#000000" />
        <Text style={[styles.title, { color: t.textPrimary }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.lead, { color: t.textSecondary }]}>{body}</Text>
      </View>
      <View style={styles.foot}>
        <Button t={t} tone="accent" label="Get a new code" onPress={onRetry} />
      </View>
    </>
  );
}

function Logo(props: { icon: IconName; background: string; color: string }) {
  return (
    <View style={[styles.logo, { backgroundColor: props.background }]}>
      <Icon name={props.icon} color={props.color} size={40} />
    </View>
  );
}

function Button(props: {
  t: Theme;
  tone: 'accent' | 'dark' | 'quiet';
  label: string;
  icon?: IconName;
  busy?: boolean;
  spinner?: boolean;
  onPress?: () => void;
}) {
  const { t, tone, label, icon, busy, spinner, onPress } = props;
  const fill = tone === 'accent' ? t.accentText : tone === 'dark' ? t.textPrimary : t.surface;
  const ink = tone === 'accent' ? t.onAccent : tone === 'dark' ? t.plane : t.textPrimary;
  const disabled = busy === true || !onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: busy === true || spinner === true }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill, opacity: pressed ? 0.92 : busy ? 0.5 : 1 },
        tone === 'quiet' && { borderWidth: 1, borderColor: t.hairline },
      ]}
    >
      {spinner ? <ActivityIndicator size="small" color={t.accentText} /> : null}
      {icon ? <Icon name={icon} color={ink} /> : null}
      <Text style={[styles.buttonLabel, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  heroTop: { justifyContent: 'flex-start', paddingTop: 24 },
  logo: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 20, marginBottom: 8, fontSize: 28, fontWeight: '700', letterSpacing: -0.28, textAlign: 'center' },
  lead: { fontSize: 16, textAlign: 'center' },
  foot: { gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  fine: { fontSize: 13, textAlign: 'center' },
  button: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  buttonLabel: { fontSize: 16, fontWeight: '600' },
  bar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 4 },
  barTitle: { flex: 1, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  barSpacer: { width: 74 },
  backTouch: { minHeight: 44, minWidth: 74, justifyContent: 'center' },
  backFace: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 6,
    paddingRight: 12,
    borderWidth: 1,
    borderRadius: 9,
    alignSelf: 'flex-start',
  },
  backLabel: { fontSize: 14, fontWeight: '500' },
  code: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 20, marginBottom: 6 },
  codeChar: { fontFamily: mono, fontSize: 30, fontWeight: '600', textAlign: 'center' },
  codeBox: { minWidth: 30, paddingVertical: 10, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  codeDash: { minWidth: 10, paddingVertical: 10 },
});
