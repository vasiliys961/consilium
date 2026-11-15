"""Read one 12-lead table from stdin and print ECGFounder scores. Samples stay out of the reply."""

import json
import sys

payload = json.load(sys.stdin)
home = payload.get("home") or ""
if home:
    sys.path.insert(0, home)

try:
    from ecg_engine.ecgfounder import SignalError, WeightsMissing, predict_signal
except Exception:
    json.dump({"ok": False, "code": "missing"}, sys.stdout)
    raise SystemExit(0)

leads = payload.get("leads") or {}
names = list(leads)
signal = [leads[name] for name in names]
measurements = None
try:
    from ecg_engine.ecgfounder import arrange
    from ecg_engine.delineation import measure_tracing
    measurements = measure_tracing(arrange(signal, names), float(payload.get("samplingRate") or 0))
except Exception:
    pass

try:
    result = predict_signal(signal, names, float(payload.get("samplingRate") or 0), top=8)
    scores = [{"label": item["label"], "score": item["score"]} for item in result.get("scores", [])]
    json.dump({"ok": True, "scores": scores, "measurements": measurements}, sys.stdout)
except SignalError:
    json.dump({"ok": False, "code": "signal", "measurements": measurements}, sys.stdout)
except WeightsMissing:
    json.dump({"ok": False, "code": "weights", "measurements": measurements}, sys.stdout)
except Exception:
    json.dump({"ok": False, "code": "error", "measurements": measurements}, sys.stdout)
