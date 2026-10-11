# 三模块 MVP 接口协议

v0.2 · 2026-10-11。M3 已实现本文的演出接口，M1/M2 为独立开发契约；M1 → M3 的可运行样例与接入步骤见 [交接协议](M1_M3_HANDOFF.md)。范围见 [产品需求](PRODUCT_SPEC.md)，归属见 [双人计划](PROJECT_STAGES.md)。首版同一前端进程使用组件方法和事件，绘本生成调用服务端；不把每个模块拆成远端服务。

## 1. 数据约定

JSON 数据均带 `schemaVersion: 1`。`revision` 是作品的递增整数；确认后该版本不可原地修改。动作和特效修改创建下一版本，重新排练、确认。`runId` 标识一次演出；重试和重播创建新值。时间戳用 UTC ISO 字符串，动作帧使用相对录入开始的毫秒。

本地资源用稳定 ID；远端媒体使用可访问 URL。临时 blob URL 不写入持久化作品。摄像头、Worker、Three.js 对象和每帧数据不进入故事 JSON。TypeScript 用于描述契约，当前 JavaScript 工程可按同一结构实现运行时校验。

### M1 输出：确认作品

```ts
type SpellRef = { spellId: string; revision: number };
type Vec3 = [number, number, number];
type NodeOrder = 1 | 2 | 3;
type Phase = 'idle' | 'charging' | 'expanded' | 'launched' | 'complete';

type MotionNode = {
  id: string;
  order: NodeOrder;
  label: string;
  semantic: 'start' | 'charge' | 'release'; // 开始、蓄力、释放；不限定具体姿势
  targetPhase: 'charging' | 'expanded' | 'launched';
  sampleId: string;             // IndexedDB稳定键，含轨迹与稳定模板帧
  featureVersion: 'upper-body-v1';
  maxDistance: number;          // 匹配距离阈值，越小越相似
  minConfidence: number;        // 必需关节门槛，支持0.5..1
  holdMs: number;
  transition: 'from-previous';  // 必须先完成上一个节点；节点1从idle开始
  minUpwardDelta?: number;      // 节点3可选；只有要求向上移动时设置，单位为肩宽
};

type SpellDraft = {
  schemaVersion: 1;
  ref: SpellRef;
  status: 'draft' | 'confirmed';
  hero: {
    name: string;
    avatarId: 'antler-guardian-v1';
    referenceImageUrl: string;  // 角色资产图，供绘本参考，不是孩子照片
    palette: string[];          // #RRGGBB
    identityNotes: string;      // 鹿角、轮廓等跨媒介识别特征
  };
  spell: {
    name: string;
    wishText: string;
    effectId: 'energy-orb-v1';
    color: string;
    sizeScale: number;
  };
  motion: {
    coordinateVersion: 'body-relative-v1';
    nodes: [MotionNode, MotionNode, MotionNode];
  };
  rehearsal: { passed: boolean; checkedAt?: string };
  confirmedAt?: string;
};
```

校验要求：三个节点的 order 为 1、2、3且 ID 唯一；阶段依次为 charging、expanded、launched；样本和特征版本可读取；阈值有效；三个模板可区分；若配置 minUpwardDelta，第三节点须有对应上推变化；排练通过后才能 confirmed。颜色和 sizeScale 落在 `energy-orb-v1` 支持范围。元信息存储由 B 管理，样本存储和排练由 A 提供；确认是控制器在两部分校验后执行的一次操作。

### 本地样本与实时姿态：A 内部共享

```ts
type Joint = 'leftShoulder' | 'rightShoulder' | 'leftElbow' |
  'rightElbow' | 'leftWrist' | 'rightWrist' | 'leftHip' | 'rightHip';
type Landmark = { position: Vec3; confidence: number };
type PoseFrame = {
  timestampMs: number;
  joints: Partial<Record<Joint, Landmark>>;
  tracking: 'valid' | 'partial' | 'lost';
};
type MotionSample = {
  schemaVersion: 1;
  sampleId: string;
  coordinateVersion: 'body-relative-v1';
  featureVersion: 'upper-body-v1';
  frames: PoseFrame[];
  templateFrameIndices: number[];
};
```

`body-relative-v1`：以肩中点为原点、肩宽为 1 单位；x 正向是表演者解剖学左侧，y 向上，z 指向表演者前方。A 的适配层显式转换识别输出，不直接假定它与 Three.js 同坐标。归一化使用可信稳定帧，肩宽不足或关键点缺失时不产有效模板。屏幕镜像仅用于展示。avatar 场景坐标与身体模板坐标分开。

模板距离用同一版本的特征计算，阈值通过排练校准。只检查当前节点；追踪丢失清空未完成保持计时，已确认节点不回退。样本回放数据与模板必须属于同一录入版本。

### M2 生成输入：语义摘要

