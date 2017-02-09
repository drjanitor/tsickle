import {SourceMapConsumer, SourceMapGenerator} from 'source-map';

const INLINE_SOURCE_MAP_REGEX =
    new RegExp('^//# sourceMappingURL=data:application/json;base64,(.*)$', 'mg');

export function containsInlineSourceMap(source: string): boolean {
  return getInlineSourceMapCount(source) > 0;
}

export function getInlineSourceMapCount(source: string): number {
  const match = source.match(INLINE_SOURCE_MAP_REGEX);
  if (match) {
    return match.length;
  } else {
    return 0;
  }
}

export function extractInlineSourceMap(source: string): string {
  const result = INLINE_SOURCE_MAP_REGEX.exec(source)!;
  const base64EncodedMap = result[1];
  return Buffer.from(base64EncodedMap, 'base64').toString('utf8');
}

export function removeInlineSourceMap(source: string): string {
  if (containsInlineSourceMap(source)) {
    return source.replace(INLINE_SOURCE_MAP_REGEX, '');
  }
  return source;
}

export function setInlineSourceMap(source: string, sourceMap: string): string {
  const encodedSourceMap = Buffer.from(sourceMap, 'utf8').toString('base64');
  if (containsInlineSourceMap(source)) {
    return source.replace(
        INLINE_SOURCE_MAP_REGEX,
        `//# sourceMappingURL=data:application/json;base64,${encodedSourceMap}`);
  } else {
    return `${source}\n//# sourceMappingURL=data:application/json;base64,${encodedSourceMap}`;
  }
}

export function sourceMapConsumerToGenerator(sourceMapConsumer: SourceMapConsumer):
    SourceMapGenerator {
  return SourceMapGenerator.fromSourceMap(sourceMapConsumer);
}

/**
 * Tsc identifies source files by their relative path to the output file.  Since
 * there's no easy way to identify these relative paths when tsickle generates its
 * own source maps, we patch them with the file name from the tsc source maps
 * before composing them.
 */
export function sourceMapGeneratorToConsumerWithFileName(
    sourceMapGenerator: SourceMapGenerator, fileName: string): SourceMapConsumer {
  const rawSourceMap = sourceMapGenerator.toJSON();
  rawSourceMap.sources = [fileName];
  rawSourceMap.file = fileName;
  return new SourceMapConsumer(rawSourceMap);
}

export function sourceMapTextToConsumer(sourceMapText: string): SourceMapConsumer {
  const sourceMapJson: any = sourceMapText;
  return new SourceMapConsumer(sourceMapJson);
}

export function sourceMapTextToGenerator(sourceMapText: string): SourceMapGenerator {
  const sourceMapJson: any = sourceMapText;
  return SourceMapGenerator.fromSourceMap(this.sourceMapTextToConsumer(sourceMapJson));
}
