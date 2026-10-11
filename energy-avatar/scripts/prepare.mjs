import {build} from 'esbuild';
import {cp,mkdir} from 'node:fs/promises';
await mkdir('public/wasm',{recursive:true});
await cp('node_modules/@mediapipe/tasks-vision/wasm','public/wasm',{recursive:true});
// MediaPipe's WASM loader uses importScripts, which needs a classic Worker.
await build({entryPoints:['src/tracker.worker.js'],bundle:true,format:'iife',outfile:'public/tracker.js',minify:true});
