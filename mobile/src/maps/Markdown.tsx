import { Text, View } from 'react-native';
import { openExternal, useTheme } from './components';

/** Render issue Markdown as native text. No HTML or remote scripts enter the app. */
export function Markdown({
  body,
  repo,
  onIssue,
}: {
  body: string;
  repo: string;
  onIssue?: (number: number) => void;
}) {
  const t = useTheme();
  const clean = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '');
  const inline = (text: string) =>
    text
      .split(
        /(\[[^\]]+\]\([^\s)]+\)|https?:\/\/[^\s<>]+|\*\*[^*]+\*\*|`[^`]+`|#\d+)/g,
      )
      .map((part, index) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        const url = link?.[2] ?? (/^https?:\/\//.test(part) ? part : null);
        const number = /^#(\d+)$/.exec(part)?.[1];
        if (number && onIssue)
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: t.accentText }}
              onPress={() => onIssue(Number(number))}
            >
              {part}
            </Text>
          );
        if (url) {
          const absolute = url.startsWith('/')
            ? `https://github.com${url}`
            : url;
          const local = new RegExp(
            `^https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/(\\d+)$`,
          ).exec(absolute);
          return (
            <Text
              key={index}
              accessibilityRole="link"
              style={{ color: t.accentText }}
              onPress={() => {
                if (local?.[1] && onIssue) onIssue(Number(local[1]));
                else void openExternal(absolute);
              }}
            >
              {link?.[1] ?? part}
            </Text>
          );
        }
        if (part.startsWith('**'))
          return (
            <Text
              key={index}
              style={{ fontWeight: '600', color: t.textPrimary }}
            >
              {part.slice(2, -2)}
            </Text>
          );
        if (part.startsWith('`'))
          return (
            <Text
              key={index}
              style={{ fontFamily: 'monospace', backgroundColor: t.wash }}
            >
              {part.slice(1, -1)}
            </Text>
          );
        return part;
      });
  let code = false;
  return (
    <View>
      {clean.split('\n').map((line, index) => {
        if (/^```/.test(line)) {
          code = !code;
          return null;
        }
        if (!line.trim()) return <View key={index} style={{ height: 8 }} />;
        const heading = /^#{1,6}\s+(.+)/.exec(line);
        const list = /^\s*[-*]\s+(?:\[([ xX])\]\s*)?(.*)/.exec(line);
        return (
          <Text
            key={index}
            selectable
            accessibilityRole={heading ? 'header' : 'text'}
            style={{
              color: heading ? t.textPrimary : t.textSecondary,
              fontSize: heading ? 17 : 14,
              fontWeight: heading ? '600' : '400',
              lineHeight: heading ? 25 : 22,
              marginTop: heading ? 14 : 2,
              fontFamily: code ? 'monospace' : undefined,
              backgroundColor: code ? t.wash : undefined,
            }}
          >
            {inline(
              heading?.[1] ??
                (list
                  ? `${list[1] !== undefined ? (list[1].toLowerCase() === 'x' ? '☑' : '☐') : '•'} ${list[2] ?? ''}`
                  : line),
            )}
          </Text>
        );
      })}
    </View>
  );
}
