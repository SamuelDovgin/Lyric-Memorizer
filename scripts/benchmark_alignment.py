#!/usr/bin/env python3
"""Run real models without changing saved songs; export blind human-label templates.

python3 scripts/benchmark_alignment.py --song-id SONG_ID [--labels labels.json]
python3 scripts/benchmark_alignment.py --evaluate candidate.json --baseline before.json --labels labels.json
"""
import argparse
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.audio_worker.alignment_benchmark import held_out_song, metrics
from services.audio_worker.database import DATA_DIR, get_song
from services.audio_worker.forced_alignment_job import execute_forced_alignment


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--song-id', action='append', default=[])
    parser.add_argument('--language', default='en')
    parser.add_argument('--labels', type=Path)
    parser.add_argument('--evaluate', type=Path)
    parser.add_argument('--baseline', type=Path)
    args=parser.parse_args()
    labels=json.loads(args.labels.read_text()) if args.labels else []
    if args.evaluate:
        result=json.loads(args.evaluate.read_text())
        report=metrics(result['lines'],labels,result['alignmentRun']['recordingHash'])
        if args.baseline:
            report['baseline']=metrics(json.loads(args.baseline.read_text())['lines'],labels,result['alignmentRun']['recordingHash'])
        print(json.dumps(report,indent=2));return
    if not args.song_id:
        parser.error('Provide --song-id or --evaluate')
    for song_id in args.song_id:
        found=get_song(song_id)
        if not found:raise ValueError('Song not found: '+song_id)
        song,paths=found
        run_id='benchmark_'+uuid.uuid4().hex
        run_song=held_out_song(song,labels)
        result=execute_forced_alignment(run_song,paths,run_id,DATA_DIR,lambda message:print(message,flush=True),args.language)
        directory=Path(result['alignmentRun']['candidateArtifactPath']).parent
        report=metrics(result['lines'],labels,result['alignmentRun']['recordingHash'])
        report.update(songId=song_id,title=song['title'],run=result['alignmentRun'])
        report['baseline']=metrics(song['lines'],labels,result['alignmentRun']['recordingHash'])
        (directory/'benchmark-report.json').write_text(json.dumps(report,indent=2))
        # No model suggestions in the label template: record actual onsets by ear.
        template=[{'lineId':l['id'],'lineNumber':i+1,'text':l['text'],
                   'recordingHash':result['alignmentRun']['recordingHash'],
                   'humanReviewed':False,'startMin':None,'startMax':None} for i,l in enumerate(song['lines'])]
        (directory/'human-labels.json').write_text(json.dumps(template,indent=2))
        print(directory/'benchmark-report.json',flush=True)


if __name__=='__main__':main()
