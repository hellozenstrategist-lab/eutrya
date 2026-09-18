import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { integer, insist, object, finite } from './util.mjs';

export const CONFIG_PATH = path.join(os.homedir(), '.config', 'eutrya', 'config.json');
export const DEFAULTS = Object.freeze({
  mainProvider: 'vercel', mainBaseUrl: '', mainKeyEnv: '', jsonMode: true,
  dataRoot: path.join(os.homedir(), '.local', 'share', 'eutrya'), jevZeroDataRetention: false,
  mainModel: '', jevModel: 'typesafe-ai/jev',
  maxSteps: 24, maxCalls: 150, maxPromptChars: 48000,
  maxOutputTokens: 6144, timeoutMs: 90000, retries: 1,
  autoWrite: false, allowExec: false, jevCompaction: true, maxKnownCostUsd: null,
  sessionRoot: path.join(os.homedir(), '.local', 'state', 'eutrya')
});
export function validateConfig(c) {
  object(c,'config');
  insist(['vercel','openrouter','compatible','ollama','chatgpt'].includes(c.mainProvider),'Unsupported mainProvider');
  insist(typeof c.mainBaseUrl==='string' && typeof c.mainKeyEnv==='string','Invalid provider settings');
  insist(c.mainKeyEnv==='' || /^[A-Z][A-Z0-9_]*$/.test(c.mainKeyEnv),'mainKeyEnv must be an environment variable name');
  insist(typeof c.jsonMode==='boolean' && typeof c.jevZeroDataRetention==='boolean','Provider flags must be booleans');
  insist(typeof c.dataRoot==='string' && path.isAbsolute(c.dataRoot),'dataRoot must be absolute');
  insist(Object.keys(c).every(k => Object.hasOwn(DEFAULTS,k)), 'Unsupported configuration key');
  insist(typeof c.mainModel === 'string' && typeof c.jevModel === 'string', 'Model IDs must be strings');
  insist(c.mainModel !== c.jevModel && !c.mainModel.startsWith('typesafe-ai/'), 'Jev belongs in the evaluator slot, not the text model slot');
  insist(c.jevModel.startsWith('typesafe-ai/'), 'Configure a TypeSafe Jev evaluation model');
  for (const [k,lo,hi] of [['maxSteps',1,500],['maxCalls',1,10000],['maxPromptChars',4000,200000],['maxOutputTokens',256,64000],['timeoutMs',100,600000],['retries',0,3]]) integer(c[k],k,lo,hi);
  insist(typeof c.autoWrite === 'boolean' && typeof c.allowExec === 'boolean' && typeof c.jevCompaction === 'boolean','Permission/compaction flags must be booleans');
  insist(typeof c.sessionRoot === 'string' && path.isAbsolute(c.sessionRoot),'sessionRoot must be an absolute path');
  if (c.maxKnownCostUsd !== null) finite(c.maxKnownCostUsd,'maxKnownCostUsd',0.000001,100000);
  return c;
}
export function loadConfig(file = CONFIG_PATH, overrides = {}) {
  let raw = {};
  if (fs.existsSync(file)) raw = JSON.parse(fs.readFileSync(file,'utf8'));
  return validateConfig({...DEFAULTS,...raw,...overrides});
}
export function writeConfig(file = CONFIG_PATH, model = '') {
  if (fs.existsSync(file)) throw new Error(`Config already exists: ${file}; edit it explicitly rather than overwriting`);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.writeFileSync(file, JSON.stringify({...DEFAULTS,mainModel:model},null,2)+'\n',{mode:0o600,flag:'wx'});
  return file;
}
