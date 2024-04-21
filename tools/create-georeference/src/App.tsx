import { useCallback, useEffect, useRef, useState } from 'react'
import type geolonia from '@geolonia/embed';
import type GeoJSON from 'geojson';
import { GeoloniaMap } from '@geolonia/embed-react';
import {useDropzone} from 'react-dropzone';
import { useHotkeys } from 'react-hotkeys-hook';
import classNames from 'classnames';
import loam from './loam-loader';
import './App.css';
import turfBBox from '@turf/bbox';

type GCP = { id: number, input: [number, number], output: [number, number] };

function App() {
  const [map, setMap] = useState<geolonia.Map | null>(null);

  const ogr2ogrFlagsRef = useRef<HTMLInputElement>(null);

  const [inputFile, setInputFile] = useState<File | null>(null);
  const [prevGcps, setPrevGcps] = useState<GCP[] | null>(null);
  const [gcps, setGcps] = useState<GCP[]>([]);

  useHotkeys('ctrl+z', () => {
    if (prevGcps) {
      setGcps(prevGcps);
    }
  });

  useEffect(() => {
    const nowGcps = gcps;
    return () => {
      setPrevGcps(nowGcps);
    }
  }, [gcps]);

  const [referencedGeoJSON, setReferencedGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  const calculateDefaultGCPsToCurrentViewport = useCallback<(file: File) => Promise<GCP[]>>((file: File) => {
    return new Promise<GCP[]>((resolve, reject) => {
      if (!map) { return reject('Map not initialized'); }
      const mapBounds = map.getBounds();
      console.log('mapBounds', mapBounds);

      const reader = new FileReader();
      reader.onload = () => {
        const geojson = JSON.parse(reader.result as string) as GeoJSON.FeatureCollection;
        const bbox = turfBBox(geojson);
        console.log('input bbox', bbox);

        // map each corner of the input bbox to the corresponding corner of the mapBounds
        // but, we want to preserve the aspect ratio of the input bbox
        const inputWidth = bbox[2] - bbox[0];
        const inputHeight = bbox[3] - bbox[1];
        const outputWidth = mapBounds.getEast() - mapBounds.getWest();
        const outputHeight = mapBounds.getNorth() - mapBounds.getSouth();
        const aspectRatio = inputWidth / inputHeight;
        const outputAspectRatio = outputWidth / outputHeight;
        const scale = aspectRatio > outputAspectRatio
          ? outputWidth / inputWidth
          : outputHeight / inputHeight;
        const outputCenter = [
          (mapBounds.getWest() + mapBounds.getEast()) / 2,
          (mapBounds.getSouth() + mapBounds.getNorth()) / 2,
        ];
        const outputBbox = [
          outputCenter[0] - (inputWidth * scale / 2),
          outputCenter[1] - (inputHeight * scale / 2),
          outputCenter[0] + (inputWidth * scale / 2),
          outputCenter[1] + (inputHeight * scale / 2),
        ];
        const gcps: GCP[] = [
          { id: 0, input: [bbox[0], bbox[1]], output: [outputBbox[0], outputBbox[1]] },
          { id: 1, input: [bbox[2], bbox[1]], output: [outputBbox[2], outputBbox[1]] },
          { id: 2, input: [bbox[2], bbox[3]], output: [outputBbox[2], outputBbox[3]] },
          { id: 3, input: [bbox[0], bbox[3]], output: [outputBbox[0], outputBbox[3]] },
        ].map(gcp => ({
          id: gcp.id,
          input: [gcp.input[0], gcp.input[1]],
          output: [gcp.output[0], gcp.output[1]],
        }));

        resolve(gcps);
      };
      reader.readAsText(file);
    });
  }, [map]);

  const onDrop = useCallback<(arg0: File[]) => void>(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file.name.endsWith('.geojson')) {
      alert('GeoJSONファイルを選択してください');
      return;
    }

    const defaultGcps = await calculateDefaultGCPsToCurrentViewport(file);
    console.log('defaultGcps', defaultGcps);
    setGcps(defaultGcps);
    setInputFile(file);
  }, [calculateDefaultGCPsToCurrentViewport]);

  useEffect(() => {
    if (!inputFile) {
      return;
    }

    let shouldCancel = false;

    (async () => {
      console.log('reprojecting file', inputFile, gcps);
      const dataset = await loam.open(inputFile);
      const ogr2ogrArgs = gcps.flatMap(gcp => [
        '-gcp', 
        gcp.input[0].toString(), 
        gcp.input[1].toString(),
        gcp.output[0].toString(), 
        gcp.output[1].toString(),
      ]);
      const ogr2ogrcmd = ogr2ogrArgs.join(' ');
      ogr2ogrFlagsRef.current!.value = ogr2ogrcmd;
      console.log('ogr2ogrArgs', ogr2ogrcmd);
      const vectorDataset = await dataset.vectorConvert([
        '-f', 'GeoJSON',
        ...ogr2ogrArgs,
      ]);
      const outBytes = await vectorDataset.bytes();
      const geojson = JSON.parse(new TextDecoder().decode(outBytes)) as GeoJSON.FeatureCollection;
      console.log('done reprojecting file', geojson);
      if (shouldCancel) { return; }
      setReferencedGeoJSON(geojson);
    })();

    return () => {
      shouldCancel = true;
    };
  }, [inputFile, gcps]);

  useEffect(() => {
    if (!map || !gcps) {
      return;
    }

    const src = map.getSource('reference-gcps') as maplibregl.GeoJSONSource;
    src.setData({
      type: 'FeatureCollection',
      features: gcps.map((gcp) => ({
        type: 'Feature',
        id: gcp.id,
        geometry: {
          type: 'Point',
          coordinates: gcp.output,
        },
        properties: {
          input_x: gcp.input[0],
          input_y: gcp.input[1],
        },
      })),
    });
  }, [map, gcps]);

  useEffect(() => {
    if (!map || !referencedGeoJSON) {
      return;
    }

    console.log('updating map with referencedGeoJSON', referencedGeoJSON);
    const src = map.getSource('referenced-geojson') as maplibregl.GeoJSONSource;
    src.setData(referencedGeoJSON);
  }, [map, referencedGeoJSON]);

  const mapLoaded = useCallback((map: geolonia.Map) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)._mainMap = map;
    map.on('load', () => {
      const canvas = map.getCanvasContainer();

      map.addSource('referenced-geojson', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
      map.addLayer({
        id: 'referenced-geojson/outline',
        type: 'line',
        source: 'referenced-geojson',
        paint: {
          'line-color': 'red',
          'line-width': 2,
        },
      });
      map.addLayer({
        id: 'referenced-geojson/fill',
        type: 'fill',
        source: 'referenced-geojson',
        paint: {
          'fill-color': 'rgba(255, 0, 0, 0.5)',
        },
      });
      map.addLayer({
        id: 'referenced-geojson/label',
        type: 'symbol',
        source: 'referenced-geojson',
        layout: {
          'text-font': ['Noto Sans Regular'],
          'text-field': '{筆ID}',
          'text-size': 12,
        },
      });

      map.addSource('reference-gcps', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
      map.addLayer({
        id: 'reference-gcps/points',
        type: 'circle',
        source: 'reference-gcps',
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'editing'], false],
            'red',
            'blue',
          ],
        },
      });

      map.on('mouseenter', 'reference-gcps/points', () => {
        canvas.style.cursor = 'move';
      });

      map.on('mouseleave', 'reference-gcps/points', () => {
        canvas.style.cursor = '';
      });

      let draggingPoint: number | null = null;
      function onMove(e: maplibregl.MapMouseEvent) {
        if (draggingPoint === null) {
          return;
        }
        const coords = e.lngLat;

        const src = map.getSource('reference-gcps') as maplibregl.GeoJSONSource;
        src.updateData({
          update: [
            {
              id: draggingPoint,
              newGeometry: {
                type: 'Point',
                coordinates: [coords.lng, coords.lat],
              },
            }
          ]
        });

        // Set a UI indicator for dragging.
        canvas.style.cursor = 'grabbing';
      }

      function onUp(e: maplibregl.MapMouseEvent) {
        if (draggingPoint === null) {
          return;
        }
        const coords = e.lngLat;
        canvas.style.cursor = '';

        const myDraggingPoint = draggingPoint;
        // console.log('up, commit', coords);
        setGcps((prev) => {
          const newGcps = prev.map((gcp) => {
            console.log('looking for updated gcp with id', myDraggingPoint, 'in', gcp.id, 'coords', coords)
            if (gcp.id === myDraggingPoint) {
              console.log('found gcp', gcp.id, 'updating to', [coords.lng, coords.lat]);
              return {
                id: gcp.id,
                input: gcp.input,
                output: [coords.lng, coords.lat],
              } as GCP;
            }
            return gcp;
          });
          return newGcps;
        });

        draggingPoint = null;

        // Unbind mouse/touch events
        map.off('mousemove', onMove);
        map.off('touchmove', onMove);
      }

      map.on('mousedown', 'reference-gcps/points', (e) => {
        // Prevent the default map drag behavior.
        e.preventDefault();

        const feature = e.features?.[0];
        if (!feature) {
          return;
        }
        draggingPoint = feature.id as number;

        canvas.style.cursor = 'grab';

        map.on('mousemove', onMove);
        map.once('mouseup', onUp);
    });
      
      // map.on('mousedown', 'reference-gcps/points', (e) => {
      //   console.log('mousedown', e);
      //   if (!e.features || e.features.length === 0) { return; }
      //   map.setFeatureState(e.features[0], { editing: true });
      // });
      
      setMap(map);
    });
  }, []);

  const onImportOGR2OGRFlags = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ogr2ogrFlagsRef.current) { return; }
    const args = ogr2ogrFlagsRef.current.value.split(' ');
    const newGCPs: GCP[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-gcp') {
        newGCPs.push({
          id: newGCPs.length,
          input: [parseFloat(args[i + 1]), parseFloat(args[i + 2])],
          output: [parseFloat(args[i + 3]), parseFloat(args[i + 4])],
        });
        i += 4;
      }
    }
    setGcps(newGCPs);
  }, []);

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    multiple: false,
    onDrop,
  });

  return (
    <div id='App'>
      <GeoloniaMap
        onLoad={mapLoaded}
        lang='ja'
        lat='34.3196'
        lng='133.995'
        zoom='5'
        maxZoom='25'
        marker='off'
        hash='on'
        mapStyle='geolonia/gsi'
      >
        <GeoloniaMap.Control 
          position='bottom-right'
          containerProps={ { className: 'maplibregl-ctrl maplibregl-ctrl-group ' } }
        >
          <div className={classNames(
            'map-ctrl-input-form',
            {
              'is-drag-active': isDragActive,
            }
          )}>
            <div {...getRootProps({ className: 'drag-interactor' })}>
              <input {...getInputProps()} />
              <div>任意座標GeoJSONをここに</div>
            </div>
          </div>
        </GeoloniaMap.Control>
        <GeoloniaMap.Control 
          position='bottom-left'
          containerProps={{ className: 'maplibregl-ctrl '}}
        >
          <div className={classNames({ 'hidden': !inputFile })}>
            <button onClick={async () => {
              const defaultGcps = await calculateDefaultGCPsToCurrentViewport(inputFile!);
              console.log('defaultGcps', defaultGcps);
              setGcps(defaultGcps);
            }}>GCPリセット</button>
          </div>
        </GeoloniaMap.Control>
        <GeoloniaMap.Control 
          position='bottom-left'
          containerProps={{ className: 'maplibregl-ctrl '}}
        >
          <div className={classNames({ 'hidden': !referencedGeoJSON })}>
            <button onClick={() => {
              if (!referencedGeoJSON || !inputFile) { return; }
              const string = JSON.stringify(referencedGeoJSON);
              const fileType = 'application/geo+json';
              const blob = new Blob([string], { type: fileType });

              const fileName = inputFile.name.replace(/\.geojson$/, '_referenced.geojson');
              const a = document.createElement('a');
              a.download = fileName;
              a.href = URL.createObjectURL(blob);
              a.dataset.downloadurl = [fileType, a.download, a.href].join(':');
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(function() { URL.revokeObjectURL(a.href); }, 1500);
            }}>GeoJSONダウンロード</button>
          </div>
        </GeoloniaMap.Control>
      </GeoloniaMap>
      <div className='map-ctrl-query'>
        <form 
          className='btn-form-group'
          onSubmit={onImportOGR2OGRFlags}
        >
          <span><pre>ogr2ogr</pre></span>
          <input 
            type='text' 
            name='ogr2ogr-cmdline'
            ref={ogr2ogrFlagsRef}
            onFocus={(e) => e.currentTarget.select()}
          />
          <span><pre>&lt;output.geojson&gt; &lt;input.geojson&gt;</pre></span>
          <button type='submit'>適用</button>
        </form>
      </div>
    </div>
  )
}

export default App
