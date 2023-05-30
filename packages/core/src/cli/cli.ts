
import { validateUpgradeSafety } from './validate-upgrade-safety';

export function main(args: string[]): void {
  if (args.length === 0) { 
    throw new Error('Expected arguments: <build-info-file-1> <build-info-file-2> ...');
  }

  const result = validateUpgradeSafety(args);
  process.exit(result.ok ? 0 : 1);
}

void main(process.argv.slice(2));