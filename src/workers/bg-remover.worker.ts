import {
  AutoModel,
  AutoProcessor,
  env,
  RawImage,
  type PretrainedModelOptions,
  type PretrainedProcessorOptions,
  type ProgressInfo,
} from "@huggingface/transformers";
import type {
  ExecutionDevice,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from "@/types/worker.types";

const MODEL_ID = "briaai/RMBG-1.4";

env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

interface DedicatedWorkerScopeLike {
  postMessage: (message: WorkerResponseMessage, transfer?: Transferable[]) => void;
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerRequestMessage>) => void,
  ) => void;
}

const workerSelf = self as unknown as DedicatedWorkerScopeLike;

type LoadedModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type LoadedProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;

interface ModelPipeline {
  model: LoadedModel;
  processor: LoadedProcessor;
  device: ExecutionDevice;
}

let pipelinePromise: Promise<ModelPipeline> | null = null;
let loadedPipeline: ModelPipeline | null = null;

function postWorkerMessage(
  message: WorkerResponseMessage,
  transfer?: Transferable[],
): void {
  if (transfer && transfer.length > 0) {
    workerSelf.postMessage(message, transfer);
  } else {
    workerSelf.postMessage(message);
  }
}

async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !("gpu" in navigator) || !navigator.gpu) {
      return false;
    }
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

function createProgressHandler(deviceHint: ExecutionDevice) {
  return (info: ProgressInfo): void => {
    if (info.status === "initiate") {
      postWorkerMessage({
        status: "initiate",
        name: info.name,
        file: info.file,
        device: deviceHint,
      });
    } else if (info.status === "progress") {
      postWorkerMessage({
        status: "progress",
        name: info.name,
        file: info.file,
        progress: info.progress,
        loaded: info.loaded,
        total: info.total,
        device: deviceHint,
      });
    } else if (info.status === "done") {
      postWorkerMessage({
        status: "done",
        name: info.name,
        file: info.file,
        device: deviceHint,
      });
    }
  };
}

async function loadModelWithFallback(): Promise<{
  model: LoadedModel;
  device: ExecutionDevice;
}> {
  const hasWebGPU = await detectWebGPU();
  const modelConfig = {
    model_type: "custom",
  } as unknown as PretrainedModelOptions["config"];

  if (hasWebGPU) {
    try {
      const model = await AutoModel.from_pretrained(MODEL_ID, {
        config: modelConfig,
        device: "webgpu",
        progress_callback: createProgressHandler("webgpu"),
      });
      return { model, device: "webgpu" };
    } catch {
      // Fall back to WASM if WebGPU model initialization fails at runtime
    }
  }

  const model = await AutoModel.from_pretrained(MODEL_ID, {
    config: modelConfig,
    device: "wasm",
    progress_callback: createProgressHandler("wasm"),
  });
  return { model, device: "wasm" };
}

async function getModelAndProcessor(): Promise<ModelPipeline> {
  if (loadedPipeline) {
    return loadedPipeline;
  }

  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { model, device } = await loadModelWithFallback();

      const processorConfig = {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 1 / 255,
        size: { width: 1024, height: 1024 },
      } as unknown as PretrainedProcessorOptions["config"];

      const processor = await AutoProcessor.from_pretrained(MODEL_ID, {
        config: processorConfig,
        progress_callback: createProgressHandler(device),
      });

      loadedPipeline = { model, processor, device };
      postWorkerMessage({ status: "ready", device });
      return loadedPipeline;
    })().catch((err) => {
      pipelinePromise = null;
      throw err;
    });
  }

  return pipelinePromise;
}

function extractSingleChannelMask(maskImage: RawImage): Uint8ClampedArray {
  const pixelCount = maskImage.width * maskImage.height;
  const result = new Uint8ClampedArray(pixelCount);

  if (maskImage.channels === 1) {
    result.set(maskImage.data);
    return result;
  }

  const step = maskImage.channels;
  for (let i = 0; i < pixelCount; i++) {
    result[i] = maskImage.data[i * step];
  }
  return result;
}

workerSelf.addEventListener("message", async (event) => {
  const message = event.data;

  if (message.type === "init") {
    try {
      await getModelAndProcessor();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to initialize AI model.";
      postWorkerMessage({
        status: "error",
        error: errorMessage,
      });
    }
    return;
  }

  if (message.type === "process") {
    const { id, image } = message;
    let activeDevice: ExecutionDevice | undefined;

    try {
      const startTime = performance.now();
      const { model, processor, device } = await getModelAndProcessor();
      activeDevice = device;

      const rawImage = new RawImage(
        new Uint8ClampedArray(image.buffer),
        image.width,
        image.height,
        4,
      );

      const { pixel_values } = await processor(rawImage);
      const { output } = await model({ input: pixel_values });

      const maskTensor = output[0].mul(255).to("uint8");
      const maskImage = await RawImage.fromTensor(maskTensor).resize(
        image.width,
        image.height,
      );

      const maskData = extractSingleChannelMask(maskImage);
      const durationMs = Math.round(performance.now() - startTime);

      postWorkerMessage(
        {
          status: "complete",
          id,
          mask: {
            data: maskData,
            width: maskImage.width,
            height: maskImage.height,
          },
          device,
          durationMs,
        },
        [maskData.buffer],
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Background removal failed.";
      postWorkerMessage({
        status: "error",
        id,
        error: errorMessage,
        device: activeDevice,
      });
    }
  }
});
