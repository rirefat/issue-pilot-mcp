import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Octokit } from 'octokit';
import {
  hello,
  echo,
  listIssues,
  triageIssue,
  weeklyDigest,
  releaseNotes,
  addComment,
  createOctokit,
  getOctokit,
  resetOctokitCache,
} from '../src/tools.js';

describe('hello', () => {
  it('returns greeting with name', () => {
    const result = hello('World');
    expect(result.message).toBe('Hello, World! Welcome to MCP.');
  });

  it('handles empty name', () => {
    const result = hello('');
    expect(result.message).toBe('Hello, ! Welcome to MCP.');
  });
});

describe('echo', () => {
  it('echoes back input text', () => {
    const result = echo('test input');
    expect(result.echo).toBe('test input');
  });

  it('includes timestamp', () => {
    const result = echo('test');
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });
});

describe('listIssues', () => {
  it('fetches issues, filters out pull requests, and formats output', async () => {
    const mockClient = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 1, title: 'Bug in authentication', state: 'open', html_url: 'https://github.com/o/r/issues/1' },
              { number: 2, title: 'Update documentation', state: 'open', html_url: 'https://github.com/o/r/pull/2', pull_request: {} },
              { number: 3, title: 'Crash on startup', state: 'open', html_url: 'https://github.com/o/r/issues/3' },
            ],
          }),
        },
      },
    } as unknown as Octokit;

    const result = await listIssues({ owner: 'owner', repo: 'repo' }, mockClient);
    expect(result.count).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].number).toBe(1);
    expect(result.items[1].number).toBe(3);
    expect(result.issues).toBe('#1: Bug in authentication\n#3: Crash on startup');
  });

  it('returns friendly message when no issues found', async () => {
    const mockClient = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({ data: [] }),
        },
      },
    } as unknown as Octokit;

    const result = await listIssues({ owner: 'owner', repo: 'repo' }, mockClient);
    expect(result.count).toBe(0);
    expect(result.issues).toBe('No issues found.');
  });
});

describe('triageIssue', () => {
  it('labels issue as bug when keyword "bug" is present', async () => {
    const addLabelsMock = vi.fn().mockResolvedValue({});
    const mockClient = {
      rest: {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: { title: 'Serious bug in login', body: 'Please fix this issue.' },
          }),
          addLabels: addLabelsMock,
        },
      },
    } as unknown as Octokit;

    const result = await triageIssue({ owner: 'owner', repo: 'repo', issue_number: 10 }, mockClient);
    expect(result.label).toBe('bug');
    expect(result.message).toBe('Issue #10 labeled as: bug');
    expect(addLabelsMock).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 10,
      labels: ['bug'],
    });
  });

  it('labels issue as enhancement when "bug" is absent', async () => {
    const addLabelsMock = vi.fn().mockResolvedValue({});
    const mockClient = {
      rest: {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: { title: 'Add dark mode support', body: 'Would love dark theme.' },
          }),
          addLabels: addLabelsMock,
        },
      },
    } as unknown as Octokit;

    const result = await triageIssue({ owner: 'owner', repo: 'repo', issue_number: 11 }, mockClient);
    expect(result.label).toBe('enhancement');
    expect(result.message).toBe('Issue #11 labeled as: enhancement');
    expect(addLabelsMock).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 11,
      labels: ['enhancement'],
    });
  });

  it('skips addLabels call if the label is already present on the issue', async () => {
    const addLabelsMock = vi.fn().mockResolvedValue({});
    const mockClient = {
      rest: {
        issues: {
          get: vi.fn().mockResolvedValue({
            data: {
              title: 'Critical bug',
              body: 'fix now',
              labels: [{ name: 'bug' }],
            },
          }),
          addLabels: addLabelsMock,
        },
      },
    } as unknown as Octokit;

    const result = await triageIssue({ owner: 'owner', repo: 'repo', issue_number: 12 }, mockClient);
    expect(result.label).toBe('bug');
    expect(addLabelsMock).not.toHaveBeenCalled();
  });
});

