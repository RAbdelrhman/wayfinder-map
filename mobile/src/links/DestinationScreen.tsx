import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { followedMaps, useBrowse } from '../maps/BrowseProvider';
import { Header, Page, ResourceBody } from '../maps/components';
import type { ObjectLink } from '../../../src/objectLinks';
import { mobileDestination } from './destination';

export function DestinationScreen({ link }: { link: ObjectLink }) {
  const { api, session } = useBrowse();
  const [revision, retry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A canonical string prevents a render from restarting a pending lookup.
  const key = JSON.stringify(link);
  useEffect(() => {
    const abort = new AbortController();
    setError(null);
    void (async () => {
      const parsed: ObjectLink = JSON.parse(key);
      const destination = await api.destination(parsed, { login: session.login, follows: await followedMaps(session.login) }, abort.signal);
      if (abort.signal.aborted) return;
      if (!destination) throw new Error('This issue or repository is no longer available to your GitHub account.');
      router.replace(mobileDestination(parsed, destination));
    })().catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'Couldn’t reach GitHub. Try again.'); });
    return () => abort.abort();
  }, [api, session.login, key, revision]);
  return <Page>
    <Header title="Wayfinder" back="Maps" onBack={() => router.replace('/')} />
    <ResourceBody resource={{ data: null, loading: error === null, refreshing: false, error, accessDenied: false, offline: false, savedAt: null, refresh: () => retry(value => value + 1) }}>{null}</ResourceBody>
  </Page>;
}
