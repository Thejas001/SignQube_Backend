const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// Replaces a project module in the require cache so the code under test gets
// the fake. Must be called before the module under test is first required.
// Each test file runs in its own process, so mocks never leak between files.
function mockModule(relativePath, exports) {
  const filename = require.resolve(path.join(ROOT, relativePath));
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
  return exports;
}

module.exports = {
  mockModule,
};
