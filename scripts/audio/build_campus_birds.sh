#!/usr/bin/env bash
set -euo pipefail
# Source IDs and CC0 licences: public/assets/audio/SOURCES.md.
# Run from the project root after restoring the two private source MP3s.
mkdir -p public/assets/audio/birds
ffmpeg -hide_banner -loglevel error -y -ss 1.45 -i assets/source/audio/birds/sparrows-jkata.mp3 -t .72 -af 'highpass=f=1800,volume=8,afade=t=in:d=.025,afade=t=out:st=.56:d=.16' -ac 1 -c:a libopus -b:a 48k public/assets/audio/birds/sparrow-01.ogg
ffmpeg -hide_banner -loglevel error -y -ss 8.3 -i assets/source/audio/birds/sparrows-jkata.mp3 -t .68 -af 'highpass=f=1800,volume=8,afade=t=in:d=.025,afade=t=out:st=.51:d=.17' -ac 1 -c:a libopus -b:a 48k public/assets/audio/birds/sparrow-02.ogg
ffmpeg -hide_banner -loglevel error -y -ss .2 -i assets/source/audio/birds/pigeons-flying-mcmikai.mp3 -t 1.2 -af 'highpass=f=180,afade=t=in:d=.02,afade=t=out:st=.85:d=.35' -ac 1 -c:a libopus -b:a 48k public/assets/audio/birds/takeoff.ogg
