import pytest
from services.audio_worker.alignment_benchmark import held_out_song, metrics


def test_null_labels_are_not_ground_truth():
    report=metrics([{'id':'a','start':1}], [{'lineId':'a','startMin':None,'startMax':None}], 'hash')
    assert report['validationStatus']=='pending_human_review'
    assert report['allUsable']['medianErrorSeconds'] is None


def test_measures_uncertainty_ranges_and_rejects_wrong_recording():
    labels=[{'lineId':'a','recordingHash':'hash','humanReviewed':True,'startMin':1,'startMax':1.2}]
    report=metrics([{'id':'a','start':1.5,'confidence':.75,'timingQuality':'supported'}],labels,'hash')
    assert report['automaticallyAccepted']['medianErrorSeconds']==pytest.approx(.3)
    with pytest.raises(ValueError):metrics([],labels,'other')


def test_evaluation_lines_do_not_leak_as_anchors():
    original={'lines':[{'id':'a','verified':True,'timingSource':'manual','planningReference':{'start':1}}]}
    result=held_out_song(original,[{'lineId':'a','humanReviewed':True,'startMin':1}])
    assert result['lines'][0]['verified'] is False
    assert result['lines'][0]['timingSource']=='draft'
    assert 'planningReference' not in result['lines'][0]
    assert original['lines'][0]['verified'] is True
