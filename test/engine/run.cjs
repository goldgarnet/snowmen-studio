const fs = require('fs');
const path = require('path');
const ts = require('../../node_modules/typescript');

// The app deliberately compiles TypeScript only for the Vite bundle. This tiny
// loader lets the dependency-free engine test runner execute the same source files
// directly, without introducing Jest/Vitest or a second build configuration.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const casesDir = path.join(__dirname, 'cases');
const { runScenario } = require('./harness.ts');
const files = discoverScenarioFiles(casesDir);
let passed = 0;
let failed = 0;

for (const file of files) {
  const loaded = require(file);
  if (!Array.isArray(loaded.scenarios)) {
    console.error(`FAIL ${path.relative(process.cwd(), file)} must export a scenarios array`);
    failed += 1;
    continue;
  }

  for (const scenario of loaded.scenarios) {
    try {
      runScenario(scenario);
      console.log(`PASS ${scenario.name}`);
      passed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${scenario.name}\n  ${message}`);
      failed += 1;
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;

function discoverScenarioFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return discoverScenarioFiles(fullPath);
      return entry.name.endsWith('.scenario.ts') ? [fullPath] : [];
    })
    .sort();
}
