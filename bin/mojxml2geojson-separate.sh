#!/bin/bash -e

dir=$(mktemp -d)
echo "Working in $dir"

OUTPUT_DIR=$(dirname "$1")
INPUT_FILENAME=$(basename "$1")
INPUT_PATH="${dir}/${INPUT_FILENAME}"
cp "$1" "${INPUT_PATH}"

./bin/mojxml2separate.py "${INPUT_PATH}"
rm "${INPUT_PATH}"

for xml in "${dir}"/*.xml; do
  mojxml2geojson --exclude "${xml}"
done

for geojson in "${dir}"/*.geojson; do
  OUTPUT_FILENAME="${OUTPUT_DIR}/$(basename "${geojson}")"
  cp "$geojson" "$OUTPUT_FILENAME"
done

rm -r "$dir"
