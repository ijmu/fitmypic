declare module "pica" {
  type ResizeOptions = { quality?: number; alpha?: boolean };
  type PicaInstance = {
    resize(from: HTMLCanvasElement, to: HTMLCanvasElement, options?: ResizeOptions): Promise<HTMLCanvasElement>;
  };
  export default function pica(options?: { features?: string[] }): PicaInstance;
}
