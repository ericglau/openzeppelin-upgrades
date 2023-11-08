#!/usr/bin/env bash

set -euo pipefail

# Copies proxy artifacts to their location in previous versions for backwards compatibility

mkdir -p artifacts

cp -R legacy/ artifacts
