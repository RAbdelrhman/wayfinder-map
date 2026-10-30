import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, Text, useColorScheme, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { followedMaps, useBrowse } from '../maps/BrowseProvider';
import { GithubNetworkError, isGithubAccessDenied, mayViewMap, validRef } from '../maps/github';
import { readCache } from '../maps/cache';
import { isMapDetail } from '../maps/validate';
import { Card, useTheme, openExternal } from '../maps/components';
import { downloadCanvas } from './download';
import { canvasFiles, removeCanvasFiles } from './files';
import { allowedCanvasNavigation, canvasHost } from './host';
import type { CanvasPackage } from './package';
import { embeddedCanvas } from './embed';
import type { CanvasAssets } from './embed';
import { canvasSourceRef, matchesCanvasRequest } from './source';
import { canvasManifests } from './manifest';

export function CanvasScreen() {
  const params = useLocalSearchParams<{ repo: string; number: string; mapNumber: string; board?: string; rev?: string; page?: string; item?: string }>();
  const repo = typeof params.repo === 'string' ? params.repo : '';
  const ticket = Number(params.number), mapNumber = Number(params.mapNumber);
  const { api, session } = useBrowse();
  const t = useTheme();
  const systemTheme = useColorScheme();
  const [canvas, setCanvas] = useState<CanvasPackage | null>(null);
  const [assets, setAssets] = useState<CanvasAssets | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ files: 0, bytes: 0 });
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [revision, refresh] = useState(0);
  const [pageId, setPage] = useState(params.page ?? '');
  const [itemId, setItem] = useState(params.item ?? '');
  const [panel, setPanel] = useState<'more' | 'pages' | null>(null);
  const [notes, setNotes] = useState(false);
  const [full, setFull] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [stage, setStage] = useState({ width: 390, height: 650 });
  const [zoomLevel, setZoom] = useState<number | null>(null);
  const frame = useRef<WebView>(null);
  const controller = useRef<AbortController | null>(null);
  const back = () => { controller.current?.abort(); if (router.canGoBack()) router.back(); else router.replace('/'); };
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    setLoading(true); setError(''); setOffline(false);
    void (async () => {
      if (!validRef({ repo, number: ticket }) || !Number.isSafeInteger(mapNumber) || mapNumber < 1)
        throw new Error('This canvas needs its original map and ticket.');
      if (params.rev && !/^[a-f\d]{40}$/i.test(params.rev)) throw new Error('Invalid prototype revision.');
      const latest = canvasFiles(session.login, repo, mapNumber, ticket, 'latest');
      const manifests = canvasManifests(sha => canvasFiles(session.login, repo, mapNumber, ticket, sha), params.rev);
      try {
        const map = await api.map({ repo, number: mapNumber }, abort.signal, { login: session.login, follows: await followedMaps(session.login) });
        if (!map.tickets.some(item => item.number === ticket && item.type === 'prototype')) {
          removeCanvasFiles(session.login, repo, mapNumber, ticket);
          throw new Error('This prototype is no longer in this map.');
        }
        const ref = await canvasSourceRef(api, repo, ticket, params.rev, abort.signal);
        if (!ref) throw new Error('No canvas was found for this ticket.');
        const sha = ref.sha;
        const storage = canvasFiles(session.login, repo, mapNumber, ticket, sha);
        const source = { prototypeTree: api.prototypeTree.bind(api),
          prototypeBlob: async (repository: string, blob: string, signal?: AbortSignal) => {
            const path = `blobs/${blob}.txt`;
            if (latest.has(path)) return latest.text(path);
            const contents = await api.prototypeBlob(repository, blob, signal);
            latest.write(path, contents);
            return contents;
          } };
        const result = await downloadCanvas(source, storage, { repo, mapNumber, ticket, branch: ref.branch, sha,
          ...(params.board ? { board: params.board } : {}) }, abort.signal, (files, bytes) => {
          if (!abort.signal.aborted) setProgress({ files, bytes });
        });
        if (abort.signal.aborted) return;
        manifests.save(result);
        setAssets(JSON.parse(await storage.text('assets.json')) as CanvasAssets);
        setCanvas(result);
      } catch (failure) {
        if (abort.signal.aborted) return;
        if (failure instanceof GithubNetworkError) {
          const manifest = await manifests.read();
          if (!manifest) throw failure;
          const parent = await readCache(AsyncStorage, session.login, `map:${repo.toLowerCase()}#${mapNumber}`, isMapDetail);
          if (!parent || !mayViewMap(parent.data, { login: session.login, follows: await followedMaps(session.login) })
            || !parent.data.tickets.some(value => value.number === ticket)) throw failure;
          const saved: unknown = JSON.parse(manifest);
          if (saved && typeof saved === 'object' && 'sha' in saved && typeof saved.sha === 'string'
            && /^[a-f\d]{40}$/i.test(saved.sha) && 'board' in saved && typeof saved.board === 'string') {
            // Rebuild metadata from the immutable config, rather than trusting serialized paths.
            const cached = canvasFiles(session.login, repo, mapNumber, ticket, saved.sha);
            const { packagePages, canvasMetadata, safeAssetPath, isCanvasForTicket } = await import('./package');
            if (!safeAssetPath(saved.board) || !matchesCanvasRequest({ sha: saved.sha, board: saved.board },
              { ...(params.rev ? { revision: params.rev } : {}), ...(params.board ? { board: params.board } : {}) })) throw failure;
            const config = await cached.text(saved.board.replace(/[^/]+$/, 'config.js'));
            if (!isCanvasForTicket(config, ticket)) throw failure;
            const pages = packagePages(config);
            setAssets(JSON.parse(await cached.text('assets.json')) as CanvasAssets);
            setCanvas({ repo, ticket, mapNumber, sha: saved.sha, board: saved.board, branch: '', ...canvasMetadata(config), pages,
              files: [], bytes: 0, savedAt: 'savedAt' in saved && typeof saved.savedAt === 'number' ? saved.savedAt : 0, directory: cached.uri('') });
            setOffline(true); return;
          }
        }
        if (isGithubAccessDenied(failure)) { removeCanvasFiles(session.login, repo, mapNumber, ticket); setCanvas(null); }
        throw failure;
      }
    })().catch(failure => { if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'Couldn’t download this canvas.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [api, repo, ticket, mapNumber, session.login, params.board, params.rev, revision]);

  const page = canvas?.pages.find(value => value.id === pageId) ?? canvas?.pages[0];
  const item = page?.items.find(value => value.id === itemId) ?? page?.items[0];
  const selected = page?.items.findIndex(value => value.id === item?.id) ?? 0;
  const resolvedTheme = theme ?? (systemTheme === 'light' ? 'light' : 'dark');
  const fit = Math.min(stage.width / (item?.width ?? 1440), stage.height / (item?.height ?? 900), 1);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => setZoom(null), [page?.id, item?.id, resolvedTheme]);
  const rendered = useMemo(() => {
    try { return { html: canvas && item?.src && assets ? canvasHost(embeddedCanvas(assets, canvas.board, item.src, resolvedTheme),
      item.width ?? 1440, item.height ?? 900, resolvedTheme) : null, error: '' }; }
    catch { return { html: null, error: 'Can’t download this canvas' }; }
  }, [canvas, item, assets, resolvedTheme]);
  const source = rendered.html;
  const problem = error || rendered.error;
  const zoom = (factor: number) => { frame.current?.injectJavaScript(`window.canvasZoom(${factor});true;`);
    setZoom(value => factor === 0 ? null : Math.max(fit, Math.min(3, (value ?? fit) * factor))); };
  const pinchDistance = useRef(0);
  const pinch = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: event => event.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponderCapture: event => event.nativeEvent.touches.length === 2,
    onPanResponderGrant: event => { const [a, b] = event.nativeEvent.touches; pinchDistance.current = a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0; },
    onPanResponderMove: event => { const [a, b] = event.nativeEvent.touches; if (!a || !b) return;
      const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
      if (pinchDistance.current) {
        const factor = distance / pinchDistance.current;
        frame.current?.injectJavaScript(`window.canvasZoom(${factor});true;`);
        setZoom(value => Math.max(fitRef.current, Math.min(3, (value ?? fitRef.current) * factor)));
      }
      pinchDistance.current = distance;
    },
  }), []);
  const button = (label: string, onPress: () => void, text: string, disabled = false) => <Pressable accessibilityRole="button"
    accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={{ minWidth: 44, minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
    <Text style={{ color: t.textPrimary, fontSize: 17 }}>{text}</Text></Pressable>;
  const content = <View style={{ flex: 1, backgroundColor: t.plane }}>
    <StatusBar hidden={full} />
    {!full ? <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: t.hairline }}>
      {button(`Back to #${ticket}`, back, `‹ #${ticket}`)}
      <Pressable accessibilityRole="button" accessibilityLabel="Canvas pages" onPress={() => setPanel('pages')} style={{ flex: 1, padding: 8 }}>
        <Text numberOfLines={1} style={{ color: t.textPrimary, textAlign: 'center', fontWeight: '600' }}>{page?.title ?? 'Downloading…'} ▾</Text>
        <Text numberOfLines={1} style={{ color: t.textMuted, textAlign: 'center', fontSize: 11 }}>{canvas?.title ?? `#${ticket}’s canvas`}</Text>
      </Pressable>
      {button('More', () => setPanel('more'), '···', !canvas)}
    </View> : null}
    {offline ? <Text style={{ color: t.textSecondary, padding: 8 }}>Saved on this phone · {new Date(canvas?.savedAt ?? 0).toLocaleDateString()}</Text> : null}
    <View style={{ flex: 1 }} onLayout={event => setStage(event.nativeEvent.layout)} {...pinch.panHandlers}>
      {source && canvas && !loading && !problem ? <WebView ref={frame} key={`${canvas.sha}:${page?.id}:${item?.id}:${resolvedTheme}`}
        source={{ html: source }} originWhitelist={['*']}
        javaScriptEnabled domStorageEnabled={false} sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false}
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows
        onShouldStartLoadWithRequest={request => allowedCanvasNavigation(request.url)}
        onError={() => setError('Couldn’t open this option. Try again.')}
        style={{ flex: 1, backgroundColor: t.plane }} /> : <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Card>{loading ? <><ActivityIndicator color={t.textSecondary} /><Text style={{ color: t.textPrimary, textAlign: 'center', margin: 12 }}>Downloading the canvas</Text>
            <Text style={{ color: t.textMuted, textAlign: 'center' }}>{progress.files} files · {(progress.bytes / 1024 / 1024).toFixed(1)} MB</Text>{button('Cancel download', back, 'Cancel')}</> : <>
            <Text style={{ color: t.textPrimary }}>{problem || 'Can’t download this canvas'}</Text>{button('Try again', () => refresh(value => value + 1), 'Try again')}</>}</Card>
        </View>}
      {source && !loading && !problem && !full && !notes ? <View style={{ position: 'absolute', bottom: 14, right: 14, flexDirection: 'row', borderRadius: 12, backgroundColor: t.surface }}>
        {button('Zoom out', () => zoom(0.8), '−')}{button('Fit to the screen', () => zoom(0), `${Math.round((zoomLevel ?? fit) * 100)}%`)}{button('Zoom in', () => zoom(1.25), '+')}
      </View> : null}
      {full ? <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: t.surface, borderRadius: 22 }}>{button('Exit full screen', () => setFull(false), 'Exit full screen')}</View> : null}
    </View>
    {!full && canvas && page && item ? <>
      {notes ? <View style={{ maxHeight: 200, backgroundColor: t.surface, padding: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: t.textPrimary, fontWeight: '600', flex: 1 }}>{item.id} · {item.name}</Text>{button('Hide notes', () => setNotes(false), '×')}</View>
        <ScrollView><Text selectable style={{ color: t.textSecondary, lineHeight: 21 }}>{canvas.notes[item.id] || ''}</Text><Text style={{ color: t.textMuted, marginTop: 12 }}>{canvas.question}</Text></ScrollView></View> : null}
      <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 8, gap: 6 }}>
        {page.items.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.id}, ${option.name}`} accessibilityState={{ selected: option.id === item.id }}
          onPress={() => setItem(option.id)} style={{ minWidth: 44, minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: option.id === item.id ? t.surface : t.plane, borderWidth: 1, borderColor: t.hairline, borderRadius: 8 }}>
          <Text style={{ color: t.textPrimary }}>{option.id}</Text></Pressable>)}
      </ScrollView></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: t.hairline }}>
        {button('Previous option', () => setItem(page.items[(selected - 1 + page.items.length) % page.items.length]?.id ?? ''), '‹')}
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: t.textPrimary, fontWeight: '600' }}>{item.name}</Text>
          <Text style={{ color: t.textMuted, fontSize: 11 }}>{item.id} · {selected + 1} of {page.items.length}</Text></View>
        {button('Next option', () => setItem(page.items[(selected + 1) % page.items.length]?.id ?? ''), '›')}{button('Full screen', () => setFull(true), '⛶')}
      </View>
    </> : null}
    <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
      <Pressable accessibilityLabel="Close menu" onPress={() => setPanel(null)} style={{ flex: 1, backgroundColor: '#00000055', justifyContent: 'flex-start', paddingTop: 80, paddingHorizontal: 16 }}>
        <View style={{ backgroundColor: t.surface, borderRadius: 12, padding: 8, maxHeight: '80%' }}>
          <ScrollView>{panel === 'pages' ? canvas?.pages.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ selected: page?.id === option.id }}
            onPress={() => { setPage(option.id); setItem(''); setPanel(null); }} style={{ padding: 14 }}><Text style={{ color: t.textPrimary }}>{option.title}</Text><Text style={{ color: t.textMuted }}>{option.round} · {option.items.length} options</Text></Pressable>) : <>
            {button('Notes', () => { setNotes(value => !value); setPanel(null); }, 'Notes')}
            {button('Open on GitHub', () => { setPanel(null); if (canvas) void openExternal(`https://github.com/${repo}/tree/${canvas.sha}/${canvas.board}`); }, 'Open on GitHub')}
            {button('Check for changes', () => { setPanel(null); refresh(value => value + 1); }, 'Check for changes')}
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>{button('System theme', () => { setTheme(null); setPanel(null); }, 'System')}{button('Light theme', () => { setTheme('light'); setPanel(null); }, 'Light')}{button('Dark theme', () => { setTheme('dark'); setPanel(null); }, 'Dark')}</View>
            <Text style={{ color: t.textMuted, textAlign: 'center', padding: 8 }}>Saved on this phone · {((canvas?.bytes ?? 0) / 1024 / 1024).toFixed(1)} MB · {canvas?.files.length ?? 0} files</Text>
          </>}</ScrollView>
        </View>
      </Pressable>
    </Modal>
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: t.plane }} edges={full ? [] : ['top', 'right', 'bottom', 'left']}>{content}</SafeAreaView>;
}
