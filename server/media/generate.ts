import { experimental_generateVideo, generateImage, generateText } from "ai";
import {
  type CallMeta,
  imageCostUsd,
  imageModel,
  isChatImageModel,
  textModel,
  videoCostUsd,
  videoModel,
} from "../models.js";

export interface MediaReference {
  bytes: Uint8Array;
  mediaType: string;
}

export interface GeneratedMedia {
  bytes: Uint8Array;
  mime: string;
  costUsd: number;
}

type Aspect = `${number}:${number}`;

/** One image. Gemini image models answer through chat with an image file; the rest through generateImage. */
export async function generateImageMedia(input: {
  call?: CallMeta;
  prompt: string;
  aspectRatio?: string;
  reference?: MediaReference | null;
  abortSignal?: AbortSignal;
}): Promise<GeneratedMedia> {
  const { prompt, reference, abortSignal } = input;
  const aspect = (input.aspectRatio ?? "1:1") as Aspect;
  const image = await imageModel(input.call);
  const costUsd = image.metered ? 0 : imageCostUsd(image.ref);
  if (isChatImageModel(image.ref)) {
    const chat = await textModel("image", input.call);
    const text = `${prompt}\n\nAspect ratio: ${aspect}. Return exactly one image.`;
    const result = await generateText({
      model: chat.model,
      abortSignal,
      providerOptions: {
        google: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aspect } },
      },
      messages: [
        {
          role: "user",
          content: reference
            ? [
                { type: "text", text },
                { type: "image", image: reference.bytes, mediaType: reference.mediaType },
              ]
            : text,
        },
      ],
    });
    const file = result.files?.find((f) => (f.mediaType ?? "").startsWith("image/"));
    if (!file?.uint8Array?.byteLength) {
      throw new Error("The image model returned no image.");
    }
    return {
      bytes: file.uint8Array,
      mime: file.mediaType ?? "image/png",
      costUsd,
    };
  }
  const result = await generateImage({
    model: image.model,
    n: 1,
    abortSignal,
    prompt: reference ? { images: [reference.bytes], text: prompt } : prompt,
    aspectRatio: aspect,
  });
  const img = result.image ?? result.images?.[0];
  if (!img?.uint8Array?.byteLength) {
    throw new Error("The image model returned no image.");
  }
  return {
    bytes: img.uint8Array,
    mime: img.mediaType ?? "image/png",
    costUsd,
  };
}

/** One video clip. Text-to-video, or image-to-video when a reference is given. */
export async function generateVideoMedia(input: {
  call?: CallMeta;
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  reference?: MediaReference | null;
  abortSignal?: AbortSignal;
}): Promise<GeneratedMedia> {
  const duration = Math.min(Math.max(Math.round(input.duration ?? 8), 4), 10);
  const aspect = (input.aspectRatio === "1:1" ? "16:9" : (input.aspectRatio ?? "16:9")) as Aspect;
  const videoClass = await videoModel(input.call);
  const result = await experimental_generateVideo({
    model: videoClass.model,
    prompt: input.reference ? { image: input.reference.bytes, text: input.prompt } : input.prompt,
    aspectRatio: aspect,
    duration,
    abortSignal: input.abortSignal,
  });
  const video = result.video ?? result.videos?.[0];
  if (!video?.uint8Array?.byteLength) {
    throw new Error("The video model returned no video.");
  }
  return {
    bytes: video.uint8Array,
    mime: video.mediaType ?? "video/mp4",
    costUsd: videoClass.metered ? 0 : videoCostUsd(videoClass.ref, duration),
  };
}
