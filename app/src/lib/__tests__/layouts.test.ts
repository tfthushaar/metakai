jest.mock('../../core/store/settings', () => ({ useSettings: jest.fn() }));

import { LAYOUTS, orderedSections } from '../../core/store/layouts';

describe('layout order', () => {
  it('uses the default order when nothing is saved', () => {
    expect(orderedSections('progress', []).map((s) => s.id)).toEqual(LAYOUTS.progress.sections.map((s) => s.id));
  });

  it('keeps the saved order and slots new sections after their neighbour', () => {
    const saved = ['weighins', 'chart', 'stats', 'body', 'health', 'calories'];
    expect(orderedSections('progress', saved).map((s) => s.id)).toEqual(['weighins', 'chart', 'stats', 'ranks', 'body', 'health', 'calories']);
  });

  it('drops unknown ids', () => {
    const ids = orderedSections('quick', ['gone', 'weighIn']).map((s) => s.id);
    expect(ids).not.toContain('gone');
    expect(ids.slice(0, 2)).toEqual(['logFood', 'weighIn']);
    expect(ids).toHaveLength(LAYOUTS.quick.sections.length);
  });
});
