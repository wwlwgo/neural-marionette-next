import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let tracker;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const files=await FilesetResolver.forVisionTasks('/wasm');
      tracker=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/models/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5});
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',message:error.message});}
  }else if(data.type==='frame'){
    try{
      const start=performance.now();
      const result=tracker.detectForVideo(data.bitmap,data.time);
      self.postMessage({type:'pose',image:result.landmarks[0],world:result.worldLandmarks[0],ms:performance.now()-start});
    }catch(error){self.postMessage({type:'error',message:error.message});}
    finally{data.bitmap.close();}
  }
};
