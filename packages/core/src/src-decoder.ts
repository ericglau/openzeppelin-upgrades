import path from 'path';
import { SolcOutput, SolcInput } from './solc-api';

export type SrcDecoder = (node: { src: string }) => string;

interface Source {
  name: string;
  content: string;
}

// Kept for backwards compatibility
export function solcInputOutputDecoder(solcInput: SolcInput, solcOutput: SolcOutput, basePath = '.'): SrcDecoder {
  const srcDecoder = new SolcInputOutputDecoder(solcInput, solcOutput, basePath);
  return ({ src }) => srcDecoder.decode({ src });
}

export class SolcInputOutputDecoder {
  private sources: Record<number, Source> = {};

  constructor(public solcInput: SolcInput, private solcOutput: SolcOutput, private basePath = '.') {}

  getSource(sourceId: number): Source {
    if (sourceId in this.sources) {
      return this.sources[sourceId];
    } else {
      const sourcePath = Object.entries(this.solcOutput.sources).find(([, { id }]) => sourceId === id)?.[0];
      if (sourcePath === undefined) {
        throw new Error(`Source file not available`);
      }
      const content = this.solcInput.sources[sourcePath]?.content;
      const name = path.relative(this.basePath, sourcePath);
      if (content === undefined) {
        throw new Error(`Content for ${name} not available`);
      }
      return (this.sources[sourceId] = { name, content });
    }
  }

  decode({ src }: { src: string }): string {
    const [begin, , sourceId] = src.split(':').map(Number);
    const { name, content } = this.getSource(sourceId);
    const line = content.substr(0, begin).split('\n').length;
    return name + ':' + line;
  }
}