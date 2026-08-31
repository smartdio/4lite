#!/bin/sh
set -eu

MAGICK=/opt/homebrew/bin/magick
INPUT=archive/phase-1/runtime-history/public/assets/textures/b1-railing-ornament-repeat-v1.png
OUTPUT=public/assets/textures/b1-railing-ornament-repeat-v2.png

# Add one rectangular opening above and below the approved central ornament.
# The vertical members sit on the repeat boundary so adjacent tiles join cleanly.
"$MAGICK" -size 218x565 canvas:none \
  \( "$INPUT" \) -geometry +0+74 -composite \
  -fill none -stroke '#e2b534' -strokewidth 12 \
  -draw 'line 0,6 217,6 line 0,6 0,74 line 217,6 217,74 line 0,559 217,559 line 0,490 0,559 line 217,490 217,559' \
  "$OUTPUT"
