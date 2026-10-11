# M1 → M3 动作交接协议

2026-10-11 · schemaVersion 1。M1 独立实现录入；M3 已实现本文的配置读取、模板匹配、3D 演出和结果回传。本轮使用固定动作替代 M1，自动验证 M3，不安排真人试演。

## 三个阶段与临时动作

| order | semantic | 临时上半身动作 | targetPhase / M3 行为 |
| --- | --- | --- | --- |
| 1 | `start` | W：双肘弯曲、双手举到肩旁 | `charging`：生成小球，半径 0.22 |
| 2 | `charge` | T：双臂向两侧平举，与肩同高 | `expanded`：球变大，半径 0.65 |
| 3 | `release` | Y：双臂向斜上方举高 | `launched`：球离手飞向月亮，接触后托起月亮 |

半径为场景单位，再乘 `effect.sizeScale`。球的位置跟随模型双手中点，保留手掌前方的显示偏移。阶段 3 触发不等于演出成功；只有月亮真正到达目标位置才发 `completed / moon_restored`。

W/T/Y 是联调数据，不是 M3 的内置识别规则。只用双肩、双肘、双腕六个关键点，不要求手指形状或下半身入镜。固定样例连续匹配 250ms 后推进，置信度门槛 0.55，模板距离阈值 0.3。每步必须按序完成，保持上一动作不会跳到下一步。示范和实时输入走同一匹配器。

正式 M1 可以录入其他互相可区分的上半身姿势，依次赋予这三个语义。`start/charge/release` 表示行为，不表示姿态；标签可自定义。M3 首版匹配录入中的稳定姿态片段，不比较一整段运动轨迹的速度或先后细节。未来若需要动态轨迹识别，应新增 featureVersion，不改变现有版本的计算含义。

## M1 交付什么

完整、可导入的开发样例：[fixed-upper-body.bundle.json](../fixtures/m3/fixed-upper-body.bundle.json)。其生成源为 [moon-spell.js](../fixtures/m3/moon-spell.js)。JSON 文件与生成源有一致性回归检查。

逻辑上 M1 交付已确认作品的 `motion`、三个 `MotionSample`、`spellRef` 以及角色/特效配置；应用控制器补齐每次演出的 `runId/storyId/cueId/target`，组成 `PerformanceConfig`。不要求 M1 生成故事 ID 或拥有 M3 舞台。

联调导入包的结构为：

```ts
type M3SampleBundle = {
  schemaVersion: 1;
  config: PerformanceConfig;  // 完整字段见 MODULE_INTERFACES.md
  samples: [MotionSample, MotionSample, MotionSample];
};
type MotionNode = {
  id: string;                // 本作品内唯一，不必等于 semantic
  order: 1 | 2 | 3;
  label: string;
  semantic: 'start' | 'charge' | 'release';
  targetPhase: 'charging' | 'expanded' | 'launched';
  sampleId: string;
  featureVersion: 'upper-body-v1';
  maxDistance: number;        // 0 < 值 <= 1；固定样例 0.3
  minConfidence: number;      // 0.5..1；固定样例 0.55
  holdMs: number;             // 100..5000；固定样例 250
  transition: 'from-previous';
  minUpwardDelta?: number;    // 仅释放节点可配置，正数，单位为肩宽
};
```

节点顺序和 targetPhase 对应上表。`minUpwardDelta` 是额外约束，只在释放动作确实要求向上移动时填写；固定 Y 样例为 0.35。正式录入的释放姿势不向上时省略，不要填 0。已录入的旧 `gather/spread/lift` 语义仍可读取；新 M1 使用 `start/charge/release`。

`MotionSample` 字段：

```ts
type MotionSample = {
  schemaVersion: 1;
  sampleId: string;
  coordinateVersion: 'body-relative-v1';
  featureVersion: 'upper-body-v1';
  frames: PoseFrame[];
  templateFrameIndices: number[];
};
type PoseFrame = {
  timestampMs: number;
  tracking: 'valid' | 'partial' | 'lost';
  joints: Partial<Record<
    'leftShoulder' | 'rightShoulder' | 'leftElbow' | 'rightElbow' |
    'leftWrist' | 'rightWrist' | 'leftHip' | 'rightHip',
    {position: [number, number, number]; confidence: number}
  >>;
};
```

录入帧时间戳从 0 起、非负且严格递增，单位毫秒。`templateFrameIndices` 指向稳定片段中的有效帧，至少一帧；建议取连续多帧。被选模板帧必须含六个可信肩肘腕关节，`tracking: 'valid'`，各置信度达到该节点门槛；髋部可省略。

