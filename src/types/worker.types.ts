export type ExecutionDevice = "webgpu" | "wasm";

export interface ImageInputPayload {
  /** RGBA pixel buffer extracted from Canvas ImageData */
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

export interface MaskOutputPayload {
  /** Single-channel alpha values (0-255), length = width * height */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type WorkerRequestMessage =
  | { type: "init" }
  | {
      type: "process";
      id: string;
      image: ImageInputPayload;
    };

export type WorkerStatus =
  | "initiate"
  | "progress"
  | "done"
  | "ready"
  | "complete"
  | "error";

export type WorkerResponseMessage =
  | {
      status: "initiate";
      name?: string;
      file?: string;
      device?: ExecutionDevice;
    }
  | {
      status: "progress";
      name?: string;
      file?: string;
      progress: number;
      loaded?: number;
      total?: number;
      device?: ExecutionDevice;
    }
  | {
      status: "done";
      name?: string;
      file?: string;
      device?: ExecutionDevice;
    }
  | {
      status: "ready";
      device: ExecutionDevice;
    }
  | {
      status: "complete";
      id: string;
      mask: MaskOutputPayload;
      device: ExecutionDevice;
      durationMs: number;
    }
  | {
      status: "error";
      id?: string;
      error: string;
      device?: ExecutionDevice;
    };
