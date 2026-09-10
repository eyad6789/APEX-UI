#!/usr/bin/env bash
# Optional: the richer Kokoro-82M voice. Pulls PyTorch (~2GB).
# Enable it afterwards with APEX_TTS=kokoro in .env.local.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d .venv-tts ] || python3 -m venv .venv-tts
.venv-tts/bin/pip install --quiet --upgrade pip
echo "==> Installing kokoro + soundfile (this pulls PyTorch, ~2GB)"
.venv-tts/bin/pip install --quiet kokoro soundfile

echo "==> Smoke test"
echo "Apex is online." | .venv-tts/bin/python -c "
import sys, numpy as np
from kokoro import KPipeline
p = KPipeline(lang_code='b')
chunks = [a for _, _, a in p(sys.stdin.read().strip(), voice='bm_george')]
print('ok,', sum(len(c) for c in chunks), 'samples', file=sys.stderr)
"
echo "Done. Set APEX_TTS=kokoro in .env.local to use it."