```ts
type StoryRequest = {
  schemaVersion: 1;
  spellRef: SpellRef;
  hero: SpellDraft['hero'];
  spell: SpellDraft['spell'];
  stageMeanings: ['开始', '蓄力', '释放'];
  themeId: 'save-the-moon';
  bodyPageCount: number;       // 5..10，默认5，包含邀请页
  language: 'zh-CN';
  styleId: 'children-picture-book-v1';
};
```

控制器从 confirmed 作品投影出 StoryRequest。服务端不需要 MotionSample、sampleId 或摄像头原视频。愿望表达超过当前特效能力时，在 M1 确认前调整成可演出的描述，不能由生成器擅自改变动作或效果。

### M2 输出：故事清单

```ts
type BookPage = {
  id: string;
  imageUrl: string;
  text: string;
  altText: string;
  autoAdvanceMs?: number;
};
type StoryManifest = {
  schemaVersion: 1;
  storyId: string;
  spellRef: SpellRef;
  themeId: 'save-the-moon';
  bodyPages: BookPage[];
  performanceCue: {
    id: string;
    afterPageId: string;       // 必须是正文最后一页
    prompt: string;
    targetId: 'moon';
    expectedOutcome: 'moon_restored';
  };
  endingPage: BookPage;        // 恰好一页
  assetStatus: 'ready';
};
```

清单必须满足：正文5～10页、页面ID唯一、邀请对应最后一页、一个邀请、一个结局、作品版本一致，所有图片可加载。autoAdvanceMs 到邀请页失效，不能跳过施法。ready 是经过资源检查的状态，前端开演前还需实际预加载；过期 URL 或离线导致加载失败时停留准备页。

### M3 输入与输出

```ts
type PerformanceConfig = {
  schemaVersion: 1;
  runId: string;
  storyId: string;
  cueId: string;
  spellRef: SpellRef;
  avatarId: SpellDraft['hero']['avatarId'];
  motion: SpellDraft['motion'];
  effect: Pick<SpellDraft['spell'], 'effectId' | 'color' | 'sizeScale'>;
  target: { id: 'moon'; expectedOutcome: 'moon_restored' };
};
type PerformanceResult = {
  schemaVersion: 1;
  runId: string;
  storyId: string;
  cueId: string;
  spellRef: SpellRef;
  mode: 'live' | 'demo';
  status: 'completed' | 'cancelled' | 'failed';
  outcome?: 'moon_restored';   // completed时必填
  completedNodeIds: string[];
  finishedAt: string;
  errorCode?: string;
};
```

live/completed 要求三节点按顺序完成且场景确认托举完成；demo/completed 允许打开结局，但显示“示范完成”，不计入真人验收。cancelled/failed 不自动进入结局，返回邀请并显示重试。一个 run 只发出一个终态结果。

## 2. 本地组件调用与事件

```ts
type Unsubscribe = () => void;
type CaptureEvent =
  | { type: 'draftChanged'; draft: SpellDraft }
  | { type: 'rehearsalPassed'; spellRef: SpellRef }
  | { type: 'error'; code: string; message: string; recoverable: boolean };
interface CaptureModule {
  mount(container: HTMLElement, draft: SpellDraft): Promise<void>;
  recordNode(order: NodeOrder): Promise<void>;
  replayNode(order: NodeOrder): Promise<void>;
  rehearse(): Promise<void>;
  getDraft(): SpellDraft;
  subscribe(cb: (event: CaptureEvent) => void): Unsubscribe;
  dispose(): void;
}
type PerformanceEvent =
  | { type: 'ready'; runId: string }
  | { type: 'tracking'; runId: string; state: 'valid' | 'partial' | 'lost' }
  | { type: 'phaseChanged'; runId: string; phase: Phase; nodeId?: string }
  | { type: 'result'; result: PerformanceResult }
  | { type: 'error'; runId: string; code: string; recoverable: boolean };
interface PerformanceModule {
  load(container: HTMLElement, config: PerformanceConfig): Promise<void>;
  start(mode: 'live' | 'demo'): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  cancel(): void;
  reset(config: PerformanceConfig): Promise<void>; // 新runId
  subscribe(cb: (event: PerformanceEvent) => void): Unsubscribe;
  dispose(): void;
}
interface BookPlayer {
  load(container: HTMLElement, manifest: StoryManifest): Promise<void>;
  start(): void;
  pause(): void;
  showInvitation(): void;
  showEnding(result: PerformanceResult): void;
  subscribe(cb: (event: {
    type: 'performanceRequested'; storyId: string; cueId: string;
  }) => void): Unsubscribe;
  dispose(): void;
}
```

A 实现 CaptureModule、PerformanceModule 及共享 PoseTracker；B 实现 BookPlayer 与控制器。摄像头服务由应用持有，注入两个动作组件，组件 dispose 只释放自身订阅；控制器退出体验才关闭共享摄像头。load 仅确认资源就绪，start/live 再检查权限和稳定追踪；未满足时保持邀请等待。

