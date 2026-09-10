"""JSON file protocol for the isolated, pinned model environment."""
import json
import sys
from pathlib import Path

from .forced_alignment import StableAdapter, run_alignment


def main():
    request = json.loads(Path(sys.argv[1]).read_text())
    config = request['config']
    def progress(message):
        print(json.dumps({'message': message}), flush=True)
    progress('Loading forced-alignment model…')
    adapter = StableAdapter(config['model'], config['language'], config.get('device', 'cpu'))
    result = run_alignment(request['song'], request['paths'], config, Path(request['cacheDir']), adapter, progress)
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2))
    progress('Checking and saving timings…')


if __name__ == '__main__':
    main()
