import Svg, { Circle, Path, Rect } from 'react-native-svg';

// The prototype's glyphs (24px grid, 2px round strokes), the same paths the desktop's icon set uses.
export type IconName = 'compass' | 'github' | 'copy' | 'refresh' | 'back';

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'compass' && (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="m15.5 8.5-2 5-5 2 2-5z" />
        </>
      )}
      {name === 'back' && <Path d="m15 18-6-6 6-6" />}
      {name === 'copy' && (
        <>
          <Rect x={9} y={9} width={13} height={13} rx={2} />
          <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </>
      )}
      {name === 'github' && (
        <Path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
      )}
      {name === 'refresh' && (
        <>
          <Path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <Path d="M21 3v5h-5" />
        </>
      )}
    </Svg>
  );
}
