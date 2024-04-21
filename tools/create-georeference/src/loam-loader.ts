import loam from "loam";
import loamWorkerURL from "loam/lib/loam-worker.js?url";
const gdalFiles = import.meta.glob(
  '/node_modules/gdal-js/gdal.*',
  { query: 'url', eager: true },
);

function removeLastPathSegment(url: string): string {
  return url.replace(/\/[^/]+$/, '/');
}

const firstGDALFile = Object.values(gdalFiles)[0] as { default: string };

loam.initialize(
  removeLastPathSegment(loamWorkerURL),
  removeLastPathSegment(firstGDALFile.default),
);

export default loam;
