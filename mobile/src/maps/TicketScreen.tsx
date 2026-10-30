import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Icon } from '../auth/Icon';
import { followedMaps, useBrowse, useResource } from './BrowseProvider';
import { isGithubAccessDenied, mayViewMap } from './github';
import { readCache, removeMapContents } from './cache';
import {
  Card,
  Header,
  Page,
  ResourceBody,
  Section,
  stateColor,
  StateChip,
  STATES,
  styles,
  Tabs,
  TicketRow,
  useTheme,
} from './components';
import { routeRef } from './MapScreen';
import { Markdown } from './Markdown';
import { isMapDetail, isTicketDetail } from './validate';

export function TicketScreen() {
  const params = useLocalSearchParams<{
    repo: string;
    number: string;
    mapNumber?: string;
  }>();
  const ref = routeRef(params);
  const { api, session } = useBrowse();
  const mapNumber = params.mapNumber ? Number(params.mapNumber) : null;
  const parentKey =
    mapNumber && Number.isSafeInteger(mapNumber) && mapNumber > 0
      ? `${ref.repo.toLowerCase()}#${mapNumber}`
      : null;
  const t = useTheme();
  const [tab, setTab] = useState<'overview' | 'links' | 'activity'>('overview');
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (parentKey && mapNumber) {
        try {
          await api.assertMapAccess(
            { repo: ref.repo, number: mapNumber },
            {
              login: session.login,
              follows: await followedMaps(session.login),
            },
            signal,
          );
        } catch (error) {
          if (isGithubAccessDenied(error))
            await removeMapContents(AsyncStorage, session.login, {
              repo: ref.repo,
              number: mapNumber,
            });
          throw error;
        }
      }
      return api.ticket({ repo: ref.repo, number: ref.number }, signal);
    },
    [api, ref.repo, ref.number, parentKey, mapNumber, session.login],
  );
  const canUseCached = useCallback(async () => {
    if (!parentKey) return true;
    const parent = await readCache(
      AsyncStorage,
      session.login,
      `map:${parentKey}`,
      isMapDetail,
    );
    return (
      !!parent &&
      mayViewMap(parent.data, {
        login: session.login,
        follows: await followedMaps(session.login),
      })
    );
  }, [parentKey, session.login]);
  const resource = useResource(
    parentKey
      ? `ticket-map:${parentKey}:${ref.number}`
      : `ticket:${ref.repo.toLowerCase()}#${ref.number}`,
    load,
    isTicketDetail,
    canUseCached,
  );
  const detail = resource.data;
  const ticket = detail?.ticket;
  const openTicket = (number: number) =>
    router.push({
      pathname: '/ticket',
      params: {
        repo: ref.repo,
        number,
        ...(params.mapNumber ? { mapNumber: params.mapNumber } : {}),
      },
    });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const banner =
    ticket?.state === 'blocked'
      ? `Waiting on ${ticket.openBlockers.map((n) => `#${n}`).join(' and ')}.`
      : ticket?.state === 'claimed'
        ? `@${ticket.assignee} is on it.`
        : ticket?.state === 'done'
          ? 'This ticket is closed.'
          : 'Open, unblocked and unclaimed: ready to start.';
  return (
    <Page>
      <Header
        title={`#${ref.number}`}
        back="Map"
        onBack={back}
        url={`https://github.com/${ref.repo}/issues/${ref.number}`}
      />
      <ResourceBody resource={resource} warnings={detail?.warnings ?? []}>
        {ticket && detail ? (
          <>
            <View style={[styles.legend, { marginTop: 12 }]}>
              <Icon name={ticket.type ?? 'task'} color={t.textSecondary} />
              <Text style={{ color: t.textMuted, fontSize: 13 }}>
                #{ticket.number} · {ticket.type ?? 'Issue'}
              </Text>
              <StateChip state={ticket.state} />
            </View>
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 24,
                fontWeight: '600',
                color: t.textPrimary,
                lineHeight: 31,
                marginTop: 10,
                marginBottom: 16,
              }}
            >
              {ticket.title}
            </Text>
            <View style={{ marginHorizontal: -16 }}>
              <Tabs
                tabs={[
                  { key: 'overview', label: 'Overview' },
                  {
                    key: 'links',
                    label: `Links ${detail.needs.length + detail.unblocks.length}`,
                  },
                  {
                    key: 'activity',
                    label: `Activity ${detail.comments.length}`,
                  },
                ]}
                selected={tab}
                onSelect={setTab}
                label="Ticket sections"
              />
            </View>
            {tab === 'overview' ? (
              <>
                <View
                  style={{
                    backgroundColor: t.surface,
                    borderLeftWidth: 3,
                    borderLeftColor: stateColor(t, ticket.state),
                    borderRadius: 10,
                    padding: 14,
                    flexDirection: 'row',
                    gap: 10,
                    marginVertical: 8,
                  }}
                >
                  <Icon
                    name={STATES[ticket.state].icon}
                    color={stateColor(t, ticket.state)}
                  />
                  <Text
                    style={{ color: t.textSecondary, flex: 1, lineHeight: 21 }}
                  >
                    {banner}
                  </Text>
                </View>
                <Markdown
                  body={ticket.body || 'No description provided.'}
                  repo={ref.repo}
                  onIssue={openTicket}
                />
              </>
            ) : tab === 'links' ? (
              <>
                {(
                  [
                    ['needs', 'Needs'],
                    ['unblocks', 'Unblocks'],
                  ] as const
                ).map(([key, label]) => (
                  <View key={key}>
                    <Section>{label}</Section>
                    {detail[key].length ? (
                      <Card>
                        {detail[key].map((linked) => (
                          <TicketRow
                            key={linked.number}
                            ticket={linked}
                            onPress={() => openTicket(linked.number)}
                          />
                        ))}
                      </Card>
                    ) : (
                      <Text style={{ color: t.textMuted }}>None</Text>
                    )}
                  </View>
                ))}
              </>
            ) : (
              <>
                {detail.comments.length ? (
                  detail.comments.map((comment) => (
                    <View
                      key={comment.id}
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: t.gridline,
                        paddingVertical: 16,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <Text
                          style={{
                            color: t.textPrimary,
                            fontSize: 14,
                            fontWeight: '600',
                          }}
                        >
                          @{comment.author}
                        </Text>
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Markdown
                        body={comment.body}
                        repo={ref.repo}
                        onIssue={openTicket}
                      />
                    </View>
                  ))
                ) : (
                  <Text style={{ color: t.textMuted, paddingVertical: 24 }}>
                    No comments yet.
                  </Text>
                )}
              </>
            )}
          </>
        ) : null}
      </ResourceBody>
    </Page>
  );
}
