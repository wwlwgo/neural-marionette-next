# 贾维斯动作录入与绘本播放器

横版蜡笔绘本视觉原型：5 页正文、邀请页暂停、独立结局。素材来自 `../story-assets/moon-book-v1/manifest.json`，替换素材包后重新启动即可更新。

## 运行

Node.js 22.12+，在本目录执行：

```sh
npm ci
npm run dev
```

浏览器打开 http://127.0.0.1:5185/ 。启动时复制清单引用的图片到本项目，不依赖浏览器访问本机文件路径。构建使用 `npm run build`，产物可独立部署。检查使用 `npm test`。

支持上一页、下一页、页码跳转、左右键、自动翻页、全屏和从头阅读。图片按原比例完整显示，文字独立排版。全部正文与结局图片预加载成功才开始阅读。自动翻页由朗读结束事件驱动，读完后留 0.7 秒再翻页，并停在邀请页。

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

## 自动衔接流程

进入 M1 后自动请求摄像头，稳定姿势触发录入，三个动作提取成功后自动保存。显示 4 秒提示后进入绘本；重录、回放、查看动作卡或导出会取消自动跳转，保留人工调整机会。保存或摄像头失败时提供重试。

绘本进入后默认自动翻页，在邀请页暂停。孩子点击开始施法后，M3 自动连接摄像头，身体稳定入镜即开始，成功后自动进入结局。首次访问的摄像头授权由浏览器弹窗管理，需要用户允许；网页无法代替用户确认权限。

## 绘本朗读

优先播放 Qwen3-TTS 生成的温柔中文女声。当前水彩版前四页使用 1.7B-Base，以我们自己生成的 Serena 合成样本保留音色，通过 `Wordercom/Qwen3-TTS` 的普通 GPU 演示生成；邀请页和结局使用官方 0.6B-CustomVoice 的 Serena。未使用真人声音进行克隆。0.6B 的表现主要取决于预置音色，1.7B-CustomVoice 才支持自然语言风格控制。旧蜡笔版保留已生成的 1.7B-CustomVoice 试听。WAV 保存在对应故事素材包的 `audio/`，随站点一起发布，播放期间不依赖 Hugging Face。实际音频 `ended` 事件触发下一页，不使用估算时长。提供暂停/继续、重听，切页或进入 M3 会取消旧音频，避免过期回调误翻页。

若浏览器限制自动播放，页面提示点击“开始朗读”进行一次解锁。清单中没有音频、`audioText` 与当前文字不一致，或音频文件加载失败时，回退到浏览器中文 speechSynthesis（0.83 倍语速）。朗读失败时停在当前页，不假装读完。

重新生成：`python3 scripts/generate-narration.py`，然后 `npm run prepare-assets`。默认当前水彩版、0.6B，可用 `--book moon-book-v1 --model-size 1.7B` 指定素材包与模型。脚本使用官方公开 [Qwen3-TTS Space](https://huggingface.co/spaces/Qwen/Qwen3-TTS) 的 Gradio API，无需本机 GPU；可用性和配额由演示站决定。修改文字或风格后先删除对应旧 WAV 再运行，脚本默认保留已有录音。`generation.json` 记录模型、声音、指令、各页原文和时长。只发送绘本文字和风格指令，摄像头与动作样本不参与语音生成。未来实时绘本生成器可提供每页 `audioUrl` 和与正文相同的 `audioText`，播放器继续使用相同播放接口。
