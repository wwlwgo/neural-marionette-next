# M3 实时演出：实现与联调

当前范围（2026-10-11 更新）：按用户要求暂停真人动作调优，使用固定 W/T/Y 样本替代 M1，验证 M3 三阶段及其他模块功能。真人准确率留待正式 M1 接入后的整体验收，不阻塞本轮交付。接口见 [M1 → M3 交接协议](M1_M3_HANDOFF.md)。

开发分支：`codex/m3-performance`。独立入口：`http://127.0.0.1:5180/m3.html`。

## 实现范围与来源

1. 舞台：真实鹿角机甲 GLB，能量球跟随模型双手锚点；释放后离手，接触月亮后托举；场景实际到达目标后才返回 `moon_restored`。
2. 身体跟随：本地 MediaPipe Pose Landmarker Lite + Worker；肩肘腕驱动上半身，可见的下肢参与跟随。模板使用人体坐标，镜像仅改变显示。角色保持骨段长度。
3. 模板驱动：读取 M1 的 `MotionSample`，按顺序匹配三个节点，支持保持时间、置信度、上推距离、追踪丢失后恢复。没有把固定动作规则藏在 M3 中。
4. 组件接口：`load/start/pause/resume/cancel/reset/subscribe/dispose`，样本存储与共享追踪服务依赖注入。每轮一个终态结果，重试使用新 runId。

复用 V2 的鹿角机甲资产和资源释放工具。身体映射与骨骼重定向以伙伴提交 `dc467c9` 的 `energy-avatar/src/pose.js`、`guardian.js` 为基础抽取并补充释放逻辑；月亮和球体呈现参考其 effects 原型，完成机制改为场景接触与托举确认。没有修改 V2 的手部控制入口。

新推理资源来自该分支已提交的 Pose Landmarker Lite（5777746 字节）；哈希见 `assets/licenses/m3-model-manifest.json`。复用仓库锁定的 Tasks Vision 0.10.32 bundle/WASM，不使用运行时 CDN。模型来源入口：[MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)，[Web API 指南](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)。鹿角机甲仍为用户提供的 Tripo 生成资产，遵循 `assets/licenses/README.md` 的来源记录。

## B 如何接入

```js
import {PerformanceModule} from './src/performance/module.js';
import {PoseTracker} from './src/motion/pose-tracker.js';
import {IndexedDBSampleStore} from './src/motion/templates.js';

// 应用持有，一个 video、一个 tracker；与 M1 共用。
const tracker = new PoseTracker(cameraVideo);
const sampleStore = new IndexedDBSampleStore();
const performance = new PerformanceModule({tracker, sampleStore});
const unsubscribe = performance.subscribe(event => {
  if (event.type === 'result') {
    // 控制器仍需校验 runId/storyId/cueId/spellRef 并去重。
    // completed + moon_restored 才调用 book.showEnding(event.result)。
    // 暂停整体体验时先暂存结果；demo 要标注“示范完成”。
  }
});
await performance.load(stageContainer, config);
// 用户明确点击连接摄像头时执行；load 不申请相机权限。
await tracker.connect();
// tracker.isStable() 为 true 后启用“开始”按钮。
await performance.start('live');
// await performance.start('demo') 不需要摄像头，结果标记 demo。
// performance.pause(); await performance.resume(); performance.cancel();
// await performance.reset({...config, runId: crypto.randomUUID()});

// 离开 M3：保留共享摄像头供 M1 使用。
performance.dispose();
unsubscribe();
// 只有应用退出体验才调用 tracker.dispose()。
```

`load` 验证配置及样本，加载 GLB，完成后发出 `ready`；缺少样本或模型失败时 reject，并发出 `error`。`start('live')` 在未连接、未稳定或追踪过期时 reject，保持 ready；不自动降级为 demo。

`pause` 清空未完成保持计时，停止新节点。球释放后，收尾允许继续，可能在暂停期间产生成功结果。`resume` 丢弃旧帧；释放前需要稳定追踪。`cancel` 产生一次 cancelled；之后必须 reset 新 run。`dispose` 在正在演出时先发 cancelled，然后停止 RAF、订阅与 WebGL 资源，不关闭共享相机。销毁后的实例不可复用。

## A 内部依赖协议（M1 可以直接复用）

### SampleStore

- `get(sampleId): Promise<MotionSample | undefined>`。M3 只读取。
- 提供 `IndexedDBSampleStore`，数据库 `neural-marionette-motion-v1`，对象仓库 `samples`。
- `put(sample)` 使用 add，已存在的 ID 不覆盖。重录产生新 sampleId，使已确认作品保持不可变。
- 节点引用和样本都使用 `body-relative-v1`、`upper-body-v1`。
- 需要稳定模板帧，肩、肘、腕全部有效。没有要求髋必须可见。
- `energy-orb-v1` 当前 sizeScale 范围为 0.5～1.5，颜色为 #RRGGBB。

