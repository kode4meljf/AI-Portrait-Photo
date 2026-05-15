/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: ["utils/**/*.js", "config/**/*.js"],
  coveragePathIgnorePatterns: ["/node_modules/"],
  clearMocks: true,
};
