#!/usr/bin/env bash
# Restore the BiGG model JSONs used by scripts/make_sample_dataset.py to generate
# the example datasets. They are gitignored (large, downloaded); run this once on a
# fresh clone, then `npm run data:sample`.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p scripts

echo "BiGG models (sample-generator inputs) -> scripts/"
curl -fsSL "http://bigg.ucsd.edu/static/models/e_coli_core.json" -o scripts/_e_coli_core.model.json
curl -fsSL "http://bigg.ucsd.edu/static/models/iJO1366.json" -o scripts/_iJO1366.model.json

echo "done — now run: npm run data:sample (datasets) and npm run data:brenda (BRENDA index)"
