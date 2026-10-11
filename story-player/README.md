# 贾维斯动作录入与绘本播放器

横版蜡笔绘本视觉原型：5 页正文、邀请页暂停、独立结局。素材来自 `../story-assets/moon-book-v1/manifest.json`，替换素材包后重新启动即可更新。

## 运行

Node.js 22.12+，在本目录执行：

```sh
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5185/ 。启动时复制清单引用的图片到本项目，不依赖浏览器访问本机文件路径。构建使用 `npm run build`，产物可独立部署。检查使用 `npm test`。

支持上一页、下一页、页码跳转、左右键、自动翻页、全屏和从头阅读。图片按原比例完整显示，文字独立排版。全部正文与结局图片预加载成功才开始阅读。自动翻页默认每页 5.5 秒，并停在邀请页。

## 连接演出

`createBookPlayer(container, { onPerformanceRequested })` 返回 load、start、pause、showInvitation、showEnding、subscribe、dispose。当前 `load` 接收故事清单 URL；适配正式 BookPlayer 契约时可以扩展为接收对象。

传入 `onPerformanceRequested` 后，邀请按钮返回本轮 runId、storyId、cueId、spellRef、mode=live，由应用把这些值和动作配置交给 A 的舞台。应用随后调用 `player.showEnding(result)`。只有匹配本轮、作品版本与目标结果的成功事件会显示结局；失败或取消保留邀请。应用需在真实演出期间隐藏／暂停播放器，在结果返回时恢复；播放器不管理摄像头。

没有演出适配器时显示说明弹窗，只提供明确标记的“示范：查看结局”。保存动作进入绘本后，邀请按钮已接真实 M3 演出：用保存的三个样本依次匹配动作、触发能量球特效、将月亮送回天空。仅上游 M3 的 completed / moon_restored 结果会进入绘本结局。退出或失败回到邀请页，可开启新轮次重试。未录入时“先预览绘本”仍只提供明确标记的示范结局。在线 AI 生成服务尚未接入。

未来生成器只要输出相同的 StoryManifest，即可调用 `load` 替换故事；播放器不判断动作或特效类型。生成语义由 StoryRequest 与能力适配器负责。

## 前置动作录入（M1）

首页默认进入动作录入：打开摄像头 → 开始姿势稳定半秒自动触发 → 一次连续录制 → 三个不同姿势完成并保持释放姿势后自动提取（最长 10 秒，也可提前结束）→ 回放 → 确认保存 → 导出或读绘本。肩、肘、腕都需入镜。摄像头仅在点击按钮后开启，进入绘本时关闭，不保存原始视频或声音。重新录制只需点击一次，然后摆好开始姿势。

实现与来源见 [M1_CAPTURE.md](contracts/M1_CAPTURE.md)。上游协议原文见 [M1_M3_HANDOFF.md](contracts/M1_M3_HANDOFF.md)。默认三维模型及坐标转换沿用上游；身体可驱动全身预览，但当前动作匹配特征只使用上半身六个关节。

`src/capture-model.js` 导出 `buildCapture(frames)`、`saveCapture(capture)`、`getLatestCapture()`、`exportBundle(capture)`。录入器使用上游 PoseTracker 的归一化帧，不使用屏幕点线图坐标。

所有样本 ID 不可变，重录生成新 ID，作品 revision 加一。连续片段独立保存，三个模板经上游 prepareTemplates 原样校验后才允许确认。下载 JSON 为上游 M3SampleBundle（schemaVersion / config / samples）；整段轨迹留在本机，避免误当作 v1 的动态匹配参数。

已通过合成骨骼的提取、顺序匹配、样本持久化/恢复、不可变 ID、事务回滚及绘本流程测试。摄像头的实际识别效果需使用真人在本机验收。

## M3 集成

`src/performance-view.js` 为真实 M3 的页面适配，复用上游 PerformanceModule、PoseTracker 与 GLB 舞台。开始演出后再次打开摄像头，身体稳定入镜即自动开始；界面会展示本次录入的三个骨架参考和匹配进度。每次演出使用绘本邀请的 runId / spellRef，M3 的结果原样回传给播放器校验。退出会销毁舞台和摄像头。

`src/performance-config.js` 适配确认的 bundle 到本轮配置，并拒绝未录入或版本不一致的作品。当前样本从确认 bundle 提供的只读 SampleStore 获取，无需跨端口读 IndexedDB。

集成测试使用真实 M3 匹配器与结果协议、合成身体帧及测试舞台；验证三动作匹配、丢失追踪、成功结局、取消重试和版本检查。`/tests/m3-smoke.html` 仅为开发验收入口，使用固定测试样本检查真实 WebGL 舞台加载，不计为孩子录制的作品，也不进入正式首页流程。
