import { describe, expect, it } from 'vitest';

import type { ProgressState } from '../progress.js';
import { choiceFrom, progressPanelHtml, streakLine, todayLine } from './progress.js';

const history = (today: number): number[] => [...Array<number>(83).fill(1), today];

const state = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  login: 'octo',
  settings: { style: 'trail', goal: 5 },
  days: history(3),
  streak: 4,
  warning: null,
  ...overrides,
});

/** Just enough of an element for `closest` to find a panel button by its data attributes. */
function button(dataset: Record<string, string>): Element {
  const element = { dataset, closest: () => element };
  return element as unknown as Element;
}

describe('progressPanelHtml', () => {
  it('draws the Trail by default: terrain and a five-week calendar', () => {
    const html = progressPanelHtml(state());
    expect(html).toContain('data-style="trail"');
    expect(html).toContain('class="progress-trail"');
    expect(html.match(/<i /g)).toHaveLength(35);
    expect(html).not.toContain('progress-hex');
    expect(html).not.toContain('progress-weeks');
  });

  it('draws the chosen style', () => {
    const hex = progressPanelHtml(state({ settings: { style: 'hex', goal: 5 } }));
    expect(hex).toContain('class="progress-hex"');
    expect(hex).toContain('class="progress-flags"');
    expect(hex.match(/<polygon class="land"/g)).toHaveLength(35);

    const bar = progressPanelHtml(state({ settings: { style: 'bar', goal: 5 } }));
    expect(bar).toContain('class="progress-bar" style="--p:0.6"');
    expect(bar.match(/<i style="--v:/g)).toHaveLength(84);
  });

  it('marks the chosen style and goal as pressed', () => {
    const html = progressPanelHtml(state({ settings: { style: 'bar', goal: 8 } }));
    expect(html).toContain('data-progress-style="bar" aria-pressed="true"');
    expect(html).toContain('data-progress-style="trail" aria-pressed="false"');
    expect(html).toContain('data-progress-goal="8" aria-pressed="true"');
    expect(html.match(/data-progress-goal="(\d)"/g)).toEqual(['data-progress-goal="3"', 'data-progress-goal="5"', 'data-progress-goal="8"']);
  });

  it('shows today against the goal and the streak line', () => {
    const html = progressPanelHtml(state());
    expect(html).toContain('<b>3/5</b><span>2 more to clear today</span>');
    expect(html).toContain('4-day streak');
  });

  it('shows a blank panel with no streak when signed out', () => {
    const html = progressPanelHtml(state({ login: null, days: null, streak: 0 }));
    expect(html).toContain('<b>–</b><span>Sign in to count today</span>');
    expect(html).not.toContain('progress-streak');
  });

  it('shows why the history is missing when GitHub failed', () => {
    const html = progressPanelHtml(state({ days: null, warning: 'Could not read <completed> tickets.' }));
    expect(html).toContain('Could not read &lt;completed&gt; tickets.');
  });
});

describe('todayLine and streakLine', () => {
  it('reads how far today is from the goal', () => {
    expect(todayLine(1, 3)).toBe('2 more to clear today');
    expect(todayLine(5, 5)).toBe('goal met');
    expect(todayLine(7, 5)).toBe('goal met, 2 extra');
  });

  it('invites a first ticket when there is no streak', () => {
    expect(streakLine(0)).toBe('Clear one ticket to start a streak');
    expect(streakLine(1)).toBe('1-day streak');
  });
});

describe('choiceFrom', () => {
  const current = { style: 'trail', goal: 5 } as const;

  it('reads a style or goal choice', () => {
    expect(choiceFrom(button({ progressStyle: 'hex' }), current)).toEqual({ style: 'hex' });
    expect(choiceFrom(button({ progressGoal: '8' }), current)).toEqual({ goal: 8 });
  });

  it('ignores the current choice, unknown values and clicks elsewhere', () => {
    expect(choiceFrom(button({ progressStyle: 'trail' }), current)).toBeNull();
    expect(choiceFrom(button({ progressGoal: '5' }), current)).toBeNull();
    expect(choiceFrom(button({ progressStyle: 'pie' }), current)).toBeNull();
    expect(choiceFrom(button({ progressGoal: '4' }), current)).toBeNull();
    expect(choiceFrom(null, current)).toBeNull();
  });
});