坐标固定为肩中点原点、肩宽 1 单位，x 向表演者解剖学左侧、y 向上、z 向前。屏幕镜像不改变样本。可直接复用 `src/motion/pose-frame.js` 的 `normalizePose(image, world, timestampMs)`，不要把屏幕像素或 3D 模型骨骼坐标当模板坐标传入。实时 tracker 的时间戳与 `performance.now()` 同一时钟；持久化录入帧再减去录入起点。

`upper-body-v1` 特征依次拼接左肘、右肘、左腕、右腕的 xyz，z 权重 0.55，共 12 项；距离为 12 项差值的均方根。每个样本取所有稳定模板帧的最小距离；当前节点须在阈值内，且不比其他节点距离更大。三个样本任意两组模板帧的最小距离需至少 0.12，否则拒绝加载。M1 录入完成可调用 `prepareTemplates(config, samples)` 提前复用校验，而不是让 M3 开演时才发现不可区分。

## 存储与接入

正式集成通过 `sampleStore.get(sampleId): Promise<MotionSample | undefined>` 读取。M3 不负责录制、编辑或覆盖样本。现成 `IndexedDBSampleStore` 使用数据库 `neural-marionette-motion-v1`、对象仓库 `samples`。`put` 为不可覆盖的新增操作；重录使用新 sampleId，并增加作品 revision。

```js
import {PerformanceModule} from '../src/performance/module.js';
import {IndexedDBSampleStore, prepareTemplates} from '../src/motion/templates.js';

// tracker 由应用创建并管理，可与 M1 共用。draft 已经 M1 确认。
const config = {
  schemaVersion: 1,
  runId: crypto.randomUUID(),
  storyId: manifest.storyId,
  cueId: manifest.performanceCue.id,
  spellRef: draft.ref,
  avatarId: draft.hero.avatarId,
  motion: draft.motion,
  effect: {effectId: draft.spell.effectId, color: draft.spell.color,
           sizeScale: draft.spell.sizeScale},
  target: {id: 'moon', expectedOutcome: 'moon_restored'},
};
prepareTemplates(config, recordedSamples);
const sampleStore = new IndexedDBSampleStore();
// 录入侧保存一次；已保存的不可变 sampleId 不重复 put。
for (const sample of recordedSamples) {
  if (!await sampleStore.get(sample.sampleId)) await sampleStore.put(sample);
}
const performanceModule = new PerformanceModule({tracker, sampleStore});
const unsubscribe = performanceModule.subscribe(event => {
  // ready: 资源已就绪；phaseChanged: 阶段推进；tracking: 追踪状态。
  if (event.type === 'result') controller.acceptPerformanceResult(event.result);
});
await performanceModule.load(stageElement, config);
// 演示无需摄像头：await performanceModule.start('demo');
// 真人入口由用户点击；tracker 已连接且 isStable() 后：
await performanceModule.start('live');
// 离开演出时 performanceModule.dispose(); unsubscribe();
// 不调用 tracker.dispose()，以便共享给 M1。
```

结果带回 `runId/storyId/cueId/spellRef/mode/status/completedNodeIds/finishedAt`，成功另含 `outcome: 'moon_restored'`。控制器验证标识并去重后再推进故事。方法、事件和结果的完整类型见 [MODULE_INTERFACES.md](MODULE_INTERFACES.md)。

缺失样本、不兼容版本、非法参数或不可区分模板会使 load 拒绝并发 `LOAD_FAILED`；追踪不稳定会使 start/live 拒绝并发 `TRACKING_NOT_READY`。追踪丢失清空未完成保持时间，已完成节点保留。取消/失败不触发故事成功；每轮最多一个终态结果，重试换 runId。

## M3 独立验证

`m3.html` 默认载入固定样例；“播放动作示范”可无摄像头自动跑完整流程，“试演设置与联调”有三个分步按钮、JSON 导入导出和“载入固定联调动作”。该按钮不会删除已导入的样本，但将当前页切回固定配置。

自动验证命令：`npm test`、`npm run build`、`python3 tests/m3_browser_test.py`。覆盖独立 W/T/Y 身体坐标输入、错序不释放、低置信度/单臂不触发、丢失恢复、阶段球体大小、接触后托月、暂停取消重置、三轮演出、真实模型和 Worker 加载，以及 M1 样本导入持久化。模拟摄像头的 live 路径结果仍为合成验证；正式 M1 的真人录入适配属于后续集成阶段。
