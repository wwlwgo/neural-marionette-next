# M1 连续录入与 M3 接口

上游：`wwlwgo/neural-marionette-next` 的 `codex/m3-performance` 分支，提交 `939241a`。该接口尚未合入 main。本地上游工作树在 `/Users/junchichen/Documents/ChatGPT/neural-marionette-m1-capture`，分支 `codex/m1-capture`。

## 数据边界

- 打开摄像头后进入自动准备。开始姿势稳定至少 500 ms 且包含至少 4 个有效帧时自动录制，触发前的稳定片段一起保留，避免漏掉动作 1。
- 整段录入最多 10 秒；三个稳定姿势可提取，且最后姿势保持约 650 ms 时提前自动结束。一次完成后不再自动重复触发，重录需点击按钮。保存 body-relative-v1 的归一化骨骼帧，时间戳相对本次片段起点。
- 提取最早稳定片段为 start、最后稳定片段为 release，二者之间选可区分的稳定片段为 charge。每片段至少 300 ms、连续采样间隔不超过 200 ms，六个必需关节置信度至少 0.55。
- 每个片段单独成为 MotionSample，时间戳从 0 开始，templateFrameIndices 标记稳定帧。全轨迹另存，不混进 v1 模板语义。
- 直接调用上游 prepareTemplates：模板两两最小距离至少 0.12，不满足就提示重录。没有可靠的上推要求时不设置 minUpwardDelta，避免把任意动作硬解释为上推。
- 节点固定 start / charge / release → charging / expanded / launched，保持 featureVersion=upper-body-v1、holdMs=250、maxDistance=0.3。
- 整段及确认配置存入 jarvis-capture-v1；三个样本批量写入上游 neural-marionette-motion-v1 / samples。不同端口不共享 IndexedDB。

## 队友接入

点击“导出给演出模块”会下载标准 M3SampleBundle JSON。M3 应先校验整个 bundle，再把样本放入自己的 SampleStore。每次启动/重试演出必须生成新的 runId，并让 storyId / cueId / spellRef 与当前绘本邀请事件一致。

```js
const { config, samples } = bundle;
prepareTemplates(config, samples);
// 内存适配器同样符合 SampleStore 的 get(sampleId) 接口。
const sampleStore = {
  async get(sampleId) {
    return structuredClone(samples.find(s => s.sampleId === sampleId));
  }
};
const performanceConfig = {
  ...config,
  runId: invitation.runId,
  storyId: invitation.storyId,
  cueId: invitation.cueId,
  spellRef: invitation.spellRef,
};
const module = new PerformanceModule({ tracker, sampleStore });
await module.load(container, performanceConfig);
await module.start('live');
```

上游动态轨迹识别未实现；蓄力特效仍由节点触发。此版本已在 src/main.js 接通 M1 → 绘本 → M3 → 结局。M3 页面适配位于 src/performance-view.js，使用确认 bundle 的只读样本库和本轮邀请 ID；实时成功结果原样交给 BookPlayer 校验，取消或失败回到邀请页。
