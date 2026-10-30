// The desktop's tokens (src/ui/styles.css), light and dark, as the sign-in prototype uses them.
export const themes = {
  light: {
    surface: '#fcfcfb',
    plane: '#f4f4f1',
    textPrimary: '#0b0b0b',
    textSecondary: '#52514e',
    textMuted: '#6b6a65',
    gridline: '#dcdbd3',
    hairline: 'rgba(11, 11, 11, 0.1)',
    wash: 'rgba(11, 11, 11, 0.05)',
    onAccent: '#ffffff',
    accentFill: '#1f6bc8',
    accentText: '#1f6bc8',
    stateClaimed: '#2a78d6',
    stateFailed: '#b42318',
    stateFrontier: '#0ca30c',
    stateBlocked: '#fab219',
  },
  dark: {
    surface: '#1a1a19',
    plane: '#0d0d0d',
    textPrimary: '#ffffff',
    textSecondary: '#c3c2b7',
    textMuted: '#9a9892',
    gridline: '#2c2c2a',
    hairline: 'rgba(255, 255, 255, 0.1)',
    wash: 'rgba(255, 255, 255, 0.06)',
    onAccent: '#ffffff',
    accentFill: '#1f6bc8',
    accentText: '#3987e5',
    stateClaimed: '#3987e5',
    stateFailed: '#ff8782',
    stateFrontier: '#0ca30c',
    stateBlocked: '#fab219',
  },
};

export type Theme = (typeof themes)['light'];
