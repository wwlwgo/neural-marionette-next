/* Same local Tasks Vision runtime as V2; the body model is separate. */
self.exports = {};
const asset = path => new URL(path, self.location.href).href;
importScripts(asset('vendor/vision_bundle.js'));
let tracker;
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try {
      const files = await self.exports.FilesetResolver.forVisionTasks(asset('wasm'));
      tracker = await self.exports.PoseLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: asset('models/pose_landmarker_lite.task'), delegate: 'CPU'},
        runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: .5,
        minPosePresenceConfidence: .5, minTrackingConfidence: .5
      });
      postMessage({type: 'ready'});
    } catch (error) { postMessage({type: 'error', message: String(error)}); }
  } else if (data.type === 'frame') {
    try {
      const start = performance.now();
      const result = tracker.detectForVideo(data.bitmap, data.timestamp);
      postMessage({type: 'pose', timestamp: data.timestamp, image: result.landmarks[0], world: result.worldLandmarks[0], ms: performance.now() - start});
    } catch (error) { postMessage({type: 'error', message: String(error)}); }
    finally { data.bitmap.close(); }
  }
};
