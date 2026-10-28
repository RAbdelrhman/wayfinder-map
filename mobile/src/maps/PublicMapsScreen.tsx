import { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { mapVisibility } from '../shared';
import { Icon } from '../auth/Icon';
import {
  followedMaps,
  loadMaps,
  useBrowse,
  useResource,
} from './BrowseProvider';
import {
  Card,
  Header,
  Page,
  Progress,
  ResourceBody,
  Section,
  styles,
  useTheme,
} from './components';
import { GithubError, mapKey, validRef } from './github';
import type { MapRef, MapSummary } from './github';
import { isSummary } from './validate';
import { hiddenFollowRows, sharedMapRef } from './share';
import {
  otherFollowAccounts,
  readCache,
  removeFollowSnapshots,
  writeCache,
} from './cache';
import { discoverPublicMaps } from './discovery';
import type { Discovery } from './discovery';

const isDiscovery = (value: unknown): value is Discovery => {
  if (!value || typeof value !== 'object') return false;
  const data = value as Discovery;
  return (
    Array.isArray(data.groups) &&
    data.groups.every(
      (group) =>
        typeof group.repo === 'string' &&
        Array.isArray(group.maps) &&
        group.maps.every(isSummary),
    ) &&
    Array.isArray(data.hidden) &&
    data.hidden.every(isSummary) &&
    Array.isArray(data.follows) &&
    data.follows.every(validRef) &&
    Array.isArray(data.unavailable) &&
    data.unavailable.every(validRef) &&
    Array.isArray(data.warnings) &&
    data.warnings.every((item) => typeof item === 'string') &&
    typeof data.offline === 'boolean'
  );
};

export function PublicMapsScreen() {
  const t = useTheme();
  const { api, session, setFollow } = useBrowse();
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [otherAccounts, setOtherAccounts] = useState<string[]>([]);
  const [follows, setFollows] = useState<MapRef[]>([]);
  const [savedFollows, setSavedFollows] = useState<MapSummary[]>([]);
  const [sharedMap, setSharedMap] = useState<MapSummary | null>(null);
  const [shareMessage, setShareMessage] = useState('');
  const { followRevision } = useBrowse();
  useEffect(() => {
    void otherFollowAccounts(AsyncStorage, session.login).then(
      setOtherAccounts,
    );
  }, [session.login, followRevision]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let active = true;
    void followedMaps(session.login)
      .then((refs) => {
        if (active) setFollows(refs);
      })
      .catch((error: unknown) =>
        setActionError(
          error instanceof Error ? error.message : 'Could not read follows.',
        ),
      );
    return () => {
      active = false;
    };
  }, [session.login, followRevision]);
  useEffect(() => {
    if (!shared) return;
    const ref = sharedMapRef(shared);
    if (!ref) {
      setShareMessage(
        "That isn't a map link.\nPaste a GitHub issue link or owner/repo#number.",
      );
      return;
    }
    const controller = new AbortController();
    void api
      .sharedMap(ref, controller.signal)
      .then((map) => {
        if (!map)
          setShareMessage(
            "That isn't a map link.\nPaste a GitHub issue link or owner/repo#number.",
          );
        else if (map.author?.toLowerCase() === session.login.toLowerCase())
          setShareMessage("That's your map.\nYour maps always show on Maps.");
        else if (mapVisibility(map.body) !== 'public' || !map.author)
          setShareMessage(
            `#${map.number} isn't public.\n@${map.author} has to add Visibility: public to the map before anyone can follow it.`,
          );
        else setSharedMap(map);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setShareMessage(
            error instanceof GithubError && error.status === 404
              ? "Can't read that issue.\nThe link may be wrong, or the repository is private to you."
              : error instanceof GithubError
                ? error.message
                : "You're offline.\nWayfinder checks with GitHub that a map is public before following it. Try again when you're online.",
          );
      });
    return () => controller.abort();
  }, [api, session.login, shared]);
  const load = useCallback(
    async (signal: AbortSignal): Promise<Discovery> => {
      const follows = await followedMaps(session.login);
      const evict = (refs: MapRef[]) =>
        removeFollowSnapshots(AsyncStorage, session.login, refs);
      const own = await loadMaps(api, session.login, signal);
      return discoverPublicMaps(
        api,
        session.login,
        repo,
        follows,
        own,
        signal,
        evict,
      );
    },
    [api, session.login, repo],
  );
  const resource = useResource(
    `public-maps:${repo.toLowerCase()}`,
    load,
    isDiscovery,
  );
  const offline = resource.offline || !!resource.data?.offline;
  useEffect(() => {
    if (!resource.accessDenied && (resource.loading || resource.refreshing))
      return;
    let active = true;
    void Promise.all(
      follows.map((ref) =>
        readCache(
          AsyncStorage,
          session.login,
          `followed:${mapKey(ref)}`,
          isSummary,
        ),
      ),
    ).then((entries) => {
      if (active)
        setSavedFollows(
          entries.flatMap((entry) => (entry ? [entry.data] : [])),
        );
    });
    return () => {
      active = false;
    };
  }, [
    resource.accessDenied,
    resource.savedAt,
    resource.loading,
    resource.refreshing,
    follows,
    session.login,
  ]);
  const following = useMemo(() => new Set(follows.map(mapKey)), [follows]);
  const hiddenRows = hiddenFollowRows(
    resource.data?.hidden ?? [],
    following,
    sharedMap,
  );
  const toggle = async (map: MapSummary) => {
    const on = following.has(mapKey(map));
    if (busy || (!on && (resource.error || offline))) return;
    setBusy(true);
    setActionError('');
    try {
      if (!on) {
        const latest = await api.sharedMap(map);
        if (
          !latest ||
          mapVisibility(latest.body) !== 'public' ||
          !latest.author ||
          latest.author.toLowerCase() === session.login.toLowerCase()
        )
          throw new Error('This map is no longer public.');
        await writeCache(
          AsyncStorage,
          session.login,
          `followed:${mapKey(latest)}`,
          latest,
        );
      }
      await setFollow(map, !on);
      setFollows(await followedMaps(session.login));
      setToast(
        on
          ? `Unfollowed #${map.number} ${map.title}.`
          : `Following #${map.number} ${map.title}. It is on your maps now.`,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not update follows.',
      );
    } finally {
      setBusy(false);
    }
  };
  const row = (map: MapSummary, hidden = false) => {
    const on = following.has(mapKey(map));
    return (
      <View
        key={mapKey(map)}
        style={{
          padding: 14,
          borderTopWidth: 1,
          borderColor: t.gridline,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {hidden ? <Icon name="eyeoff" color={t.textMuted} size={20} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: t.textPrimary }]}>
            {map.title}
          </Text>
          <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 3 }}>
            {hidden
              ? `@${map.author} made #${map.number} private. It's hidden until it's public again.`
              : `#${map.number} · @${map.author} · ${map.completed}/${map.total} done`}
          </Text>
          {!hidden ? (
            <Progress completed={map.completed} total={map.total} />
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${on ? 'Unfollow' : 'Follow'} map #${map.number}: ${map.title}`}
          disabled={busy || (!on && (!!resource.error || offline))}
          onPress={() => void toggle(map)}
          style={{
            borderWidth: 1,
            borderColor: t.hairline,
            borderRadius: 9,
            minHeight: 44,
            justifyContent: 'center',
            paddingHorizontal: 12,
            opacity: busy || (!on && (!!resource.error || offline)) ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color: on ? t.textSecondary : t.accentText,
              fontWeight: '600',
            }}
          >
            {on ? 'Unfollow' : 'Follow'}
          </Text>
        </Pressable>
      </View>
    );
  };
  const known = new Set(
    [
      ...(resource.data?.groups.flatMap((group) => group.maps) ?? []),
      ...(resource.data?.hidden ?? []),
      ...(sharedMap ? [sharedMap] : []),
    ].map(mapKey),
  );
  const offlineRows =
    (resource.error || offline) && !resource.accessDenied
      ? savedFollows.filter(
          (map) => following.has(mapKey(map)) && !known.has(mapKey(map)),
        )
      : [];
  const savedKeys = new Set(offlineRows.map(mapKey));
  const unavailableRows = [
    ...new Map(
      [
        ...(resource.data?.unavailable ?? []),
        ...(resource.error || offline
          ? follows.filter(
              (ref) => !known.has(mapKey(ref)) && !savedKeys.has(mapKey(ref)),
            )
          : []),
      ]
        .filter(
          (ref) =>
            following.has(mapKey(ref)) &&
            (!sharedMap || mapKey(sharedMap) !== mapKey(ref)),
        )
        .map((ref) => [mapKey(ref), ref]),
    ).values(),
  ];
  return (
    <Page>
      <Header
        title="Public maps"
        back="Maps"
        onBack={() =>
          shared || !router.canGoBack() ? router.replace('/') : router.back()
        }
      />
      <ResourceBody
        resource={
          resource.offline
            ? {
                ...resource,
                error:
                  'Offline. Finding maps needs GitHub. Unfollow still works.',
              }
            : resource
        }
        warnings={resource.data?.warnings ?? []}
        showWithoutData
      >
        <TextInput
          accessibilityLabel="Look in a repository"
          placeholder="Look in a repository: owner/repo"
          placeholderTextColor={t.textMuted}
          value={query}
          editable={!offline}
          onChangeText={setQuery}
          onSubmitEditing={() => setRepo(query.trim())}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            minHeight: 44,
            backgroundColor: t.wash,
            borderRadius: 11,
            paddingHorizontal: 12,
            color: t.textPrimary,
          }}
        />
        {resource.data?.offline && !resource.offline ? (
          <Text
            accessibilityRole="alert"
            style={[
              styles.notice,
              { color: t.textSecondary, borderColor: t.hairline },
            ]}
          >
            Offline. Finding maps needs GitHub. Unfollow still works.
          </Text>
        ) : null}
        {otherAccounts.length ? (
          <Text
            style={[
              styles.notice,
              { color: t.textSecondary, borderColor: t.hairline },
            ]}
          >{`Signed in as @${session.login}. @${otherAccounts[0]}'s follows stay saved on this phone for when you sign back in.`}</Text>
        ) : null}
        {actionError ? (
          <Text
            accessibilityRole="alert"
            style={{ color: t.textSecondary, marginTop: 12 }}
          >
            {actionError}
          </Text>
        ) : null}
        {shared ? (
          <>
            <Section>Shared from GitHub</Section>
            {shareMessage ? (
              <View
                accessibilityRole="alert"
                style={[
                  styles.notice,
                  { borderColor: t.hairline, backgroundColor: t.surface },
                ]}
              >
                <Text style={{ color: t.textPrimary, fontWeight: '600' }}>
                  {shareMessage.split('\n')[0]}
                </Text>
                {shareMessage.includes('\n') ? (
                  <Text style={{ color: t.textSecondary, marginTop: 3 }}>
                    {shareMessage.split('\n').slice(1).join('\n')}
                  </Text>
                ) : null}
              </View>
            ) : sharedMap ? (
              <Card>
                <View style={{ padding: 14 }}>
                  <Text style={{ color: t.textMuted }}>
                    {sharedMap.repo} · #{sharedMap.number} · @{sharedMap.author}
                  </Text>
                  <Text
                    style={{
                      color: t.textPrimary,
                      fontSize: 17,
                      fontWeight: '600',
                      marginTop: 8,
                    }}
                  >
                    {sharedMap.title}
                  </Text>
                  <Progress
                    completed={sharedMap.completed}
                    total={sharedMap.total}
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 8,
                    }}
                  >
                    <Icon name="check" color={t.textMuted} size={16} />
                    <Text style={{ color: t.textSecondary }}>
                      Public map · {sharedMap.completed}/{sharedMap.total} done
                      · {new Date(sharedMap.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={
                      busy ||
                      (!following.has(mapKey(sharedMap)) &&
                        (!!resource.error || offline))
                    }
                    onPress={() => void toggle(sharedMap)}
                    style={{
                      minHeight: 50,
                      marginTop: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      flexDirection: 'row',
                      gap: 8,
                      borderRadius: 14,
                      backgroundColor: t.accentFill,
                      opacity:
                        busy ||
                        (!following.has(mapKey(sharedMap)) &&
                          (!!resource.error || offline))
                          ? 0.5
                          : 1,
                    }}
                  >
                    {!following.has(mapKey(sharedMap)) ? (
                      <Icon name="plus" color={t.onAccent} size={20} />
                    ) : null}
                    <Text
                      style={{
                        color: t.onAccent,
                        fontWeight: '600',
                        fontSize: 16,
                      }}
                    >
                      {following.has(mapKey(sharedMap))
                        ? 'Unfollow'
                        : 'Follow map'}
                    </Text>
                  </Pressable>
                </View>
              </Card>
            ) : null}
          </>
        ) : null}
        {hiddenRows.length ? (
          <>
            <Section>Followed, not public now</Section>
            <Card>{hiddenRows.map((map) => row(map, true))}</Card>
          </>
        ) : null}
        {unavailableRows.length ? (
          <>
            <Section>Followed, not public now</Section>
            <Card>
              {unavailableRows.map((ref) => (
                <View
                  key={mapKey(ref)}
                  style={{
                    padding: 14,
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{ color: t.textSecondary, flex: 1 }}
                  >{`Followed map ${ref.repo}#${ref.number} is unavailable.`}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Unfollow map ${ref.repo}#${ref.number}`}
                    disabled={busy}
                    onPress={() =>
                      void (async () => {
                        setBusy(true);
                        try {
                          await setFollow(ref, false);
                          setFollows(await followedMaps(session.login));
                        } catch (error) {
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : 'Could not update follows.',
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 12,
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: t.hairline,
                      borderRadius: 9,
                    }}
                  >
                    <Text style={{ color: t.textSecondary, fontWeight: '600' }}>
                      Unfollow
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        ) : null}
        {[...new Set(offlineRows.map((map) => map.repo))].map((name) => (
          <View key={name}>
            <Section>{name}</Section>
            <Card>
              {offlineRows
                .filter((map) => map.repo === name)
                .map((map) => row(map))}
            </Card>
          </View>
        ))}
        {resource.data?.groups.map((group) => {
          const maps = group.maps.filter(
            (map) => !sharedMap || mapKey(map) !== mapKey(sharedMap),
          );
          return (
            <View key={group.repo}>
              <Section>{group.repo}</Section>
              {maps.length ? (
                <Card>{maps.map((map) => row(map))}</Card>
              ) : (
                <Text style={{ color: t.textMuted }}>
                  {sharedMap &&
                  group.maps.some((map) => mapKey(map) === mapKey(sharedMap))
                    ? `#${sharedMap.number} is above, under Shared from GitHub.`
                    : 'No public maps from other people.'}
                </Text>
              )}
            </View>
          );
        })}
        <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 18 }}>
          Only maps their authors marked public. Follows are saved on this phone
          for @{session.login}; your desktop keeps its own list.
        </Text>
      </ResourceBody>
      {toast ? (
        <View
          accessibilityRole="alert"
          style={{
            position: 'absolute',
            bottom: 28,
            left: 16,
            right: 16,
            borderRadius: 12,
            padding: 12,
            backgroundColor: t.textPrimary,
          }}
        >
          <Text style={{ color: t.plane }}>{toast}</Text>
        </View>
      ) : null}
    </Page>
  );
}
