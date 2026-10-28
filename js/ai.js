// Funciones con IA que corren 100% en el navegador (gratis, sin servidor).
// Se cargan solo cuando el usuario las usa.

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';
const VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const SEG_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

let asrPromise = null;

/** Transcribe un archivo de audio o video. Devuelve [{start, end, text}] en segundos del archivo. */
export async function transcribe(blob, { language = 'spanish', model = 'onnx-community/whisper-base', onStatus = () => {} } = {}) {
  onStatus('Cargando el modelo de voz (la primera vez descarga unos 80 MB)…');
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline } = await import(TRANSFORMERS_URL);
      const device = navigator.gpu ? 'webgpu' : 'wasm';
      const files = {};
      return pipeline('automatic-speech-recognition', model, {
        device,
        progress_callback: p => {
          if (p.status === 'progress' && p.file) {
            files[p.file] = p.progress || 0;
            const vals = Object.values(files);
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            onStatus(`Descargando modelo… ${Math.round(avg)}%`);
          }
        },
      });
    })();
    asrPromise.catch(() => { asrPromise = null; });
  }
  const asr = await asrPromise;
  onStatus('Leyendo el audio…');
  const buf = await blob.arrayBuffer();
  const ac = new OfflineAudioContext(1, 16000, 16000);
  const decoded = await ac.decodeAudioData(buf);
  const audio = decoded.getChannelData(0);
  onStatus('Transcribiendo… esto puede tardar un poco');
  const out = await asr(audio, { language, task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
  const chunks = (out.chunks || []).map(ch => {
    const [s, e] = ch.timestamp || [0, null];
    return { start: s ?? 0, end: e ?? (s ?? 0) + 2.5, text: (ch.text || '').trim() };
  }).filter(ch => ch.text);
  if (!chunks.length && out.text) chunks.push({ start: 0, end: decoded.duration, text: out.text.trim() });
  return chunks;
}

let segPromise = null;
let lastTs = 0;

/** Crea un segmentador de personas. Devuelve { run(source, w, h) -> Float32Array|null, size } */
export function getSegmenter(onStatus = () => {}) {
  if (!segPromise) {
    segPromise = (async () => {
      onStatus('Cargando el modelo para quitar fondo…');
      const vision = await import(`${VISION_URL}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_URL}/wasm`);
      const make = delegate => vision.ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEG_MODEL, delegate },
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      let seg;
      try { seg = await make('GPU'); } catch (e) { seg = await make('CPU'); }
      onStatus('');
      return {
        run(source) {
          let ts = performance.now();
          if (ts <= lastTs) ts = lastTs + 1;
          lastTs = ts;
          const res = seg.segmentForVideo(source, ts);
          const m = res && res.confidenceMasks && res.confidenceMasks[0];
          if (!m) { res && res.close && res.close(); return null; }
          const data = m.getAsFloat32Array().slice();
          const out = { data, w: m.width, h: m.height };
          res.close && res.close();
          return out;
        },
      };
    })();
    segPromise.catch(() => { segPromise = null; });
  }
  return segPromise;
}
