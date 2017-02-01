#!/usr/bin/env node

/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as fs from 'fs';
import * as minimist from 'minimist';
import * as mkdirp from 'mkdirp';
import * as path from 'path';
import * as ts from 'typescript';

import * as cliSupport from './cli_support';
import * as tsickle from './tsickle';
import {toArray, createOutputRetainingCompilerHost, createSourceReplacingCompilerHost} from './util';
/** Tsickle settings passed on the command line. */
export interface Settings {
  /** If provided, path to save externs to. */
  externsPath?: string;

  /** If provided, convert every type to the Closure {?} type */
  isUntyped: boolean;

  /** If true, log internal debug warnings to the console. */
  verbose?: boolean;
}

function usage() {
  console.error(`usage: tsickle [tsickle options] -- [tsc options]

example:
  tsickle --externs=foo/externs.js -- -p src --noImplicitAny

tsickle flags are:
  --externs=PATH     save generated Closure externs.js to PATH
  --untyped          convert every type in TypeScript to the Closure {?} type
`);
}

/**
 * Parses the command-line arguments, extracting the tsickle settings and
 * the arguments to pass on to tsc.
 */
function loadSettingsFromArgs(args: string[]): {settings: Settings, tscArgs: string[]} {
  let settings: Settings = {isUntyped: false};
  let parsedArgs = minimist(args);
  for (let flag of Object.keys(parsedArgs)) {
    switch (flag) {
      case 'h':
      case 'help':
        usage();
        process.exit(0);
        break;
      case 'externs':
        settings.externsPath = parsedArgs[flag];
        break;
      case 'untyped':
        settings.isUntyped = true;
        break;
      case 'verbose':
        settings.verbose = true;
        break;
      case '_':
        // This is part of the minimist API, and holds args after the '--'.
        break;
      default:
        console.error(`unknown flag '--${flag}'`);
        usage();
        process.exit(1);
    }
  }
  // Arguments after the '--' arg are arguments to tsc.
  let tscArgs = parsedArgs['_'];
  return {settings, tscArgs};
}

/**
 * Loads the tsconfig.json from a directory.
 * Unfortunately there's a ton of logic in tsc.ts related to searching
 * for tsconfig.json etc. that we don't really want to replicate, e.g.
 * tsc appears to allow -p path/to/tsconfig.json while this only works
 * with -p path/to/containing/dir.
 *
 * @param args tsc command-line arguments.
 */
function loadTscConfig(args: string[], allDiagnostics: ts.Diagnostic[]):
    {options: ts.CompilerOptions, fileNames: string[]}|null {
  // Gather tsc options/input files from command line.
  // Bypass visibilty of parseCommandLine, see
  // https://github.com/Microsoft/TypeScript/issues/2620
  let {options, fileNames, errors} = (ts as any).parseCommandLine(args);
  if (errors.length > 0) {
    allDiagnostics.push(...errors);
    return null;
  }

  // Store file arguments
  let tsFileArguments = fileNames;

  // Read further settings from tsconfig.json.
  let projectDir = options.project || '.';
  let configFileName = path.join(projectDir, 'tsconfig.json');
  let {config: json, error} =
      ts.readConfigFile(configFileName, path => fs.readFileSync(path, 'utf-8'));
  if (error) {
    allDiagnostics.push(error);
    return null;
  }
  ({options, fileNames, errors} =
       ts.parseJsonConfigFileContent(json, ts.sys, projectDir, options, configFileName));
  if (errors.length > 0) {
    allDiagnostics.push(...errors);
    return null;
  }

  // if file arguments were given to the typescript transpiler than transpile only those files
  fileNames = tsFileArguments.length > 0 ? tsFileArguments : fileNames;

  return {options, fileNames};
}

/**
 * Compiles TypeScript code into Closure-compiler-ready JS.
 * Doesn't write any files to disk; all JS content is returned in a map.
 */
export function toClosureJS(
    options: ts.CompilerOptions, fileNames: string[], settings: Settings,
    allDiagnostics: ts.Diagnostic[],
    files?: Map<string, string>): {jsFiles: Map<string, string>, externs: string}|null {
  // Parse and load the program without tsickle processing.
  // This is so:
  // - error messages point at the original source text
  // - tsickle can use the result of typechecking for annotation
  let program = files === undefined ?
      ts.createProgram(fileNames, options) :
      ts.createProgram(
          fileNames, options,
          createSourceReplacingCompilerHost(files, ts.createCompilerHost(options)));
  {  // Scope for the "diagnostics" variable so we can use the name again later.
    let diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) {
      allDiagnostics.push(...diagnostics);
      return null;
    }
  }

  const tsickleCompilerHostOptions: tsickle.TsickleCompilerHostOptions = {
    googmodule: true,
    es5Mode: false,
    tsickleTyped: !settings.isUntyped,
    typeBlackListPaths: new Set(),
    prelude: '',
  };

  const tsickleHost: tsickle.TsickleHost = {
    shouldSkipTsickleProcessing: (fileName) => fileNames.indexOf(fileName) === -1,
    pathToModuleName: cliSupport.pathToModuleName,
    shouldIgnoreWarningsForPath: (filePath) => false,
    fileNameToModuleId: (fileName) => fileName,
  };

  const jsFiles = new Map<string, string>();
  const hostDelegate = createOutputRetainingCompilerHost(jsFiles, ts.createCompilerHost(options));

  // Reparse and reload the program, inserting the tsickle output in
  // place of the original source.
  let host = new tsickle.TsickleCompilerHost(
      hostDelegate, tsickleCompilerHostOptions, tsickleHost,
      {oldProgram: program, pass: tsickle.Pass.CLOSURIZE});
  program = ts.createProgram(fileNames, options, host);

  let {diagnostics} = program.emit(undefined);
  if (diagnostics.length > 0) {
    allDiagnostics.push(...diagnostics);
    return null;
  }

  return {jsFiles, externs: host.getGeneratedExterns()};
}

function main(args: string[]): number {
  let {settings, tscArgs} = loadSettingsFromArgs(args);
  let diagnostics: ts.Diagnostic[] = [];
  let config = loadTscConfig(tscArgs, diagnostics);
  if (config === null) {
    console.error(tsickle.formatDiagnostics(diagnostics));
    return 1;
  }

  // Run tsickle+TSC to convert inputs to Closure JS files.
  let closure = toClosureJS(config.options, config.fileNames, settings, diagnostics);
  if (closure === null) {
    console.error(tsickle.formatDiagnostics(diagnostics));
    return 1;
  }

  for (let fileName of toArray(closure.jsFiles.keys())) {
    mkdirp.sync(path.dirname(fileName));
    fs.writeFileSync(fileName, closure.jsFiles.get(fileName));
  }

  if (settings.externsPath) {
    mkdirp.sync(path.dirname(settings.externsPath));
    fs.writeFileSync(settings.externsPath, closure.externs);
  }
  return 0;
}

// CLI entry point
if (require.main === module) {
  process.exit(main(process.argv.splice(2)));
}
