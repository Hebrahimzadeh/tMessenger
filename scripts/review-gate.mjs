#!/usr/bin/env node
// Review gate: blocks a task from starting unless the previous task's review
// file exists, is Status: APPROVED, and its Implementation-Commit SHA is a
// real commit in this repository's history.
//
// Usage: node scripts/review-gate.mjs --task <NN>
//        npm run review:gate -- --task <NN>

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Extract the `Status:` and `Implementation-Commit:` fields from a review
 * file's raw text. Returns nulls for any field that is missing.
 * @param {string} content
 */
export function parseReviewFile(content) {
  const statusMatch = content.match(/^Status:\s*(.+)$/m);
  const commitMatch = content.match(/^Implementation-Commit:\s*(.+)$/m);
  return {
    status: statusMatch ? statusMatch[1].trim() : null,
    implementationCommit: commitMatch ? commitMatch[1].trim() : null,
  };
}

/**
 * Pure decision logic for the gate, independent of disk/git access so it is
 * directly unit-testable.
 * @param {{ taskId: string, fileContent: string | null, commitExists: (sha: string) => boolean }} args
 */
export function evaluateGate({ taskId, fileContent, commitExists }) {
  if (fileContent === null) {
    return {
      ok: false,
      reason: `Review file for task ${taskId} was not found (docs/reviews/task-${taskId}.md).`,
    };
  }

  const { status, implementationCommit } = parseReviewFile(fileContent);

  if (status !== 'APPROVED') {
    return {
      ok: false,
      reason: `Task ${taskId} review status is "${status ?? 'MISSING'}", not APPROVED.`,
    };
  }

  if (!implementationCommit) {
    return {
      ok: false,
      reason: `Task ${taskId} review is APPROVED but has no Implementation-Commit SHA.`,
    };
  }

  if (!commitExists(implementationCommit)) {
    return {
      ok: false,
      reason: `Task ${taskId} Implementation-Commit "${implementationCommit}" was not found in git history.`,
    };
  }

  return { ok: true, implementationCommit };
}

/**
 * Real git-backed commit existence check (default dependency for runGate).
 * @param {string} sha
 */
export function defaultCommitExists(sha) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Orchestration: reads the review file for `taskId` from `reviewsDir` and
 * evaluates the gate. `commitExists` is injectable for tests.
 * @param {{ taskId: string, reviewsDir: string, commitExists?: (sha: string) => boolean }} args
 */
export function runGate({ taskId, reviewsDir, commitExists = defaultCommitExists }) {
  const reviewPath = path.join(reviewsDir, `task-${taskId}.md`);
  const fileContent = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : null;
  return evaluateGate({ taskId, fileContent, commitExists });
}

function parseArgs(argv) {
  const taskIndex = argv.indexOf('--task');
  if (taskIndex === -1 || !argv[taskIndex + 1]) {
    throw new Error('Usage: review-gate --task <NN>');
  }
  return { taskId: argv[taskIndex + 1] };
}

function main() {
  let taskId;
  try {
    ({ taskId } = parseArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const reviewsDir = path.join(process.cwd(), 'docs', 'reviews');
  const result = runGate({ taskId, reviewsDir });

  if (!result.ok) {
    console.error(`REVIEW GATE FAILED: ${result.reason}`);
    process.exitCode = 1;
    return;
  }

  console.log(`REVIEW GATE PASSED: task ${taskId} is APPROVED at commit ${result.implementationCommit}.`);
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  main();
}
