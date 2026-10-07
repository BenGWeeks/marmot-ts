# Contributing to @internet-privacy/marmot-ts

Thank you for your interest in contributing to marmot-ts! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js LTS (>= 20.x)
- TypeScript ~5.8.0 (installed via devDependencies)
- npm or yarn
- Git

### Setting Up Your Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/marmot-ts.git
   cd marmot-ts
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a new branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Available Scripts

- `npm run build` - Clean and compile the TypeScript code
- `npm run clean` - Remove the dist directory
- `npm run compile` - Compile TypeScript files
- `npm run test` - Run tests with Vitest
- `npm run format` - Format code with Prettier
- `npm run prepare` - Set up Husky git hooks

### Making Changes

1. Make your changes in the appropriate files
2. Add or update tests for your changes
3. Run linting and formatting:
   ```bash
   npm run format
   npm run lint
   ```
4. Run the test suite to ensure everything passes:
   ```bash
   npm test
   ```
5. Build the project to ensure it compiles:
   ```bash
   npm run build
   ```

## Changelog

For each user-visible library change, add a short description to `## Unreleased` in
`CHANGELOG.md`. Describe what library users can do or what now works better. Group
entries under Added, Changed, Fixed, or Breaking changes as appropriate, and include
migration guidance for breaking changes. Internal-only maintenance does not need an entry.

## Releases

1. Move the Unreleased entries into a section named for the release version and leave
   an empty `## Unreleased` section for future changes.
2. Update the root `package.json` version and run `pnpm install --lockfile-only`.
3. Run `pnpm build`, `pnpm vitest run`, and `bash scripts/package-smoke/run.sh`.
4. Commit the release metadata through a PR and merge it into `master`.
5. Tag the merged commit as `v<version>` (for example, `v0.6.0`) and push the tag.
   The release workflow verifies the version and changelog, publishes the library to
   npm with provenance, creates a GitHub release from those notes, and announces it
   on Nostr.

`pnpm release` publishes the root library package locally; it does not publish
workspace packages. `pnpm release-next` continues to publish temporary prereleases
from the tip of `origin/master`.
