import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const testsRoot = path.resolve('.tmp-tests', 'tests');
const mode = process.argv[2] || 'all';

const modeFilters = {
  all: () => true,
  unit: (filePath) => filePath.includes(`${path.sep}unit${path.sep}`),
  integration: (filePath) => filePath.includes(`${path.sep}integration${path.sep}`)
};

function collectTestFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

if (!fs.existsSync(testsRoot)) {
  console.error(`Test output directory not found: ${testsRoot}`);
  process.exit(1);
}

const filter = modeFilters[mode];
if (!filter) {
  console.error(`Unknown test mode: ${mode}`);
  process.exit(1);
}

const testFiles = collectTestFiles(testsRoot).filter(filter).sort();

if (testFiles.length === 0) {
  console.error('No compiled test files were found.');
  process.exit(1);
}

let failed = false;

for (const testFile of testFiles) {
  const label = path.relative(process.cwd(), testFile);
  try {
    const testModule = await import(pathToFileURL(testFile).href);
    if (typeof testModule.run !== 'function') {
      throw new Error('Missing exported run() function.');
    }
    await testModule.run();
    console.log(`PASS ${label}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${label}`);
    console.error(error);
  }
}

process.exit(failed ? 1 : 0);