pause 停止释放前节点推进和保持计时；已释放的场景收尾允许继续完成，控制器若暂停整体体验则暂存结果，恢复后再切结局。dispose 取消动画、订阅和异步回调；取消结果先交控制器再销毁。恢复时不使用过期姿态触发节点。

## 3. 绘本服务接口

| 接口 | 请求 | 响应 |
| --- | --- | --- |
| POST `/api/story-jobs` | StoryRequest；`Idempotency-Key` 请求头 | 202：jobId、spellRef、status |
| GET `/api/story-jobs/:jobId` | jobId | queued/generating/ready/failed；进度、错误；ready附manifest |
| POST `/api/story-jobs/:jobId/retry` | 可选 pageId（失败的图片） | 202：同jobId状态重新进入generating |

进度是已完成页数和当前步骤，不伪造准确剩余时间。失败返回 `{code, message, recoverable}`；模型无效输出、图片生成失败和资源不可读分别定位。服务端重新校验模型输出，不能直接将未校验 JSON 标 ready。

幂等键对应同一请求内容；结果未知重试相同键，修改作品或新生成请求换键。部分重试不改变已确认故事语义和作品版本。取消/修改作品后，可忽略旧任务响应；MVP 不要求取消供应商正在执行的请求。

故事资源要有稳定存储或保存到本地素材包，刷新后不能依赖内存 URL。供应商接入细节与鉴权由 B 实现；该协议不预设任何 API key 已配置。

## 4. 控制器的接受规则

1. 确认作品 → 本地保存不可变版本 → 投影 StoryRequest → 创建生成任务。
2. 只接受当前 spellId/revision 对应的任务；旧版本完成可留存，不切换当前页面。
3. 开演前预加载故事资源和舞台资源、检查本地样本；任何缺失均停在准备状态。
4. 到邀请页，生成新 runId，配置中的作品版本/目标与清单一致。
5. 收到 ready 后仍需孩子开始与稳定追踪才能 start/live。
6. result 的 runId、storyId、cueId、spellRef 全部匹配当前轮且未处理，才接受。
7. completed 且 outcome 等于 expectedOutcome 才打开结局；先标记已处理再切页。failed/cancelled 返回邀请。
8. 重试/重播换 runId；重新创作换作品版本并重新准备对应故事。

## 5. 联调样例和错误边界

当前可运行 fixture 为 `m3-fixed-upper-body`、revision 1，三节点 `start/charge/release`，对应 W/T/Y 上半身固定动作。完整 JSON 位于 `fixtures/m3/fixed-upper-body.bundle.json`，可在 m3.html 中导入。effect 为 `energy-orb-v1`，story 为 `moon-book-v1`，cue 为 `moon-help`，outcome 为 `moon_restored`。固定动作只用于替代 M1 联调，不写死在 M3 中。M1 录入后交付自己的新 sampleId 和作品版本，B 补绘本资源。

| 失败 | 谁发现/处理 | 行为 |
| --- | --- | --- |
| 摄像头拒绝或流中断 | A检测，B展示应用入口 | 留在录入/邀请，可重试权限或明确选择示范 |
| 样本缺失、模板版本不兼容 | A | 不开演，回M1重录 |
| 三模板太相似或排练失败 | A | 禁止确认，提示具体节点重录 |
| 生成/图片失败 | B | 保留作品，重试失败任务或单图 |
| 模型清单不合法 | B | 重新生成或修复，不标ready |
| avatar/特效加载失败 | A报告，B协调 | 不进入正式演出，重试资源 |
| 追踪短暂丢失 | A | 保持阶段，恢复后继续，不跳节点 |
| 重复完成或旧run结果 | B | 忽略，结局不重复打开 |
| 新作品生成时旧任务返回 | B | 按作品版本过滤，不覆盖 |

联调优先验证正常链路、跳节点不释放、目标作用后才完成、重复结果只切一次、旧版本忽略、摄像头复用与刷新后资源恢复。规则测试与实际摄像头/图像效果验收分别记录。


## 6. M3 首个实现补充

`src/performance/module.js` 已提供 `PerformanceModule`。构造时注入 `{tracker, sampleStore}`；共享摄像头由应用创建并显式 connect。`load` 不开启相机，`ready` 仅表示样本/舞台就绪；`start(live)` 仍检查稳定追踪。M1/M2 的完整实现状态不由此改变。

样本读取接口为 `sampleStore.get(sampleId)`；本地样本不可覆盖，重录创建新 ID。Body-relative 模板与镜像显示分离。`energy-orb-v1` 的 sizeScale 支持 0.5～1.5。M3 独立试演入口、共享追踪服务、失败语义及真人待验收项见 [M3 实现与联调](M3_IMPLEMENTATION.md)。

向后兼容：已有 schemaVersion 1 的节点语义 `gather/spread/lift` 仍分别映射到开始/蓄力/释放；新 M1 使用 `start/charge/release`。内部阶段 `charging/expanded/launched` 保留，避免已有控制器和场景事件失效。
