import { describe, it, expect } from 'vitest';
import { matchSlashTrigger, SLASH_COMMANDS } from './slashCommands';

describe('matchSlashTrigger', () => {
  it('matches a bare "/" at the start of a line', () => {
    expect(matchSlashTrigger('/')).toEqual({ slashColumn: 1 });
  });

  it('matches while the command name is still being typed', () => {
    expect(matchSlashTrigger('/tab')).toEqual({ slashColumn: 1 });
  });

  it('matches after leading whitespace (indented list/block)', () => {
    expect(matchSlashTrigger('  /note')).toEqual({ slashColumn: 3 });
  });

  it('matches after a preceding word plus whitespace', () => {
    expect(matchSlashTrigger('some text /mermaid')).toEqual({ slashColumn: 11 });
  });

  it('does not match "/" glued to the end of a word', () => {
    expect(matchSlashTrigger('path/to/file')).toBeNull();
  });

  it('does not match a URL scheme separator', () => {
    expect(matchSlashTrigger('https://example.com')).toBeNull();
  });

  it('does not match once a space follows the command name', () => {
    expect(matchSlashTrigger('/table ')).toBeNull();
  });

  it('does not match with no slash on the line at all', () => {
    expect(matchSlashTrigger('just some text')).toBeNull();
  });
});

describe('SLASH_COMMANDS', () => {
  it('has a unique command name per entry', () => {
    const names = SLASH_COMMANDS.map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every insertText is a balanced, non-empty snippet', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.insertText.length).toBeGreaterThan(0);
      expect(cmd.insertText).toContain('$0');
    }
  });

  it('includes the commands called out in the feature request', () => {
    const names = SLASH_COMMANDS.map((c) => c.command);
    for (const expected of ['table', 'note', 'tip', 'mermaid', 'math']) {
      expect(names).toContain(expected);
    }
  });
});
