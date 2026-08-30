/**
 * GraphifyCodeGraphProvider
 *
 * Uses the Graphify CLI (graphifyy 0.9.52+) to answer code-intelligence
 * queries without reimplementing graph traversal.
 *
 * Strategy (progressive — stops when enough context is found):
 *   1. Verify CLI is available
 *   2. Locate (or generate) graph.json for the repository
 *   3. graphify query  → discover relevant symbols + files
 *   4. graphify affected → find potentially impacted nodes (reverse traversal)
 *   5. graphify path   → call path between first two found symbols (if ≥ 2)
 *
 * Security:
 *   - All CLI args are passed as separate array elements (execFile), never
 *     concatenated into a shell string — safe against command injection.
 *   - The normalized_message is NEVER passed directly as a CLI argument;
 *     a sanitised query string is derived from it first.
 *   - No scripts or code from the analysed repository are executed.
 *
 * Output formats observed from Graphify 0.9.52:
 *   query   — plain text: "NODE <label> [src=<file> loc=<L>]"
 *   path    — plain text: "<A> --<rel>--> <B> --<rel>--> …"
 *   explain — plain text: "Node: <label>\n  ID: …\n  Source: <file> L<n>"
 *   affected — supports --json; JSON: { nodes: [{ label, id, source }] }
 *              falls back to "No unique node match" plain text on ambiguity
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  CodeContext,
  CodeGraphProvider,
  CodeIntelligenceInput,
  CodeRelation,
} from '../types.js';

const execFileAsync = promisify(execFile);

/** Timeout for any single Graphify CLI call (ms). */
const CLI_TIMEOUT_MS = 30_000;

/** Default token budget for graphify query. */
const QUERY_BUDGET = 800;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Derives a safe query string from the normalized message.
 * Strips characters that could interfere with shell arg parsing even though
 * we use execFile (extra safety layer).
 * Caps at 200 chars to stay within CLI limits.
 */
