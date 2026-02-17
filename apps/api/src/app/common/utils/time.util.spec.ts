import { timesOverlap } from './time.util';

describe('timesOverlap', () => {
  it('returns false for non-overlapping', () => {
    expect(timesOverlap('08:00', '09:00', '09:00', '10:00')).toBe(false);
  });

  it('returns true for overlapping', () => {
    expect(timesOverlap('08:00', '10:00', '09:30', '11:00')).toBe(true);
  });

  it('returns true for fully-contained overlap', () => {
    expect(timesOverlap('08:00', '12:00', '09:00', '10:00')).toBe(true);
  });
});

