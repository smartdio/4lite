#!/usr/bin/env bash
set -euo pipefail

if ! command -v basisu >/dev/null 2>&1; then
  echo 'basisu is required (Homebrew formula: basis_universal).' >&2
  exit 1
fi

source_texture='public/assets/textures/sand/sandpit-cement-rim-albedo-v01.png'
output_dir='artifacts/phase-3/sand-ktx2'
etc1s_output="$output_dir/sandpit-cement-rim-etc1s-q90.ktx2"
uastc_output="$output_dir/sandpit-cement-rim-uastc-rdo1.ktx2"
runtime_uastc_output='public/assets/textures/sand/sandpit-cement-rim-albedo-v01-uastc-rdo1.ktx2'

mkdir -p "$output_dir"
basisu -file "$source_texture" -output_file "$etc1s_output" -ktx2 -etc1s -quality 90 -effort 6 -mipmap
basisu -file "$source_texture" -output_file "$uastc_output" -ktx2 -uastc -uastc_level 3 -uastc_rdo_l 1.0 -mipmap
basisu -validate "$etc1s_output"
basisu -validate "$uastc_output"
cp "$uastc_output" "$runtime_uastc_output"
stat -f '%z %N' "$source_texture" "$etc1s_output" "$uastc_output"
shasum -a 256 "$etc1s_output" "$uastc_output" "$runtime_uastc_output"
