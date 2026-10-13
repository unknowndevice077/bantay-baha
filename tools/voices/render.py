"""Record the story game's NPC lines with Chatterbox (Resemble AI, MIT licence).

Reads tools/voices/lines.json (from export_lines.mjs), gives each character a
voice by cloning a pitch-shifted reference clip (from make_refs.ps1), sets the
emotion of each line through Chatterbox's exaggeration / CFG controls, and
writes public/voices/<id>.ogg plus public/voices/manifest.json for the game.

Already-rendered lines are skipped, so it can be stopped and re-run.

    tools/voices/.venv/Scripts/python tools/voices/render.py
"""
import hashlib
import json
import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
OUT = ROOT / "public" / "voices"
REFS = HERE / "refs"
SEED = 2026

# Character -> (base reference, semitones). Older and smaller voices shifted down / up.
CAST = {
    "lito": ("david", 0),
    "radio": ("david", 0),
    "bulletin": ("david", -2),
    "jun": ("david", 3),
    "ben": ("david", -4),
    "lola": ("zira", -3),
    "nena": ("zira", 0),
    "toto": ("zira", 5),
    "resident-male": ("david", 1.5),
    "resident-female": ("zira", 2),
    "resident-child": ("zira", 6),
}

# Emotion -> (exaggeration, cfg_weight). Higher exaggeration = more intense delivery;
# lower cfg = slower, more deliberate pacing (Chatterbox's own guidance for dramatic lines).
EMOTION = {
    "calm": (0.4, 0.5),
    "warm": (0.55, 0.5),
    "concerned": (0.65, 0.45),
    "urgent": (0.85, 0.35),
    "alarmed": (1.1, 0.3),
    "stubborn": (0.75, 0.45),
    "scared": (0.95, 0.3),
    "relieved": (0.6, 0.45),
    "tired": (0.5, 0.6),
    "excited": (1.0, 0.35),
}


def reference(speaker: str) -> Path:
    base, semitones = CAST[speaker]
    path = REFS / f"{speaker}.wav"
    if not path.exists():
        y, sr = librosa.load(REFS / f"{base}.wav", sr=None)
        if semitones:
            y = librosa.effects.pitch_shift(y, sr=sr, n_steps=semitones)
        sf.write(path, y, sr)
    return path


def line_id(speaker: str, text: str) -> str:
    return speaker + "-" + hashlib.sha1(f"{speaker}|{text}".encode()).hexdigest()[:10]


def main():
    lines = json.loads((HERE / "lines.json").read_text(encoding="utf8"))
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"lines": {}}
    todo = [l for l in lines if not (OUT / f"{line_id(l['speaker'], l['text'])}.ogg").exists()]
    print(f"{len(lines)} lines, {len(todo)} to record")
    if todo:
        torch.manual_seed(SEED)
        model = ChatterboxTTS.from_pretrained(device="cpu")
    for n, l in enumerate(todo, 1):
        started = time.time()
        exaggeration, cfg = EMOTION[l["emotion"]]
        wav = model.generate(l["text"], audio_prompt_path=str(reference(l["speaker"])), exaggeration=exaggeration, cfg_weight=cfg)
        audio = wav.squeeze(0).numpy().astype(np.float32)
        name = f"{line_id(l['speaker'], l['text'])}.ogg"
        sf.write(OUT / name, audio, model.sr, format="OGG", subtype="VORBIS")
        manifest["lines"][f"{l['speaker']}|{l['text']}"] = name
        manifest_path.write_text(json.dumps(manifest, indent=1))
        print(f"[{n}/{len(todo)}] {l['speaker']:15s} {l['emotion']:9s} {time.time() - started:5.1f}s  {l['text'][:60]}", flush=True)
    # Keep the manifest in step with the script (drop lines that were cut).
    keep = {f"{l['speaker']}|{l['text']}" for l in lines}
    manifest["lines"] = {k: v for k, v in manifest["lines"].items() if k in keep and (OUT / v).exists()}
    manifest_path.write_text(json.dumps(manifest, indent=1))
    print(f"manifest: {len(manifest['lines'])} lines -> {manifest_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
