import path from 'node:path';
import { RepositoryTools } from './repository-tools';

describe('RepositoryTools', () => {
  it('blocks path traversal', () => {
    const tools = new RepositoryTools(path.resolve(__dirname));
    expect(() => tools.resolveSafe('../package.json')).not.toThrow();
    const resolved = tools.resolveSafe('../package.json');
    expect(resolved.startsWith(path.resolve(__dirname))).toBe(true);
  });

  it('rejects absolute paths', () => {
    const tools = new RepositoryTools(path.resolve(__dirname));
    expect(() => tools.resolveSafe(path.resolve('package.json'))).toThrow('Only repository-relative paths are allowed');
  });
});
