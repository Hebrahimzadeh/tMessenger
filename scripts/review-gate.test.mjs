import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluateGate, parseReviewFile, runGate } from './review-gate.mjs';

test('parseReviewFile extracts Status and Implementation-Commit', () => {
  const content = ['# Task 01 Review', 'Status: APPROVED', 'Implementation-Commit: abc1234', 'Scope: foo'].join('\n');

  const parsed = parseReviewFile(content);
  assert.equal(parsed.status, 'APPROVED');
  assert.equal(parsed.implementationCommit, 'abc1234');
});

test('parseReviewFile returns nulls when fields are absent', () => {
  const parsed = parseReviewFile('# Task 01 Review\nnothing useful here\n');
  assert.equal(parsed.status, null);
  assert.equal(parsed.implementationCommit, null);
});

test('evaluateGate: missing review file fails the gate', () => {
  const result = evaluateGate({ taskId: '01', fileContent: null, commitExists: () => true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /was not found/);
});

test('evaluateGate: REJECTED status fails the gate', () => {
  const content = 'Status: REJECTED\nImplementation-Commit: abc1234\n';
  const result = evaluateGate({ taskId: '01', fileContent: content, commitExists: () => true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /REJECTED/);
});

test('evaluateGate: APPROVED status with an unknown commit SHA fails the gate', () => {
  const content = 'Status: APPROVED\nImplementation-Commit: deadbeef\n';
  const result = evaluateGate({ taskId: '01', fileContent: content, commitExists: () => false });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not found in git history/);
});

test('evaluateGate: APPROVED status with a missing commit field fails the gate', () => {
  const result = evaluateGate({ taskId: '01', fileContent: 'Status: APPROVED\n', commitExists: () => true });
  assert.equal(result.ok, false);
  assert.match(result.reason, /no Implementation-Commit/);
});

test('evaluateGate: APPROVED status with a real commit SHA passes the gate', () => {
  const content = 'Status: APPROVED\nImplementation-Commit: abc1234\n';
  const result = evaluateGate({ taskId: '01', fileContent: content, commitExists: () => true });
  assert.equal(result.ok, true);
  assert.equal(result.implementationCommit, 'abc1234');
});

test('runGate: reads missing, rejected, and approved states from disk', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-gate-test-'));
  try {
    const missing = runGate({ taskId: '99', reviewsDir: dir, commitExists: () => true });
    assert.equal(missing.ok, false);
    assert.match(missing.reason, /was not found/);

    writeFileSync(path.join(dir, 'task-99.md'), '# Task 99 Review\nStatus: REJECTED\nImplementation-Commit: cafebabe\n');
    const rejected = runGate({ taskId: '99', reviewsDir: dir, commitExists: () => true });
    assert.equal(rejected.ok, false);
    assert.match(rejected.reason, /REJECTED/);

    writeFileSync(path.join(dir, 'task-99.md'), '# Task 99 Review\nStatus: APPROVED\nImplementation-Commit: cafebabe\n');
    const approved = runGate({ taskId: '99', reviewsDir: dir, commitExists: () => true });
    assert.equal(approved.ok, true);
    assert.equal(approved.implementationCommit, 'cafebabe');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runGate: rejects an APPROVED review whose commit is not in history', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'review-gate-test-'));
  try {
    writeFileSync(path.join(dir, 'task-42.md'), 'Status: APPROVED\nImplementation-Commit: 0000000000000000000000000000000000000000\n');
    const result = runGate({ taskId: '42', reviewsDir: dir });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not found in git history/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
