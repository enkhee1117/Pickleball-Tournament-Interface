import { describe, expect, it } from 'vitest';
import { greetingForHour } from './HomeGreeting';

describe('greetingForHour', () => {
  it('returns "Late night" before 5am', () => {
    expect(greetingForHour(0)).toBe('Late night');
    expect(greetingForHour(4)).toBe('Late night');
  });

  it('returns "Good morning" between 5am and noon', () => {
    expect(greetingForHour(5)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
  });

  it('returns "Good afternoon" between noon and 6pm', () => {
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good afternoon');
  });

  it('returns "Good evening" after 6pm', () => {
    expect(greetingForHour(18)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});
