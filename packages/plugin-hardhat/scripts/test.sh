#!/usr/bin/env bash

set -euo pipefail

rimraf .openzeppelin
hardhat compile --force
node scripts/copy-build-info.js
ava "$@"
