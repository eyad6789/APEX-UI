#!/usr/bin/env bash
# Installs Apex's default voice: Piper + the en_GB "Alan" model.
# Everything lands inside the project (.venv-tts/ and voices/), both gitignored.
set -euo pipefail
cd "$(dirname "$0")/.."

VOICE="${1:-en_GB-alan-medium}"
LANG_DIR="en/en_GB/$(echo "$VOICE" | cut -d- -f2)/$(echo "$VOICE" | cut -d- -f3)"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/$LANG_DIR/$VOICE"

echo "==> Creating .venv-tts"
python3 -m venv .venv-tts
.venv-tts/bin/pip install --quiet --upgrade pip
echo "==> Installing piper-tts"
.venv-tts/bin/pip install --quiet piper-tts

mkdir -p voices
if [ ! -f "voices/$VOICE.onnx" ]; then
  echo "==> Downloading voice $VOICE (~60MB)"
  curl -fL --progress-bar -o "voices/$VOICE.onnx"      "$BASE.onnx"
  curl -fL --silent        -o "voices/$VOICE.onnx.json" "$BASE.onnx.json"
else
  echo "==> Voice $VOICE already present"
fi

echo "==> Smoke test"
echo "Apex is online." | .venv-tts/bin/piper --model "voices/$VOICE.onnx" --output-raw > /dev/null
echo "Done. Piper is the default voice - just run npm run dev."
