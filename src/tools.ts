import { Octokit } from 'octokit';

/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 *
 * This separation makes tools easy to unit test without MCP infrastructure.
 */

export function createOctokit(token?: string): Octokit {
  const authToken = token || process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  return new Octokit({
    auth: authToken || undefined,
  });
}

// ============================================================================
// Hello & Echo Tools (Built-in Examples)
// ============================================================================

export interface HelloResult {
  [key: string]: unknown;
  message: string;
}

export function hello(name: string): HelloResult {
  return { message: `Hello, ${name}! Welcome to MCP.` };
}

export interface EchoResult {
  [key: string]: unknown;
  echo: string;
  timestamp: string;
}

export function echo(text: string): EchoResult {
  return {
    echo: text,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// GitHub Tools (Issue Pilot)
// ============================================================================

export interface ListIssuesParams {
  owner: string;
  repo: string;
  state?: 'open' | 'closed' | 'all';
  per_page?: number;
}

export interface IssueItem {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface ListIssuesResult {
  [key: string]: unknown;
  issues: string;
  count: number;
  items: IssueItem[];
}

export async function listIssues(
  params: ListIssuesParams,
  client: Octokit = createOctokit()
): Promise<ListIssuesResult> {
  const { owner, repo, state = 'open', per_page = 10 } = params;
  const { data } = await client.rest.issues.listForRepo({
    owner,
    repo,
    state,
    per_page,
  });

  // GitHub returns both regular issues and pull requests; filter PRs out
  const issuesOnly = data.filter((issue) => !issue.pull_request);
  const items: IssueItem[] = issuesOnly.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
  }));

  const textList =
    items.length > 0
      ? items.map((i) => `#${i.number}: ${i.title}`).join('\n')
      : 'No issues found.';

  return {
    issues: textList,
    count: items.length,
    items,
  };
}

export interface TriageIssueParams {
  owner: string;
  repo: string;
  issue_number: number;
}

export interface TriageIssueResult {
  [key: string]: unknown;
  message: string;
  label: string;
  issue_number: number;
}

export async function triageIssue(
  params: TriageIssueParams,
  client: Octokit = createOctokit()
): Promise<TriageIssueResult> {
  const { owner, repo, issue_number } = params;
  const { data: issue } = await client.rest.issues.get({
    owner,
    repo,
    issue_number,
  });

  const content = `${issue.title} ${issue.body || ''}`.toLowerCase();
  const label = content.includes('bug') ? 'bug' : 'enhancement';

  await client.rest.issues.addLabels({
    owner,
    repo,
    issue_number,
    labels: [label],
  });

  return {
    message: `Issue #${issue_number} labeled as: ${label}`,
    label,
    issue_number,
  };
}

export interface WeeklyDigestParams {
  owner: string;
  repo: string;
  days?: number;
}

export interface WeeklyDigestResult {
  [key: string]: unknown;
  count: number;
  summary: string;
  since: string;
}

export async function weeklyDigest(
  params: WeeklyDigestParams,
  client: Octokit = createOctokit()
): Promise<WeeklyDigestResult> {
  const { owner, repo, days = 7 } = params;
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: issues } = await client.rest.issues.listForRepo({
    owner,
    repo,
    state: 'all',
    since: sinceDate,
  });

  return {
    count: issues.length,
    summary: `Last ${days} days: ${issues.length} updates in ${owner}/${repo}.`,
    since: sinceDate,
  };
}

export interface ReleaseNotesParams {
  owner: string;
  repo: string;
  per_page?: number;
}

export interface MergedPrItem {
  number: number;
  title: string;
  author: string;
  merged_at: string;
}

export interface ReleaseNotesResult {
  [key: string]: unknown;
  notes: string;
  count: number;
  prs: MergedPrItem[];
}

export async function releaseNotes(
  params: ReleaseNotesParams,
  client: Octokit = createOctokit()
): Promise<ReleaseNotesResult> {
  const { owner, repo, per_page = 10 } = params;
  const { data: pulls } = await client.rest.pulls.list({
    owner,
    repo,
    state: 'closed',
    per_page,
  });

  const mergedPrs: MergedPrItem[] = pulls
    .filter((pr) => Boolean(pr.merged_at))
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || 'unknown',
      merged_at: pr.merged_at || '',
    }));

  const notesText =
    mergedPrs.length > 0
      ? mergedPrs.map((pr) => `- ${pr.title} (#${pr.number}) by @${pr.author}`).join('\n')
      : 'No recent merged PRs found.';

  return {
    notes: notesText,
    count: mergedPrs.length,
    prs: mergedPrs,
  };
}

export interface AddCommentParams {
  owner: string;
  repo: string;
  issue_number: number;
  body: string;
}

export interface AddCommentResult {
  [key: string]: unknown;
  status: string;
  message: string;
  issue_number: number;
}

export async function addComment(
  params: AddCommentParams,
  client: Octokit = createOctokit()
): Promise<AddCommentResult> {
  const { owner, repo, issue_number, body } = params;
  await client.rest.issues.createComment({
    owner,
    repo,
    issue_number,
    body,
  });

  return {
    status: 'success',
    message: `Comment added to #${issue_number}`,
    issue_number,
  };
}