describe('weeklyDigest', () => {
  it('queries issues since target date and summarizes activity', async () => {
    const mockClient = {
      rest: {
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              { number: 1, title: 'Item 1' },
              { number: 2, title: 'Item 2' },
            ],
          }),
        },
      },
    } as unknown as Octokit;

    const result = await weeklyDigest({ owner: 'owner', repo: 'repo', days: 7 }, mockClient);
    expect(result.count).toBe(2);
    expect(result.summary).toBe('Last 7 days: 2 updates in owner/repo.');
    expect(result.since).toBeDefined();
  });
});

describe('releaseNotes', () => {
  it('formats release notes from merged pull requests', async () => {
    const mockClient = {
      rest: {
        pulls: {
          list: vi.fn().mockResolvedValue({
            data: [
              {
                number: 101,
                title: 'Add webhook support',
                merged_at: '2026-10-20T12:00:00Z',
                user: { login: 'octocat' },
              },
              {
                number: 102,
                title: 'Unmerged PR draft',
                merged_at: null,
                user: { login: 'someone' },
              },
              {
                number: 103,
                title: 'Fix race condition',
                merged_at: '2026-10-21T15:00:00Z',
                user: { login: 'contributor' },
              },
            ],
          }),
        },
      },
    } as unknown as Octokit;

    const result = await releaseNotes({ owner: 'owner', repo: 'repo' }, mockClient);
    expect(result.count).toBe(2);
    expect(result.notes).toBe(
      '- Add webhook support (#101) by @octocat\n- Fix race condition (#103) by @contributor'
    );
  });

  it('handles case with no merged pull requests', async () => {
    const mockClient = {
      rest: {
        pulls: {
          list: vi.fn().mockResolvedValue({
            data: [{ number: 5, title: 'Draft PR', merged_at: null, user: { login: 'dev' } }],
          }),
        },
      },
    } as unknown as Octokit;

    const result = await releaseNotes({ owner: 'owner', repo: 'repo' }, mockClient);
    expect(result.count).toBe(0);
    expect(result.notes).toBe('No recent merged PRs found.');
  });
});

describe('addComment', () => {
  it('posts a comment to the specified issue with trimmed body', async () => {
    const createCommentMock = vi.fn().mockResolvedValue({});
    const mockClient = {
      rest: {
        issues: {
          createComment: createCommentMock,
        },
      },
    } as unknown as Octokit;

    const result = await addComment(
      { owner: 'owner', repo: 'repo', issue_number: 42, body: '  Thanks for the report!  ' },
      mockClient
    );
    expect(result.status).toBe('success');
    expect(result.message).toBe('Comment added to #42');
    expect(createCommentMock).toHaveBeenCalledWith({
      owner: 'owner',
      repo: 'repo',
      issue_number: 42,
      body: 'Thanks for the report!',
    });
  });
});

describe('createOctokit and getOctokit caching', () => {
  beforeEach(() => {
    resetOctokitCache();
  });

  it('instantiates Octokit instance without throwing', () => {
    const client = createOctokit('test_token');
    expect(client).toBeDefined();
    expect(typeof client.rest.issues.listForRepo).toBe('function');
  });

  it('reuses cached Octokit instance when token is unchanged', () => {
    process.env.GITHUB_TOKEN = 'test_token_cached';
    const client1 = getOctokit();
    const client2 = getOctokit();
    expect(client1).toBe(client2);
    delete process.env.GITHUB_TOKEN;
  });

  it('creates a new instance when token changes', () => {
    process.env.GITHUB_TOKEN = 'token_a';
    const client1 = getOctokit();
    resetOctokitCache();
    process.env.GITHUB_TOKEN = 'token_b';
    const client2 = getOctokit();
    expect(client1).not.toBe(client2);
    delete process.env.GITHUB_TOKEN;
  });
});
