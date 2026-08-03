#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# --- 1. Argument Parsing & Validation ---
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <input_svg_file> <output_directory>"
    echo "Example: $0 logo.svg ../"
    echo "Note: The SVG file is expected to be:"
    echo "      - Looking good at 512x512 renderings"
    echo "      - Already cropped"
    echo "      - Exported from Inkscape as a 'Plain SVG'"
    exit 1
fi

INPUT_SVG="$1"
OUT_DIR="$2"

if [ ! -f "$INPUT_SVG" ]; then
    echo "Error: Input file '$INPUT_SVG' does not exist."
    exit 1
fi

# --- 2. Dependency Checks ---
if ! command -v inkscape &> /dev/null; then
    echo "Error: 'inkscape' is not installed or not in PATH."
    exit 1
fi

# Detect whether ImageMagick is using 'magick' (v7+) or 'convert' (v6)
IM_CMD=""
if command -v magick &> /dev/null; then
    IM_CMD="magick"
elif command -v convert &> /dev/null; then
    IM_CMD="convert"
else
    echo "Error: ImageMagick ('magick' or 'convert') is not installed."
    exit 1
fi

# --- 3. Create Output Directory ---
mkdir -p "$OUT_DIR"
echo "Generating favicon set in: $OUT_DIR/"

# --- 4. Generate Files ---

# Copy the original SVG
cp "$INPUT_SVG" "$OUT_DIR/icon.svg"
echo " ✓ Copied: icon.svg"

# Use Inkscape to export specific PNG sizes.
# Note: This uses Inkscape 1.0+ syntax (-w, -h, -o).
inkscape -w 180 -h 180 "$INPUT_SVG" -o "$OUT_DIR/apple-touch-icon.png" > /dev/null 2>&1
echo " ✓ Rendered: apple-touch-icon.png (180x180)"

inkscape -w 192 -h 192 "$INPUT_SVG" -o "$OUT_DIR/icon-192x192.png" > /dev/null 2>&1
echo " ✓ Rendered: icon-192x192.png (192x192)"

inkscape -w 512 -h 512 "$INPUT_SVG" -o "$OUT_DIR/icon-512x512.png" > /dev/null 2>&1
echo " ✓ Rendered: icon-512x512.png (512x512)"

# Use ImageMagick to generate the multi-resolution favicon.ico 
# We use the high-res 512x512 PNG as the source for the downscaling.
$IM_CMD "$OUT_DIR/icon-512x512.png" -define icon:auto-resize=48,32,16 "$OUT_DIR/favicon.ico"
echo " ✓ Rendered: favicon.ico (Bundle: 48x48, 32x32, 16x16)"

echo "Done! All files successfully generated."
