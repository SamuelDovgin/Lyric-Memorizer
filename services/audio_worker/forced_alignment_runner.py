"""JSON file protocol for the isolated, pinned model environment."""
import json
import sys
from pathlib import Path

from .forced_alignment import DEFAULT_DEVICE, StableAdapter, resolve_device, run_alignment


def main():
    request = json.loads(Path(sys.argv[1]).read_text())
    config = request['config']
    requested_device = config.get('requestedDevice', config.get('device', DEFAULT_DEVICE))
    config['requestedDevice'] = requested_device
    config['device'] = resolve_device(config.get('device', DEFAULT_DEVICE))
    def progress(fraction, message):
        print(json.dumps({'progress': fraction, 'message': message}), flush=True)
    progress(0.04, f"Loading Whisper {config['model']} for quality-first alignment…")
    adapter = StableAdapter(config['model'], config['language'], config['device'])
    progress(0.12, f"Whisper {config['model']} loaded. Preparing lyric passages…")
    result = run_alignment(request['song'], request['paths'], config, Path(request['cacheDir']), adapter, progress)
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2))
    progress(0.97, 'Checking and saving timings…')


if __name__ == '__main__':
    main()
