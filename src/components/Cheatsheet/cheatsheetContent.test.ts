import { describe, it, expect } from 'vitest';
import { getCheatsheetSections } from './cheatsheetContent';
import { SLASH_COMMANDS } from '../Editor/slashCommandData';

describe('getCheatsheetSections', () => {
  it('starts with the Headings section', () => {
    const sections = getCheatsheetSections();
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].title).toBe('Headings');
  });

  it('every section has at least one item, and every item has non-empty syntax and description', () => {
    for (const section of getCheatsheetSections()) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.syntax.trim()).not.toBe('');
        expect(item.description.trim()).not.toBe('');
      }
    }
  });

  it('lists every registered slash command', () => {
    const sections = getCheatsheetSections();
    const slashSection = sections[sections.length - 1];
    for (const cmd of SLASH_COMMANDS) {
      expect(slashSection.items.some((item) => item.syntax === `/${cmd.command}`)).toBe(true);
    }
  });
});
