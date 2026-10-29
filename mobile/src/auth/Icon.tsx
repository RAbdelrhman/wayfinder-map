import Svg, { Circle, Path, Rect } from 'react-native-svg';

// The prototype's glyphs (24px grid, 2px round strokes), the same paths the desktop's icon set uses.
export type IconName =
  | 'compass'
  | 'github'
  | 'copy'
  | 'refresh'
  | 'back'
  | 'check'
  | 'external'
  | 'signout'
  | 'search'
  | 'plus'
  | 'eyeoff'
  | 'help'
  | 'tag'
  | 'cloudoff'
  | 'filter'
  | 'down'
  | 'chevron'
  | 'lock'
  | 'person'
  | 'arrow'
  | 'research'
  | 'prototype'
  | 'grilling'
  | 'task';

export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
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
      {name === 'check' && <Path d="M20 6 9 17l-5-5" />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" />}
      {name === 'eyeoff' && (
        <>
          <Path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A11 11 0 0 1 12 4c5 0 8.7 3.1 10 8a12.8 12.8 0 0 1-3 4.2M6.3 6.3A13 13 0 0 0 2 12c1.3 4.9 5 8 10 8 1.4 0 2.8-.3 4-.8" />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx={10.5} cy={10.5} r={6.5} />
          <Path d="m16 16 5 5" />
        </>
      )}
      {name === 'help' && <><Circle cx={12} cy={12} r={9} /><Path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" /></>}
      {name === 'tag' && <><Path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><Circle cx={7.5} cy={7.5} r={1.5} /></>}
      {name === 'cloudoff' && <Path d="M3 3l18 18M8.5 6.2A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.6 7M17 19H7a5 5 0 0 1-1.6-9.7" />}
      {name === 'filter' && (
        <>
          <Path d="M4 5h16M7 12h10M10 19h4" />
        </>
      )}
      {name === 'down' && <Path d="m6 9 6 6 6-6" />}
      {name === 'chevron' && <Path d="m9 6 6 6-6 6" />}
      {name === 'lock' && (
        <>
          <Rect x={4} y={10} width={16} height={11} rx={2} />
          <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === 'person' && (
        <>
          <Circle cx={12} cy={7} r={4} />
          <Path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </>
      )}
      {name === 'arrow' && <Path d="M4 12h16m-6-6 6 6-6 6" />}
      {name === 'research' && (
        <>
          <Path d="M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8" />
        </>
      )}
      {name === 'prototype' && (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} />
          <Path d="M3 9h18M8 9v11" />
        </>
      )}
      {name === 'grilling' && (
        <Path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z" />
      )}
      {name === 'task' && (
        <>
          <Rect x={4} y={3} width={16} height={18} rx={2} />
          <Path d="m8 12 3 3 5-6" />
        </>
      )}
      {name === 'external' && (
        <>
          <Path d="M15 3h6v6" />
          <Path d="M10 14 21 3" />
          <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </>
      )}
      {name === 'signout' && (
        <>
          <Path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
          <Path d="M16 17l5-5-5-5" />
          <Path d="M21 12H9" />
        </>
      )}
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
