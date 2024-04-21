declare module 'loam' {
  function initialize(loamPrefix?: string, gdalPrefix?: string): void;
  async function open(file: File | { name: string, data: Blob }, sidecars?: string[]): Promise<GDALDataset>;

  class GDALDataset {
    constructor(source, operations);
    async vectorConvert(args: string[]): Promise<GDALDataset>;
    async bytes(): Promise<Uint8Array>;
  }
}
