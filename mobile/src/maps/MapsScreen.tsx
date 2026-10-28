import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '../auth/Avatar';
import { initialOf } from '../auth/copy';
import { Icon } from '../auth/Icon';
import {
  followedMaps,
  loadMaps,
  useBrowse,
  useResource,
} from './BrowseProvider';
import {
  Card,
  Page,
  Progress,
  ResourceBody,
  Section,
  styles,
  useTheme,
} from './components';
import { isMapList } from './validate';
import { mapKey } from './github';
import type { MapRef } from './github';

/** #223 R-C2: every map, latest first; one repository filter sheet. */
export function MapsScreen() {
  const t = useTheme();
  const { api, session, followRevision } = useBrowse();
  const [follows, setFollows] = useState<MapRef[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void followedMaps(session.login)
      .then((refs) => {
        if (controller.signal.aborted) return;
        setFollows(refs);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [api, session.login, followRevision]);
  const [search, setSearch] = useState('');
  const [repo, setRepo] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const load = useCallback(
    async (signal: AbortSignal) => loadMaps(api, session.login, signal),
    [api, session.login],
  );
  const resource = useResource('maps', load, isMapList);
  const hidden = resource.data?.hidden ?? [];
  const maps = (resource.data?.maps ?? []).filter(
    (map) =>
      map.author?.toLowerCase() === session.login.toLowerCase() ||
      follows === null ||
      follows.some((ref) => mapKey(ref) === mapKey(map)),
  );
  const repositories = useMemo(
    () => [...new Set(maps.map((map) => map.repo))].sort(),
    [maps],
  );
  const shown = maps.filter(
    (map) =>
      (!repo || map.repo === repo) &&
      `${map.title} ${map.repo} #${map.number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const pick = (value: string | null) => {
    setRepo(value);
    setPicker(false);
  };
  return (
    <Page>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
        <View
          style={{
            minHeight: 44,
            flexDirection: 'row',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Account, signed in as ${session.login}`}
            onPress={() => router.push('/settings')}
            style={styles.iconTouch}
          >
            <Avatar t={t} initial={initialOf(session)} size={30} />
          </Pressable>
        </View>
        <Text
          accessibilityRole="header"
          style={{
            color: t.textPrimary,
            fontSize: 30,
            fontWeight: '700',
            letterSpacing: -0.3,
          }}
        >
          Maps
        </Text>
      </View>
      <ResourceBody
        resource={resource}
        warnings={resource.data?.warnings ?? []}
        showWithoutData
      >
        {resource.data ? (
          <>
            <View
              style={{
                minHeight: 44,
                borderRadius: 11,
                backgroundColor: t.wash,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                gap: 8,
              }}
            >
              <Icon name="search" color={t.textMuted} size={18} />
              <TextInput
                accessibilityLabel="Search maps and repos"
                placeholder="Search maps and repos"
                placeholderTextColor={t.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                style={{
                  flex: 1,
                  minHeight: 44,
                  color: t.textPrimary,
                  fontSize: 15,
                }}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Filter by repository, showing ${repo ?? 'All maps'}`}
              onPress={() => setPicker(true)}
              style={{
                alignSelf: 'flex-start',
                minHeight: 44,
                marginTop: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: t.hairline,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="filter" color={t.textSecondary} size={18} />
              <Text style={{ color: t.textSecondary }}>Filter by</Text>
              <Text style={{ color: t.textPrimary, fontWeight: '600' }}>
                {repo?.split('/')[1] ?? 'All maps'}
              </Text>
              <Icon name="down" color={t.textMuted} size={16} />
            </Pressable>
            <Section>
              {repo ? `${shown.length} maps · latest first` : 'Latest'}
            </Section>
            {shown.length ? (
              <Card>
                {shown.map((map) => (
                  <Pressable
                    key={mapKey(map)}
                    accessibilityRole="button"
                    accessibilityLabel={`${map.title}, ${map.repo}, map #${map.number}`}
                    onPress={() =>
                      router.push({
                        pathname: '/map',
                        params: { repo: map.repo, number: map.number },
                      })
                    }
                    style={({ pressed }) => [
                      {
                        padding: 14,
                        borderTopWidth: 1,
                        borderTopColor: t.gridline,
                        flexDirection: 'row',
                        gap: 8,
                        backgroundColor: pressed ? t.wash : 'transparent',
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: t.textPrimary }]}>
                        {map.title}
                      </Text>
                      <Text
                        style={{
                          color: t.textMuted,
                          fontSize: 13,
                          marginTop: 3,
                        }}
                      >
                        {repo ? '' : `${map.repo} · `}#{map.number}
                        {map.author &&
                        map.author.toLowerCase() !== session.login.toLowerCase()
                          ? ` · @${map.author}`
                          : ''}{' '}
                        · {map.completed}/{map.total} done ·{' '}
                        {new Date(map.updatedAt).toLocaleDateString()}
                      </Text>
                      <Progress completed={map.completed} total={map.total} />
                    </View>
                    <Icon name="chevron" color={t.textMuted} size={18} />
                  </Pressable>
                ))}
              </Card>
            ) : (
              <View style={styles.empty}>
                <Text style={{ color: t.textPrimary, fontWeight: '600' }}>
                  {search ? 'No matching maps' : 'No maps here yet'}
                </Text>
                <Text
                  style={{
                    color: t.textMuted,
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  Start a map in Wayfinder on your desktop. It shows up here
                  once its issue is on GitHub.
                </Text>
              </View>
            )}
            {hidden.length ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/public-maps')}
                style={[
                  styles.notice,
                  {
                    borderColor: t.hairline,
                    backgroundColor: t.surface,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  },
                ]}
              >
                <Icon name="eyeoff" color={t.textMuted} size={20} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.textPrimary, fontWeight: '600' }}>
                    {hidden.length} followed{' '}
                    {hidden.length === 1 ? 'map is' : 'maps are'} hidden
                  </Text>
                  <Text style={{ color: t.textSecondary, marginTop: 4 }}>
                    #{hidden[0]?.number} is no longer public.
                  </Text>
                </View>
                <Icon name="chevron" color={t.textMuted} size={18} />
              </Pressable>
            ) : null}
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/public-maps')}
          style={{
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: t.hairline,
            borderRadius: 10,
            marginTop: 18,
            flexDirection: 'row',
            gap: 8,
          }}
        >
          <Icon name="search" color={t.textPrimary} size={20} />
          <Text style={{ color: t.textPrimary, fontWeight: '600' }}>
            Find public maps
          </Text>
        </Pressable>
        <Text
          style={{
            color: t.textMuted,
            textAlign: 'center',
            fontSize: 12,
            marginTop: 8,
          }}
        >
          Other people's maps show here after you follow them.
        </Text>
      </ResourceBody>
      <Modal
        visible={picker}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close repository filter"
            onPress={() => setPicker(false)}
            style={{ flex: 1 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              backgroundColor: t.plane,
              maxHeight: '75%',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 16,
              paddingBottom: 32,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 20,
                color: t.textPrimary,
                fontWeight: '600',
                marginBottom: 16,
              }}
            >
              Filter by repository
            </Text>
            <ScrollView>
              <Card>
                {[null, ...repositories].map((value) => (
                  <Pressable
                    key={value ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === repo }}
                    onPress={() => pick(value)}
                    style={{
                      minHeight: 64,
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 14,
                      borderTopWidth: 1,
                      borderTopColor: t.gridline,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: t.textPrimary,
                          fontSize: 15.5,
                          fontWeight: '500',
                        }}
                      >
                        {value ?? 'All maps'}
                      </Text>
                      <Text
                        style={{
                          color: t.textMuted,
                          fontSize: 13,
                          marginTop: 3,
                        }}
                      >
                        {value
                          ? `${maps.filter((map) => map.repo === value).length} maps`
                          : `${maps.length} maps · every repository`}
                      </Text>
                    </View>
                    {value === repo ? (
                      <Icon name="check" color={t.accentText} />
                    ) : null}
                  </Pressable>
                ))}
              </Card>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Page>
  );
}
