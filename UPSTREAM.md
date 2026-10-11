# 项目来源

本项目以 https://github.com/wwlwgo/neural-marionette 的公开提交 `b708148b9b94ec159807ede52742a8d4a8ecb03e` 中 `neural-marionette-v2/` 为起点，提取为独立仓库。初始化时未导入本地旧 Git 历史、个人录像、手势样本或参考视频。

基础应用版本为 2.0.0。独立项目初始化调整包括：应用移至根目录、包名与页面标记改为 Next、开发端口改为 5180、三个推荐浏览器脚本支持环境变量和 Playwright 默认 Chromium、新增交接文档及 CI。手势算法、模型、动画和运行资源保持基础版本内容。

截图为 V2 基线的摄像头关闭画面，唯一展示图片。历史技术文档和 CHANGELOG 保留作参考，可能提到旧端口、旧目录、未公开的本地证据和历史测试结果；新项目安装与交接以 README.md、HANDOFF.md 为准。

资源来源与使用条件见 assets/licenses/README.md，角色哈希见 assets/source/manifest.json。当前没有新增项目级开源许可证，私有协作不代表第三方资源的使用条款发生改变。

初始化依赖审计发现 source-map-js 的索引 source map 拒绝服务问题（GHSA-68fv-2mgg-jv7q），新仓库单独更新兼容补丁锁定版本；原项目依赖未改动。
