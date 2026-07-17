# Agent Build Policy

The project owner has approved unsigned Windows builds and releases as the default workflow until further notice.

## Default commands

- `npm run build`: creates the unsigned Windows portable artifact.
- `npm run release`: creates the unsigned portable artifact and versioned ZIP.
- `npm run release:github`: publishes that ZIP when a GitHub release is explicitly requested.

## Mandatory rules

1. Do not claim that an artifact is signed when it is not.
2. Do not require signing variables for normal build, test, release, or GitHub publishing flows.
3. Keep the unsigned nature of distributed artifacts visible in release notes or publishing context when relevant.
4. Do not deploy or publish unless the user explicitly requests it.

## Optional future signing

Explicit `*:signed` commands remain available only as an optional future capability. They are not part of the default build or release workflow.
