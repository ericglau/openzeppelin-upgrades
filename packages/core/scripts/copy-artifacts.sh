#!/usr/bin/env bash

set -euo pipefail

# Copies proxy artifacts to their location in previous versions for backwards compatibility

cp -R legacy artifacts
