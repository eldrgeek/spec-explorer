#!/usr/bin/env bash
# Regenerate the film's synthesized audio assets (git-ignored; ~19MB bed).
# Placeholders until a real licensed/gen track replaces the bed.
set -euo pipefail
cd "$(dirname "$0")"

# Soft UI click tick.
ffmpeg -y -loglevel error -f lavfi -i "sine=frequency=1150:duration=0.045" \
  -af "volume=0.55,afade=t=in:st=0:d=0.004,afade=t=out:st=0.010:d=0.035" click.wav

# Subtle warm ambient bed — open Csus chord, slow tremolo, lowpassed for warmth, light space.
ffmpeg -y -loglevel error \
  -f lavfi -i "sine=frequency=130.81:duration=110" -f lavfi -i "sine=frequency=196.00:duration=110" \
  -f lavfi -i "sine=frequency=293.66:duration=110" -f lavfi -i "sine=frequency=392.00:duration=110" \
  -filter_complex "[0][1][2][3]amix=inputs=4:normalize=1,tremolo=f=0.11:d=0.45,lowpass=f=760,aecho=0.8:0.7:70:0.35,volume=1.7,afade=t=in:st=0:d=3.5,afade=t=out:st=106:d=4[a]" \
  -map "[a]" warm-bed.wav

echo "wrote click.wav + warm-bed.wav"
