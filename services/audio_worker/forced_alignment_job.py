"""Worker-side subprocess bridge. No ML imports or shared dependency changes."""
import json
import os
import subprocess
import threading
from pathlib import Path

from .forced_alignment import validate_result

ROOT = Path(__file__).resolve().parents[2]


def execute_forced_alignment(song, paths, run_id, data_dir, progress, language='en'):
    interpreter = Path(os.environ.get('LYRIC_ALIGNMENT_PYTHON', ROOT / '.venv-alignment/bin/python'))
    if not interpreter.is_file():
        raise RuntimeError('Forced alignment is not installed. Run scripts/setup_forced_alignment.sh; existing timing kept.')
    directory = Path(data_dir) / 'alignment-runs' / run_id
    directory.mkdir(parents=True, exist_ok=False)
    # This immutable snapshot is also the rollback artifact.
    (directory / 'before.json').write_text(json.dumps(song, indent=2))
    config = {'model': os.environ.get('LYRIC_FORCED_MODEL', 'small'), 'language': language,
              'device': os.environ.get('LYRIC_FORCED_DEVICE', 'cpu'), 'runId': run_id,
              'retryModel': os.environ.get('LYRIC_FORCED_RETRY_MODEL')}
    request = {'song': song, 'paths': paths, 'config': config,
               'cacheDir': str(Path(data_dir) / 'alignment-cache')}
    input_path, output_path = directory / 'input.json', directory / 'candidate.json'
    input_path.write_text(json.dumps(request))
    with (directory / 'stderr.log').open('w') as errors:
        process = subprocess.Popen([str(interpreter), '-m', 'services.audio_worker.forced_alignment_runner',
                                    str(input_path), str(output_path)], cwd=ROOT, stdout=subprocess.PIPE,
                                   stderr=errors, text=True)
        timer = threading.Timer(float(os.environ.get('LYRIC_FORCED_TIMEOUT_SECONDS', '1800')), process.kill)
        timer.start()
        try:
            for line in process.stdout:
                try:
                    event = json.loads(line)
                except ValueError:
                    continue
                if isinstance(event, dict) and isinstance(event.get('message'), str):
                    progress(event['message'])
            code = process.wait()
        except BaseException:
            process.terminate()
            process.wait()
            raise
        finally:
            timer.cancel()
    if code or not output_path.exists():
        details = (directory / 'stderr.log').read_text().strip().splitlines()
        raise RuntimeError('Forced alignment could not finish: ' + (details[-1] if details else 'model process failed') + '. Existing timing kept.')
    result = json.loads(output_path.read_text())
    validate_result(song, result['lines'])
    result['alignmentRun']['candidateArtifactPath'] = str(output_path)
    result['alignmentRun']['snapshotPath'] = str(directory / 'before.json')
    result['alignmentRun']['runId'] = run_id
    return result
