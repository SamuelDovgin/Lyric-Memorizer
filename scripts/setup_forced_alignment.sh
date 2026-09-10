#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -m venv .venv-alignment
.venv-alignment/bin/python -m pip install -r services/audio_worker/requirements-forced.txt
.venv-alignment/bin/python -c 'import stable_whisper, torch, torchaudio; print("Forced alignment installed. Model weights download on first use.")'
