import { buildTypeOrmOptions } from './database.config.js';

describe('buildTypeOrmOptions DATABASE_SYNCHRONIZE', () => {
  const build = (value?: string) => {
    const config = {
      get: vi.fn((key: string) => {
        if (key === 'DATABASE_TYPE') return 'sqlite';
        if (key === 'DATABASE_SYNCHRONIZE') return value;
        if (key === 'DATABASE_FILE') return ':memory:';
        return undefined;
      }),
    } as any;
    return buildTypeOrmOptions(config);
  };

  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
    ['invalid', false],
  ])('DATABASE_SYNCHRONIZE=%s resulta em synchronize=%s', (value, expected) => {
    expect(build(value as string | undefined).synchronize).toBe(expected);
  });
});