### PoseTracker

- `connect(): Promise<void>`，应用在用户点击后调用，模型准备好后申请相机。
- `subscribe(packet => {}): Unsubscribe`。packet.frame 为协议 PoseFrame；可选 points 为内部渲染姿态、image 为预览点线图、fullBody 为下肢可见标记。高频数据不进入故事配置。
- `isStable(now?): boolean`：连续有效至少 350ms，最新帧不超过 250ms。
- `setEnabled(boolean)`：阅读期间暂停推理而不销毁相机。
- `recenter()`：重置显示居中；`mirror` 只改变渲染/预览，不改变模板坐标。
- `stop()` 关闭流和 Worker，允许再次 connect；`dispose()` 再清空订阅。
- 低置信度、缺少关键点、过期帧不会推进动作；上推阶段发生丢失后，以返回时的高度重新建立基准，防止遮挡期间抬手直接触发。

## 独立试演页面

`m3.html` 为 A 的联调入口，不接管 B 的应用首页或绘本 DOM。自动示范、分步按钮和真人演出均通过同一模板匹配和场景完成机制。

默认样本位于 `fixtures/m3/moon-spell.js`，为**合成开发样本**，不是孩子录入或真人验证的结果。`PerformanceModule` 不内置这些样本，应用自行注入样本来源。

支持导入 JSON：`{schemaVersion:1, config:PerformanceConfig, samples:MotionSample[]}`。通过校验后把样本保存到 IndexedDB，刷新后恢复作品引用。导出当前包可供 B 联调；用户自行录制的样本不提交 Git。

分步示范必须依次点击“开始 · W、蓄力 · T、释放 · Y”；直接点击释放不会跳节点。停止示范后可用“再来一次”重置。颜色、大小在开演前调整。示范结束的弹层仅用于显示模块结果，不代表已接入 M2 绘本。

## 自动验证

```sh
npm test
npm run build
npm run dev
# 另一个终端，使用已安装 Python Playwright 的环境：
python3 tests/m3_browser_test.py
python3 tests/v2_browser_test.py
```

`tests/m3-*.test.js` 覆盖模板归一化、顺序、保持、丢失与恢复、配置校验、异步销毁、模式标记、单终态结果、场景接触与托举。浏览器脚本加载真实 GLB，并检查三轮演出、分步输入、暂停/取消、导入刷新、移动布局、真实 Worker/WASM 空白帧推理，以及模拟摄像头到完整 live 路径。

浏览器测试使用浏览器的假摄像头和显式合成关键点；`mode: live` 只表明调用的是 live 接口，**该测试不构成真人验收**。真实 Worker 空白帧只证明模型和推理运行，不能证明人体识别准确率。

## 真人试演（本轮暂停，留待 M1 接入后）

1. 打开 m3.html，先运行示范确认模型和能量球可见。
2. 连接摄像头，肩肘腕进入画面。单侧抬手、屈肘、侧倾，确认角色左右对应、骨骼不持续扭曲。
3. 点击开始，按 M1 配置的开始→蓄力→释放完成一轮。记录哪些姿态难以匹配，必要时使用 M1 录入的个人模板；默认开发模板不能代表个体适配已完成。
4. 蓄力时遮住手再恢复，应停住等待；球释放后离开画面，月亮仍应完成托举。
5. 再做两轮，检查舞台、节点和结果重置。记录系统、浏览器、镜像设置、身高/站位与异常表现。

尚未证明：真人准确率、不同站位的匹配体验、单摄像头深度与遮挡质量、目标机器持续 30 FPS/200ms 反馈。模型大幅动作的装甲穿插可能需要根据真实试演调整蒙皮，不能用自动示范通过替代这些检查。

## 本轮自动验证记录（2026-10-11）

- `npm test`：85 项通过，0 失败（包含原 65 项基线）。
- `npm run build`：通过；仍有既有 Three.js chunk 大小提示。
- `tests/m3_browser_test.py`：真实模型、三轮演出、分步顺序、暂停取消、样本导入/刷新、移动布局、真实 Worker 空白帧推理、合成摄像头 live 链路通过；无页面异常。
- `tests/v2_browser_test.py`：原六动作、模型切换、合成手势与移动布局通过；无页面异常。
- 5181 生产构建烟测：实际 GLB 加载、完整 demo 演出返回 `moon_restored`，无页面异常。
- 真人验收：用户开始试演，反馈待记录。以上自动结果不代表真人准确率已通过。

## 试演反馈修复与完成核对

用户反馈：示范完成提示无法关闭。提交 `d42d552` 增加右上角关闭按钮、Esc 关闭、弹窗内再次演出，并在关闭后恢复键盘焦点。真实浏览器已逐项验证三种操作；关闭保留本轮结果，再次演出产生新 runId。修复后的 85 项测试和构建通过。

