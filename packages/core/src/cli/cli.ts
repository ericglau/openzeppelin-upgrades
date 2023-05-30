
import fs from 'fs';
import { BuildInfoFile, validateUpgradeSafety } from './validate-upgrade-safety';

export function main(args: string[]): void {
  const buildInfoFiles = validateAndGetBuildInfoFiles(args);

  const result = validateUpgradeSafety(buildInfoFiles);
  if (result.ok) {
    console.log(result.summary);
    process.exit(0);
  } else {
    console.error('\n==========================================================\n');
    console.error(result.summary);
    process.exit(1);
  }
}

function validateAndGetBuildInfoFiles(args: string[]) {
  if (args.length === 0) { 
    throw new Error('Expected arguments: <build-info-file-1> <build-info-file-2> ...');
  }

  const buildInfoFiles: BuildInfoFile[] = [];

  for (const arg of args) {
    if (arg.endsWith('.json')) {
      const buildInfoJson = readJSON(arg);
      if (buildInfoJson.input === undefined || buildInfoJson.output === undefined) {
        throw new Error(`Argument ${arg} must be a build-info file with Solidity input and output sections.`);
      } else {
        buildInfoFiles.push({
          input: buildInfoJson.input,
          output: buildInfoJson.output,
        });
      }
    } else {
      throw new Error(`Argument ${arg} must be a build-info file with a .json extension.`);
    }
  }
  return buildInfoFiles;
}

function readJSON(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

void main(process.argv.slice(2));