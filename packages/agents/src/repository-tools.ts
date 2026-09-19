import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import fg from 'fast-glob';

const execFileAsync = promisify(execFile);

export type RepositorySnapshot = {
  root: string;
  branch: string;
  commitSha: string;
  changedFiles: string[];
  diff: string;
};

export class RepositoryTools {
  private readonly root: string;

  constructor(repositoryRoot: string) {
    this.root = path.resolve(repositoryRoot);
  }

  getRoot(): string {
    return this.root;
  }

  async assertValidRoot(): Promise<void> {
    const stat = await fs.stat(this.root);
    if (!stat.isDirectory()) {
      throw new Error('Repository root is not a directory');
    }
  }

  resolveSafe(relativePath: string): string {
    if (!relativePath || path.isAbsolute(relativePath)) {
      throw new Error('Only repository-relative paths are allowed');
    }
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolved = path.resolve(this.root, normalized);
    const relative = path.relative(this.root, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Path traversal is not allowed');
    }
    return resolved;
  }

  async readFile(relativePath: string, maxBytes = 12000): Promise<string> {
    const fullPath = this.resolveSafe(relativePath);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      throw new Error('Path is not a file');
    }
    if (stat.size > maxBytes) {
      const handle = await fs.open(fullPath, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes);
        await handle.read(buffer, 0, maxBytes, 0);
        return `${buffer.toString('utf8')}\n\n[TRUNCATED: file exceeded ${maxBytes} bytes]`;
      } finally {
        await handle.close();
      }
    }
    return fs.readFile(fullPath, 'utf8');
  }

  async searchRepository(query: string, limit = 20): Promise<Array<{ file: string; line: number; text: string }>> {
    const files = await this.listSourceFiles();
    const results: Array<{ file: string; line: number; text: string }> = [];
    const needle = query.toLowerCase();
    for (const file of files) {
      if (results.length >= limit) break;
      const content = await this.readFile(file, 30000).catch(() => '');
      const lines = content.split(/\r?\n/);
      lines.forEach((text, index) => {
        if (results.length < limit && text.toLowerCase().includes(needle)) {
          results.push({ file, line: index + 1, text: redactSecrets(text.trim()) });
        }
      });
    }
    return results;
  }

  async getRelatedTests(file: string): Promise<string[]> {
    const basename = path.basename(file).replace(/\.(service|controller|module|dto)?\.?ts$/, '');
    const files = await fg(['**/*.spec.ts', '**/*.test.ts'], { cwd: this.root, dot: false, absolute: false });
    return files.filter((candidate) => candidate.toLowerCase().includes(basename.toLowerCase()));
  }

  async getPackageInfo(): Promise<string> {
    return this.readFile('package.json', 8000);
  }

  async getCodingStandards(): Promise<string> {
    const candidates = ['CODING_STANDARDS.md', 'README.md'];
    for (const candidate of candidates) {
      try {
        return await this.readFile(candidate, 8000);
      } catch {
        // keep looking
      }
    }
    return 'Use strict TypeScript, DTO validation, dependency injection, least privilege, and meaningful tests.';
  }

  async getSnapshot(maxFiles = 30): Promise<RepositorySnapshot> {
    await this.assertValidRoot();
    const branch = await this.git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => 'unknown');
    const commitSha = await this.git(['rev-parse', '--short', 'HEAD']).catch(() => 'uncommitted');
    const changedFiles = await this.getChangedFiles(maxFiles);
    const diff = await this.getGitDiff();
    return { root: this.root, branch: branch.trim(), commitSha: commitSha.trim(), changedFiles, diff };
  }

  async getGitDiff(): Promise<string> {
    const diff = await this.git(['diff', '--', '.']).catch(() => '');
    const staged = await this.git(['diff', '--cached', '--', '.']).catch(() => '');
    const untracked = await this.untrackedPseudoDiff();
    return [diff, staged, untracked].filter(Boolean).join('\n');
  }

  private async getChangedFiles(maxFiles: number): Promise<string[]> {
    const status = await this.git(['status', '--short']).catch(() => '');
    const files = status
      .split(/\r?\n/)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((file) => file.replace(/^"|"$/g, ''))
      .filter((file) => !file.startsWith('..'))
      .flatMap((file) => (file === './' || file === '.' ? [] : [file.replace(/^\.\//, '')]))
      .filter((file) => !file.includes('node_modules'))
      .slice(0, maxFiles);
    if (files.length > 0) return files;
    return this.listSourceFiles(maxFiles);
  }

  private async untrackedPseudoDiff(): Promise<string> {
    const status = await this.git(['ls-files', '--others', '--exclude-standard']).catch(() => '');
    let files = status
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((file) => !file.startsWith('..'))
      .map((file) => file.replace(/^\.\//, ''))
      .slice(0, 20);
    if (files.length === 0 && status.includes('./')) {
      files = await this.listSourceFiles(20);
    }
    const chunks: string[] = [];
    for (const file of files) {
      if (!/\.(ts|tsx|js|json|md)$/.test(file)) continue;
      const content = await this.readFile(file, 10000).catch(() => '');
      chunks.push(`diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n${content
        .split(/\r?\n/)
        .map((line) => `+${redactSecrets(line)}`)
        .join('\n')}`);
    }
    return chunks.join('\n');
  }

  private async listSourceFiles(limit = 100): Promise<string[]> {
    return fg(['**/*.{ts,tsx,js,json,md}', '!node_modules/**', '!dist/**', '!coverage/**'], {
      cwd: this.root,
      dot: false,
      absolute: false,
    }).then((files) => files.slice(0, limit));
  }

  private async git(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', this.root, ...args], { timeout: 10000, maxBuffer: 1024 * 1024 * 3 });
    return stdout;
  }
}

export function redactSecrets(value: string): string {
  return value
    .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^'",\s]+/gi, '$1=[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-[REDACTED]');
}