function safeQuery(normalized_message: string, intent: string): string {
  const combined = `${intent} ${normalized_message}`;
  return combined
    .replace(/[`$\\|;&<>]/g, ' ')  // strip shell metacharacters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Runs a Graphify CLI command safely.
 * Returns { stdout, stderr } on success, throws on non-zero exit or timeout.
 */
async function runGraphify(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('graphify', args, {
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,  // 1 MB — sufficient for budget-capped responses
  });
}

// ── parsers ──────────────────────────────────────────────────────────────────

interface QueryNode {
  label: string;
  file:  string;
}

/**
 * Parses `graphify query` plain-text output.
 * Line format: "NODE <label> [src=<file> loc=<L>] ..."
 */
function parseQueryOutput(stdout: string): QueryNode[] {
  const nodes: QueryNode[] = [];
  for (const line of stdout.split('\n')) {
    const nodeMatch = line.match(/^NODE\s+(.+?)\s+\[src=(.+?)\s/);
    if (nodeMatch) {
      nodes.push({ label: nodeMatch[1]!.trim(), file: nodeMatch[2]!.trim() });
    }
  }
  return nodes;
}

/**
 * Parses `graphify path` plain-text output.
 * Format: "  <A> --<rel>--> <B> --<rel>--> <C>"
 * Returns the path as a readable string, or null if not found.
 */
function parsePathOutput(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    // The actual path line contains "--" arrows
    if (line.includes('-->')) {
      // Collapse edge labels: "A --rel [TAG]--> B" → "A -> B"
      const cleaned = line
        .replace(/--[^-]+-+\[.*?\]-->/g, '->')
        .replace(/-->/g, '->')
        .trim();
      if (cleaned) return cleaned;
    }
  }
  return null;
}

/**
 * Parses `graphify affected --json` output.
 * Returns an array of impacted node labels.
 * Falls back to empty array on parse failure.
 */
function parseAffectedJson(stdout: string): string[] {
  try {
    // affected --json may emit warnings before the JSON object
    const jsonStart = stdout.indexOf('{');
    if (jsonStart === -1) return [];
    const parsed = JSON.parse(stdout.slice(jsonStart)) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'nodes' in parsed &&
      Array.isArray((parsed as { nodes: unknown }).nodes)
    ) {
      return (parsed as { nodes: Array<{ label?: string }> }).nodes
        .map(n => n.label ?? '')
        .filter(Boolean);
    }
  } catch {
    // ignore parse errors — return empty
  }
  return [];
}

/**
 * Extracts unique file paths from query nodes.
 */
function uniqueFiles(nodes: QueryNode[]): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  for (const n of nodes) {
    if (n.file && !seen.has(n.file)) {
      seen.add(n.file);
      files.push(n.file);
    }
  }
  return files;
}

// ── error context builder ─────────────────────────────────────────────────────

function errorContext(
  requestId: string,
  status: CodeContext['status'],
  summary: string,
  repository: string | null = null,
): CodeContext {
  return {
    requestId,
    status,
    repository,
    ref:                 null,
    relevantSymbols:     [],
    relevantFiles:       [],
    relations:           [],
    callPaths:           [],
    potentiallyImpacted: [],
    summary,
    evidence:            [],
    provider:            'graphify',
  };
}

// ── provider ─────────────────────────────────────────────────────────────────

export class GraphifyCodeGraphProvider implements CodeGraphProvider {
  readonly name = 'graphify';

  async getContext(input: CodeIntelligenceInput): Promise<CodeContext> {
    const { input: triageInput, triageResult, repositoryPath } = input;
    const requestId = triageInput.request_id;

    // ── 1. Verify CLI availability ────────────────────────────────────────────
    try {
      await runGraphify(['--version']);
    } catch {
      return errorContext(requestId, 'error',
        'Graphify CLI not available. Install with: uv tool install graphifyy');
    }

    // ── 2. Resolve repository path ────────────────────────────────────────────
    if (!repositoryPath) {
      return errorContext(requestId, 'inaccessible',
        'No repository path provided. Cannot perform code analysis.');
    }

    const absRepoPath = resolve(repositoryPath);
    if (!existsSync(absRepoPath)) {
      return errorContext(requestId, 'inaccessible',
        `Repository path does not exist: ${repositoryPath}`, repositoryPath);
    }

    // ── 3. Locate or generate graph.json ──────────────────────────────────────
    const graphPath = join(absRepoPath, 'graphify-out', 'graph.json');

    if (!existsSync(graphPath)) {
      try {
        await execFileAsync('graphify', ['extract', absRepoPath, '--code-only', '--no-cluster'], {
          timeout: 120_000,  // extraction can take longer
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorContext(requestId, 'error',
          `Graphify extraction failed: ${msg}`, repositoryPath);
      }
    }

    if (!existsSync(graphPath)) {
      return errorContext(requestId, 'error',
        'graph.json not found after extraction attempt.', repositoryPath);
    }

    // ── 4. Build query string ──────────────────────────────────────────────────
    const query = safeQuery(triageInput.normalized_message, triageInput.intent);

    // ── 5. graphify query — discover relevant symbols ─────────────────────────
    let queryNodes: QueryNode[] = [];
    try {
      const { stdout } = await runGraphify([
        'query', query,
        '--budget', String(QUERY_BUDGET),
        '--graph',  graphPath,
      ]);
      queryNodes = parseQueryOutput(stdout);
    } catch {
      // query failure is non-fatal — proceed with empty result
    }

    if (queryNodes.length === 0) {
      return {
        requestId,
        status:              'no_match',
        repository:          repositoryPath,
        ref:                 null,
        relevantSymbols:     [],
        relevantFiles:       [],
        relations:           [],
        callPaths:           [],
        potentiallyImpacted: [],
        summary:             'No matching code components found for the given request.',
        evidence:            [`query: "${query}"`],
        provider:            'graphify',
      };
    }

    // Apply budget limits early
    const symbols = [...new Set(queryNodes.map(n => n.label))].slice(0, 10);
    const files   = uniqueFiles(queryNodes).slice(0, 5);

    // ── 6. graphify affected — reverse traversal (best-effort) ───────────────
    let potentiallyImpacted: string[] = [];
    if (symbols[0]) {
      try {
        const { stdout } = await runGraphify([
          'affected', symbols[0]!,
          '--depth',  '2',
          '--graph',  graphPath,
          '--json',
        ]);
        potentiallyImpacted = parseAffectedJson(stdout).slice(0, 10);
      } catch {
        // non-fatal
      }
    }

    // ── 7. graphify path — call path between first two symbols (if ≥ 2) ───────
    const callPaths: string[] = [];
    const relations: CodeRelation[] = [];

    if (symbols.length >= 2) {
      try {
        const { stdout } = await runGraphify([
          'path', symbols[0]!, symbols[1]!,
          '--graph', graphPath,
        ]);
        const pathStr = parsePathOutput(stdout);
        if (pathStr) {
          callPaths.push(pathStr);
          // Derive a relation from the first two symbols
          relations.push({ from: symbols[0]!, to: symbols[1]!, kind: 'path' });
        }
      } catch {
        // non-fatal
      }
    }

    // ── 8. Compose domain hint into summary ───────────────────────────────────
    const domainHint = triageResult.domain !== 'UNKNOWN'
      ? ` Domain: ${triageResult.domain}.`
      : '';

    const summary =
      `Found ${symbols.length} relevant symbol(s) in ${files.length} file(s).` +
      domainHint +
      (triageResult.module ? ` Module hint: ${triageResult.module}.` : '');

    const evidence = [
      `query: "${query}"`,
      `graph: ${graphPath}`,
      ...symbols.slice(0, 3).map(s => `symbol: ${s}`),
    ];

    return {
      requestId,
      status:              'accessible',
      repository:          repositoryPath,
      ref:                 null,
      relevantSymbols:     symbols,
      relevantFiles:       files,
      relations,
      callPaths:           callPaths.slice(0, 3),
      potentiallyImpacted,
      summary,
      evidence,
      provider:            'graphify',
    };
  }
}
