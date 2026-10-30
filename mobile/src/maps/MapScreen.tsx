import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { followedMaps, useBrowse, useResource } from './BrowseProvider';
import { isGithubAccessDenied, mayViewMap } from './github';
import type { MapDetail } from './github';
import { removeMapContents } from './cache';
import {
  Card,
  Header,
  Page,
  Progress,
  ResourceBody,
  Section,
  STATE_ORDER,
  STATES,
  Tabs,
  TicketRow,
  useTheme,
} from './components';
import { Markdown } from './Markdown';
import { isMapDetail } from './validate';
import type { TicketState } from '../shared';

export function routeRef(params: {
  repo?: string | string[];
  number?: string | string[];
}) {
  const repo = typeof params.repo === 'string' ? params.repo : '';
  const number = typeof params.number === 'string' ? Number(params.number) : 0;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !Number.isSafeInteger(number) ||
    number <= 0
  )
    throw new Error('This map or ticket link is invalid.');
  return { repo, number };
}
const TABS = [
  { key: 'path', label: 'Path' },
  { key: 'tickets', label: 'Tickets' },
  { key: 'brief', label: 'Brief' },
] as const;
export function MapScreen() {
  const ref = routeRef(
    useLocalSearchParams<{ repo: string; number: string }>(),
  );
  const { api, session } = useBrowse();
  const t = useTheme();
  const [tab, setTab] = useState<'path' | 'tickets' | 'brief'>('path');
  const [filter, setFilter] = useState<TicketState | 'all'>('all');
  const load = useCallback(
    async (signal: AbortSignal) => {
      try {
        return await api.map({ repo: ref.repo, number: ref.number }, signal, {
          login: session.login,
          follows: await followedMaps(session.login),
        });
      } catch (error) {
        if (isGithubAccessDenied(error))
          await removeMapContents(AsyncStorage, session.login, ref);
        throw error;
      }
    },
    [api, ref.repo, ref.number, session.login],
  );
  const canUseCached = useCallback(
    async (map: MapDetail) =>
      mayViewMap(map, {
        login: session.login,
        follows: await followedMaps(session.login),
      }),
    [session.login],
  );
  const resource = useResource(
    `map:${ref.repo.toLowerCase()}#${ref.number}`,
    load,
    isMapDetail,
    canUseCached,
  );
  const map = resource.data;
  const openTicket = (number: number) =>
    router.push({
      pathname: '/ticket',
      params: { repo: ref.repo, number, mapNumber: ref.number },
    });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <Page>
      <Header
        title={map?.title ?? `Map #${ref.number}`}
        back="Maps"
        onBack={back}
        url={`https://github.com/${ref.repo}/issues/${ref.number}`}
      />
      <Tabs tabs={TABS} selected={tab} onSelect={setTab} label="Map view" />
      <ResourceBody resource={resource} warnings={map?.warnings ?? []}>
        {map ? (
          <>
            {tab === 'path' ? (
              <>
                <Text
                  style={{
                    color: t.textSecondary,
                    fontSize: 14,
                    lineHeight: 22,
                    marginVertical: 10,
                  }}
                  numberOfLines={2}
                >
                  {map.sections.destination || map.title}
                </Text>
                <Progress
                  tickets={map.tickets}
                  completed={map.completed}
                  total={map.total}
                />
                {[...new Set(Object.values(map.layers))]
                  .sort((a, b) => a - b)
                  .map((layer) => (
                    <View key={layer}>
                      <Section>
                        {layer === 0
                          ? 'Can start now or already moving'
                          : `Step ${layer + 1} · after step ${layer}`}
                      </Section>
                      <View style={{ gap: 8 }}>
                        {map.tickets
                          .filter(
                            (ticket) => map.layers[ticket.number] === layer,
                          )
                          .map((ticket) => (
                            <TicketRow
                              key={ticket.number}
                              ticket={ticket}
                              tile
                              typeIcon
                              onPress={() => openTicket(ticket.number)}
                            />
                          ))}
                      </View>
                    </View>
                  ))}
                {map.tickets.length === 0 ? (
                  <Text style={{ color: t.textMuted, marginTop: 24 }}>
                    No tickets on this map yet.
                  </Text>
                ) : null}
              </>
            ) : tab === 'tickets' ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
                  accessibilityLabel="Filter by state"
                >
                  {(['all', ...STATE_ORDER] as const).map((state) => (
                    <Pressable
                      key={state}
                      accessibilityRole="button"
                      accessibilityState={{ selected: state === filter }}
                      onPress={() => setFilter(state)}
                      style={{
                        minHeight: 44,
                        paddingHorizontal: 14,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor:
                          state === filter ? t.textPrimary : t.hairline,
                        backgroundColor:
                          state === filter ? t.textPrimary : t.surface,
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: state === filter ? t.plane : t.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {state === 'all'
                          ? `All ${map.total}`
                          : `${STATES[state].label} ${map.tickets.filter((ticket) => ticket.state === state).length}`}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Card>
                  {map.tickets
                    .filter(
                      (ticket) => filter === 'all' || ticket.state === filter,
                    )
                    .sort((a, b) => a.number - b.number)
                    .map((ticket) => (
                      <TicketRow
                        key={ticket.number}
                        ticket={ticket}
                        onPress={() => openTicket(ticket.number)}
                      />
                    ))}
                </Card>
              </>
            ) : (
              <>
                {(
                  [
                    ['destination', 'Destination'],
                    ['notes', 'Notes'],
                    ['decisions', 'Decided'],
                    ['fog', 'Not yet specified'],
                    ['outOfScope', 'Out of scope'],
                  ] as const
                )
                  .filter(([key]) => map.sections[key])
                  .map(([key, label]) => (
                    <View key={key}>
                      <Section>{label}</Section>
                      <Card>
                        <View style={{ padding: 16 }}>
                          <Markdown
                            body={map.sections[key]}
                            repo={ref.repo}
                            onIssue={openTicket}
                          />
                        </View>
                      </Card>
                    </View>
                  ))}
              </>
            )}
          </>
        ) : null}
      </ResourceBody>
    </Page>
  );
}
