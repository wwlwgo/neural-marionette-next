import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('../../story-assets/moon-book-watercolor-v1/', import.meta.url));
const target = fileURLToPath(new URL('../public/book/', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
await mkdir(target, { recursive: true });
for (const page of [...manifest.bodyPages, manifest.endingPage]) {
  const resolved = path.resolve(source, page.imageUrl);
  if (!resolved.startsWith(source)) throw new Error('图片路径必须位于素材包内');
  await copyFile(resolved, path.join(target, path.basename(page.imageUrl)));
  page.imageUrl = path.basename(page.imageUrl);
  if(page.audioUrl){
    const audio=path.resolve(source,page.audioUrl);
    if(!audio.startsWith(source))throw new Error('音频路径必须位于素材包内');
    await mkdir(path.join(target,'audio'),{recursive:true});
    await copyFile(audio,path.join(target,'audio',path.basename(audio)));
    page.audioUrl='audio/'+path.basename(audio);
  }
}
await writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2));

const root = fileURLToPath(new URL('../', import.meta.url));
for (const dir of ['wasm','vendor']) await mkdir(path.join(root,'public',dir),{recursive:true});
for (const file of ['vision_wasm_internal.js','vision_wasm_internal.wasm','vision_wasm_nosimd_internal.js','vision_wasm_nosimd_internal.wasm'])
  await copyFile(path.join(root,'node_modules/@mediapipe/tasks-vision/wasm',file),path.join(root,'public/wasm',file));
await copyFile(path.join(root,'node_modules/@mediapipe/tasks-vision/vision_bundle.cjs'),path.join(root,'public/vendor/vision_bundle.js'));