四步完成证据：

| 步骤 | 实现与验证 | 尚需人工确认 |
| --- | --- | --- |
| 1 模型与舞台 | 真实 GLB、分步示范、实际接触后托举、单次结果；浏览器三轮通过 | 模型外观和动作观感 |
| 2 身体跟随 | 本地 Worker 真正运行；身体映射、固定骨段、镜像与遮挡测试通过 | 真人左右对应、自然程度、设备帧率 |
| 3 模板驱动 | 自定义模板改变识别结果；顺序、保持、上推和丢失恢复测试通过 | 真人模板适配和误触发情况 |
| 4 组件交付 | 生命周期、共享相机、异步过期结果、销毁和新 runId 验证通过；接入文档已提供 | 与 B 的真实绘本应用联调属于后续整合 |

此前结论：代码与自动验证已交付，真人验收待反馈；当前已按用户最新要求改为固定动作验证，不再要求用户继续本轮真人试演。

后续试演反馈：看完示范后“开始施法”无法点击。根因为入口只接受 ready 状态，示范结束的 finished 状态未提供开始路径，同时追踪未稳定时按钮无解释地禁用。已改为开始时自动创建新一轮；未连接时由点击动作请求摄像头，未稳定时显示可取消的等待，稳定后调用原有 live 接口。没有降低识别阈值或绕过稳定追踪检查。扩展浏览器回归已覆盖示范→真人、新 runId、等待取消及后续进入画面不误启动；补充实测合成输入从等待自动开始、关闭相机取消等待，均通过。

### 聚拢不出球（2026-10-11）

用户已确认机甲可以跟随身体，但第一步未出现小球。检查发现默认合成模板的 IK 选错了肘部弯曲方向，要求手肘向内、抬高；正常垂肘的独立姿态与原模板距离为 0.609，超过 0.3 阈值。改为沿手臂弯曲平面向下、向外选择肘部位置，同一独立姿态距离降至 0.066。保持原识别阈值、动作顺序与持续时间；更新开发样本 ID 至 `dev-moon-1/2/3-v2`，作品 revision 为 2，已导入的个人作品不自动改写。

另在实际渲染中发现小球与胸甲混在一起：能量球现在位于双手骨骼中点沿身体前方 0.22 场景单位处，并使用更不透明、保留所选颜色的材质。页面增加当前动作提示、保持进度，以及「仅跟随、尚未开始施法」的明确提示。

独立的手工人体坐标位于 `tests/fixtures/m3-body-poses.json`，不由演示模板生成。回归验证自然放下双手和提前举手不触发聚拢，正常胸前聚拢→展开→上推可以完成；演示手臂骨段长度仍固定。87 项单元测试、构建及完整浏览器回归通过。浏览器使用假摄像头输入独立人体坐标，截图确认胸前青色小球清晰可见，随后能够完成托月，无页面异常；这仍不代表真人准确率已通过。真人成功出球与完整托月仍需继续试演确认。

## 固定动作替代 M1：本轮交付（2026-10-11）

按用户最新要求，当前默认动作改为 W 形举手开始、T 形平举蓄力、Y 形举高释放，仅读取肩肘腕。三动作是应用注入的固定样本，未写入 M3 识别器；正式 M1 可替换为自己的录入样本。新增 `start/charge/release` 语义并兼容旧语义；第三节点上移条件改为可选，球体大小由流程阶段决定，避免限制正式录入姿态。

交付 [M1 → M3 交接协议](M1_M3_HANDOFF.md)、更新的总接口文档，以及 `fixtures/m3/fixed-upper-body.bundle.json` 可运行样例。页面支持导入后显示对应动作标签、按导入模板演示、恢复固定样例；恢复不删除已保存样本。

最终验证：

- `npm test`：91 项通过，0 失败，包括独立 W/T/Y 坐标、低置信度/单臂/错序、样本替换、非上移释放、JSON 样例一致性和原有模块回归。
- `npm run build`：通过，保留现有 Three.js chunk 大小提示。
- 完整 `tests/m3_browser_test.py`：真实 GLB、三个阶段、三轮重播、暂停恢复/取消/重置、相机等待与关闭、遮挡恢复、实际托月、移动布局、Worker 空白帧推理、样本导入/刷新，以及模拟摄像头 live 路径均通过，无页面异常。
- 导入独立 M1 样本，以胸前收手作为释放动作（省略上移限制），浏览器完整演出成功并返回导入作品的 spellRef；再切回固定样例并刷新成功。
- 中途一次回归被开发页热更新打断；固定代码后重新运行完整回归已通过。截图已检查小球和蓄力球可见。

本轮固定动作下的 M3 功能验证完成。真人识别准确率和正式 M1 录入的适配不列为本轮待用户事项，留待后续模块集成验证。
