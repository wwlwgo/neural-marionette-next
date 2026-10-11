# 运行资源来源与许可记录

## 鹿角机甲

`public/models/guardian-rigged.glb` 来自本仓库已有的鹿角机甲资产，由用户提供，Tripo v2.5 生成并经 Blender 绑骨。原始资产、许可记录与哈希见仓库根目录的 [assets/licenses/README.md](../../assets/licenses/README.md) 和 `assets/source/manifest.json`。此副本没有新增 MIT、CC0 等授权声明。

## 身体识别模型

`public/models/pose_landmarker_lite.task` 为 Google MediaPipe Pose Landmarker Lite 预训练模型。官方来源：
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

官方说明：https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

这是身体模型，不是手部识别模型。文件校验值见 [资源清单](model-manifest.json)。其使用条件遵循官方资源条款，本项目不将其标为自制或 CC0。

## 软件依赖

- Three.js 0.180.0：MIT，许可见 THREE-LICENSE.txt。
- @mediapipe/tasks-vision 0.10.32：Apache-2.0，npm 包声明为 Apache-2.0，上游许可：https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE 。
- Vite 7.3.7 与 esbuild 0.28.2：开发与构建依赖，许可由安装包提供。

WASM 和 tracker.js 在安装依赖后由 `scripts/prepare.mjs` 从锁定依赖生成，不提交生成副本。应用不上传或录制摄像头画面；本 PR 不包含真人影像或个人动作样本。
