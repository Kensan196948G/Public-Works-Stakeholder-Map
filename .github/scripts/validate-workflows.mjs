#!/usr/bin/env node
/**
 * Structural validator for GitHub Actions workflow files.
 *
 * Motivation: a `run: |` block scalar ends as soon as a line is indented less
 * than the block's base indentation. An under-indented continuation line
 * therefore gets re-parsed as workflow structure, silently promoting body text
 * into top-level keys. The file stays syntactically valid YAML, so lint,
 * typecheck, test and build all pass — but GitHub rejects the whole run as a
 * "workflow file issue" with zero jobs, and the workflow never executes again.
 *
 * This validator fails CI on that class of corruption by asserting the parsed
 * top level against the documented workflow key set.
 *
 * Usage:
 *   node .github/scripts/validate-workflows.mjs            # all workflow files
 *   node .github/scripts/validate-workflows.mjs <file>...  # specific files
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

const WORKFLOW_DIR = '.github/workflows';

// https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
const ALLOWED_TOP_LEVEL_KEYS = [
  'name',
  'run-name',
  'on',
  'permissions',
  'env',
  'defaults',
  'concurrency',
  'jobs',
];
const REQUIRED_TOP_LEVEL_KEYS = ['on', 'jobs'];

function listWorkflowFiles() {
  return readdirSync(WORKFLOW_DIR)
    .filter((entry) => entry.endsWith('.yml') || entry.endsWith('.yaml'))
    .sort()
    .map((entry) => join(WORKFLOW_DIR, entry));
}

function isMapping(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJobs(jobs, errors) {
  if (!isMapping(jobs)) {
    errors.push('jobs がマッピングではありません。');
    return;
  }
  const jobIds = Object.keys(jobs);
  if (jobIds.length === 0) {
    errors.push('jobs が空です。ジョブが 1 つも定義されていません。');
    return;
  }
  for (const jobId of jobIds) {
    const job = jobs[jobId];
    if (!isMapping(job)) {
      errors.push(`jobs.${jobId} がマッピングではありません。`);
      continue;
    }
    // Reusable workflow calls (`uses`) have neither runs-on nor steps.
    if ('uses' in job) continue;
    if (!('runs-on' in job)) {
      errors.push(`jobs.${jobId} に runs-on も uses もありません。`);
    }
    if (!Array.isArray(job.steps)) {
      errors.push(`jobs.${jobId}.steps が配列ではありません。`);
    }
  }
}

function validate(file) {
  const errors = [];
  let doc;
  try {
    doc = YAML.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`YAML としてパースできません: ${error.message}`];
  }

  if (!isMapping(doc)) {
    return ['トップレベルがマッピングではありません。'];
  }

  for (const key of Object.keys(doc)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.includes(key)) {
      errors.push(
        `未知のトップレベルキー ${JSON.stringify(key)} を検出しました。` +
          ' run: | などのブロックスカラーがインデント不足で途中終端している可能性があります。' +
          ` 許可されるキー: ${ALLOWED_TOP_LEVEL_KEYS.join(', ')}`,
      );
    }
  }

  for (const key of REQUIRED_TOP_LEVEL_KEYS) {
    if (!(key in doc)) {
      errors.push(`必須のトップレベルキー "${key}" がありません。`);
    }
  }

  if ('jobs' in doc) validateJobs(doc.jobs, errors);

  return errors;
}

const targets = process.argv.slice(2);
const files = targets.length > 0 ? targets : listWorkflowFiles();

if (files.length === 0) {
  console.error(`✘ ${WORKFLOW_DIR} にワークフローファイルが見つかりません。`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const errors = validate(file);
  if (errors.length === 0) {
    console.log(`✔ ${file}`);
    continue;
  }
  failed += 1;
  console.error(`✘ ${file}`);
  for (const error of errors) console.error(`    - ${error}`);
}

if (failed > 0) {
  console.error(`\n${failed} 件のワークフローファイルが検証に失敗しました。`);
  process.exit(1);
}
console.log(`\n${files.length} 件のワークフローファイルを検証しました。`);
