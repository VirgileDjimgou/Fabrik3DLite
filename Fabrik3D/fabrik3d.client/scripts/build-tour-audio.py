"""Assemble the Fabrik3D guided-tour video: French voice-over, subtitles, final mux.

Inputs:
  artifacts/demo/tour/segments/<chapter>.json  (caption timeline per chapter)
  artifacts/demo/tour/segments/<video>.webm    (chapter recordings)

Outputs:
  artifacts/demo/tour/voice/<hash>.mp3         (cached TTS clips)
  artifacts/demo/tour/build/<chapter>.wav      (chapter audio mixes)
  artifacts/demo/tour/build/tour-audio.wav
  artifacts/demo/tour/build/tour-video.webm
  artifacts/demo/tour/fabrik3d-visite-guidee-complete.mp4   (H.264 + AAC + soft subs)
  artifacts/demo/tour/fabrik3d-visite-guidee-complete.webm  (VP8 copy + Opus)
  artifacts/demo/tour/fabrik3d-visite-guidee-fr.srt

Usage:
  python scripts/build-tour-audio.py [--voice fr-FR-DeniseNeural] [--rate +8%]
         [--segments ..] [--no-final]
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = Path(__file__).resolve().parents[2]
TOUR = ROOT / "artifacts" / "demo" / "tour"
SEGMENTS = TOUR / "segments"
VOICE = TOUR / "voice"
BUILD = TOUR / "build"


def run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed: {' '.join(str(c) for c in cmd)}\n{proc.stderr[-1500:]}")


def probe_duration(path: Path) -> float:
    proc = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    match = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", proc.stderr)
    if not match:
        raise RuntimeError(f"cannot probe duration of {path}")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def synthesize(text: str, out_path: Path, voice: str, rate: str):
    if out_path.exists() and out_path.stat().st_size > 500:
        return
    out_path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, "-m", "edge_tts", "--voice", voice, "--rate", rate,
         "--text", text, "--write-media", str(out_path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0 or not out_path.exists():
        raise RuntimeError(f"TTS failed for '{text[:60]}...': {proc.stderr[-600:]}")


def build_chapter_audio(record: dict, voice: str, rate: str, out_path: Path) -> float:
    duration = probe_duration(Path(record["video"]))
    captions = record.get("captions", [])
    clips = []
    for index, caption in enumerate(captions):
        text = (caption.get("voice") or caption.get("title") or "").strip()
        if not text:
            continue
        digest = hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8")).hexdigest()[:16]
        clip = VOICE / f"{digest}.mp3"
        synthesize(text, clip, voice, rate)
        start_ms = max(0, int(caption.get("t", 0)) + 150)
        if start_ms > (duration - 0.8) * 1000:
            start_ms = int(max(0, duration - 0.8) * 1000)
        clips.append((clip, start_ms))

    if not clips:
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000",
             "-t", f"{duration:.3f}", "-ar", "24000", "-ac", "1", str(out_path)])
        return duration

    inputs = ["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=24000"]
    filters = []
    for i, (clip, start_ms) in enumerate(clips, start=1):
        inputs += ["-i", str(clip)]
        filters.append(f"[{i}:a]adelay={start_ms}|{start_ms}[a{i}]")
    mix_inputs = "".join(f"[a{i}]" for i in range(1, len(clips) + 1))
    filters.append(f"[0:a]{mix_inputs}amix=inputs={len(clips) + 1}:duration=first:normalize=0[aout]")
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *inputs,
         "-filter_complex", ";".join(filters), "-map", "[aout]",
         "-t", f"{duration:.3f}", "-ar", "24000", "-ac", "1", str(out_path)])
    return duration


def write_srt(records, duration_by_id, out_path: Path):
    lines = []
    counter = 1
    offset = 0.0
    def stamp(seconds: float) -> str:
        ms = int(round(seconds * 1000))
        h, ms = divmod(ms, 3600000)
        m, ms = divmod(ms, 60000)
        s, ms = divmod(ms, 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
    for record in records:
        duration = duration_by_id[record["id"]]
        captions = record.get("captions", [])
        for index, caption in enumerate(captions):
            start = offset + caption.get("t", 0) / 1000.0
            if index + 1 < len(captions):
                end = offset + captions[index + 1].get("t", 0) / 1000.0
            else:
                end = offset + duration
            end = min(end, offset + duration - 0.1)
            if end <= start:
                end = start + 1.0
            title = (caption.get("title") or "").strip()
            sub = (caption.get("sub") or "").strip()
            text = title if not sub else f"{title}\n{sub}"
            lines.append(f"{counter}\n{stamp(start)} --> {stamp(end)}\n{text}\n")
            counter += 1
        offset += duration
    out_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="fr-FR-DeniseNeural")
    parser.add_argument("--rate", default="+8%")
    parser.add_argument("--segments", default=str(SEGMENTS))
    parser.add_argument("--no-final", action="store_true")
    args = parser.parse_args()

    segments = Path(args.segments)
    records = []
    for path in sorted(segments.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        if not data.get("video"):
            print(f"skip {path.name}: no video (dry-run)")
            continue
        if not Path(data["video"]).exists():
            print(f"skip {path.name}: missing video file")
            continue
        records.append(data)

    if not records:
        print("no recorded chapters found")
        return

    BUILD.mkdir(parents=True, exist_ok=True)
    durations = {}
    audio_paths = []
    for record in records:
        out = BUILD / f"{record['id']}.wav"
        print(f"audio {record['id']} ...", flush=True)
        durations[record["id"]] = build_chapter_audio(record, args.voice, args.rate, out)
        audio_paths.append(out)

    write_srt(records, durations, TOUR / "fabrik3d-visite-guidee-fr.srt")

    def concat(paths, out, extra=None):
        list_file = BUILD / f"concat-{out.stem}.txt"
        list_file.write_text("".join(f"file '{p.as_posix()}'\n" for p in paths), encoding="utf-8")
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", str(list_file), "-c", "copy", *(extra or []), str(out)])

    video_concat = BUILD / "tour-video.webm"
    audio_concat = BUILD / "tour-audio.wav"
    print("concatenating video ...", flush=True)
    concat([Path(r["video"]) for r in records], video_concat)
    print("concatenating audio ...", flush=True)
    concat(audio_paths, audio_concat)

    total = sum(durations.values())
    print(f"total duration ~ {total / 60:.1f} min")

    if args.no_final:
        return

    mp4 = TOUR / "fabrik3d-visite-guidee-complete.mp4"
    srt = TOUR / "fabrik3d-visite-guidee-fr.srt"
    print("encoding final MP4 (H.264 + AAC + sous-titres) ...", flush=True)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(video_concat), "-i", str(audio_concat), "-i", str(srt),
         "-map", "0:v:0", "-map", "1:a:0", "-map", "2:s:0",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k",
         "-c:s", "mov_text", "-metadata:s:s:0", "language=fra",
         "-movflags", "+faststart", "-shortest", str(mp4)])
    webm = TOUR / "fabrik3d-visite-guidee-complete.webm"
    print("remuxing WebM (vinyle copy + Opus) ...", flush=True)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
         "-i", str(video_concat), "-i", str(audio_concat),
         "-c:v", "copy", "-c:a", "libopus", "-b:a", "128k", "-shortest", str(webm)])
    print(f"done: {mp4}")
    print(f"done: {webm}")
    print(f"subtitles: {srt}")


if __name__ == "__main__":
    main()
