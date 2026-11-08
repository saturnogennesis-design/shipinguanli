# V3.28.0主机 / 员工端1.3.0（测试版）

- [主机3.28.0安装／更新](OrbitVideoSetup-v3.28.0.zip?raw=1) · [SHA-256](OrbitVideoSetup-v3.28.0.zip.sha256)
- [Windows员工端1.3.0](OrbitEmployee-v1.3.0.zip?raw=1) · [SHA-256](OrbitEmployee-v1.3.0.zip.sha256)
- [Mac Apple芯片员工端1.3.0](OrbitEmployee-Mac-arm64-v1.3.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-arm64-v1.3.0.zip.sha256)
- [Mac Intel员工端1.3.0](OrbitEmployee-Mac-x64-v1.3.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-x64-v1.3.0.zip.sha256)

先备份主机数据库和媒体，再更新主机3.28（Update.cmd），随后更新员工端1.3（Windows UpdateEmployee.cmd，Mac UpdateEmployee.command；首次使用InstallEmployee入口）。更新保留员工data与未同步文件，无新增数据库迁移。主机继续原网页版；首次需在线完成页面缓存。Mac要求13.5以上，按芯片选择。

本版更新：线索列表／卡片重排，名称、紧急程度和领取人优先，低频操作收进更多；跨境及通用详情返回区吸顶；新进入页面获取最新数据，沿来源返回保留筛选、分页、滚动与完整详情正文。员工端主动探测主机、已同步编号读最新记录，未同步工作不被覆盖。

源代码：`cf6f4c8c03d02a8ef38b7b01e96d2321ce410d74`。139项回归、35项同步接口及42项浏览器检查通过，生产构建、TypeScript、定向ESLint通过。Windows／Mac实机安装尚未验证，先选一台试用。未部署、未合并默认分支。详见包内《V3.28-线索布局与返回刷新验收.md》。

[测试数据列表预览](../docs/screenshots/v3.28-clue-list.png) · [卡片预览](../docs/screenshots/v3.28-clue-cards.png) · [窄屏预览](../docs/screenshots/v3.28-clue-narrow.png)

`OrbitVideoSetup-v3.28.0.zip`：`8b8afa021fb3ff3ffbc00d078872953a1f41be1e120fa31a2d08ec643fdd2db9`

`OrbitEmployee-v1.3.0.zip`：`4abb4653b77c6b0feb34a577832f39f300797ad2c8f3b4a7e7044814fd9b2f13`

`OrbitEmployee-Mac-arm64-v1.3.0.zip`：`83789cfc05bd482d5d5cb85eb789ab4e61746175aac4de1a07912c25a0127083`

`OrbitEmployee-Mac-x64-v1.3.0.zip`：`370f6c50c84ca282afbbff99b161990d89fec48ce7d7042c4d092111a1861324`

---

以下为旧版历史记录，当前使用上面的3.28／1.3版本。

# V3.27.0主机 / 员工端1.2.0（测试版）

- [主机3.27.0安装／更新](OrbitVideoSetup-v3.27.0.zip?raw=1) · [SHA-256](OrbitVideoSetup-v3.27.0.zip.sha256)
- [Windows员工端1.2.0](OrbitEmployee-v1.2.0.zip?raw=1) · [SHA-256](OrbitEmployee-v1.2.0.zip.sha256)
- [Mac Apple芯片员工端1.2.0](OrbitEmployee-Mac-arm64-v1.2.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-arm64-v1.2.0.zip.sha256)
- [Mac Intel员工端1.2.0](OrbitEmployee-Mac-x64-v1.2.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-x64-v1.2.0.zip.sha256)

先备份主机数据库和媒体，再更新主机3.27（Update.cmd），然后更新员工端1.2（Windows UpdateEmployee.cmd，Mac UpdateEmployee.command；首次使用InstallEmployee入口）。更新保留员工data与未同步文件。主机继续原网页版，员工首次需在线登录完成缓存。Mac要求13.5以上，按芯片选择。

包含线索领取人／公开待分配、授权分配移交、项目长紧急程度与项目角标、超级管理员业务资料彻底删除、员工每日对账与缺失／截断文件补传。移交不转历史母版；删除有依赖会阻止，不级联；不替代备份，双方未同时在线不能完成传输。

源码：`6ef91d14ee64ae640428ebc239a1d031d3aa43a6`。138项回归、81项权限检查、35项新增业务接口检查、35项同步检查、20项浏览器检查通过，生产构建及类型检查通过。Windows／Mac实机安装与性能尚未验收，先选一台试用。未部署、未合并默认分支。详见包内《V3.27-线索分配删除与每日同步验收.md》。

`OrbitVideoSetup-v3.27.0.zip`：`b8e04355bba0027542f8d337bc573ebab9078c6176db5b45aed3a87cd5dd3061`

`OrbitEmployee-v1.2.0.zip`：`7009453eafffa4694abddf82569c47e0ec383569cf925c15732bd55db4b42a74`

`OrbitEmployee-Mac-arm64-v1.2.0.zip`：`f2c519c98d17366bb605bde870a6b1a9056b9e24bd5a2424dfb2b8abc8e8a2a3`

`OrbitEmployee-Mac-x64-v1.2.0.zip`：`1c39ff1933bc209855d35321c123090e842f86da43de6559c9d861c521295507`

---

以下为旧版历史记录，当前使用上面的3.27／1.2版本。

# V3.26.0 主机与员工端1.1.0（同页无感同步测试版）

- [主机安装／更新](OrbitVideoSetup-v3.26.0.zip?raw=1) · [SHA-256](OrbitVideoSetup-v3.26.0.zip.sha256)
- [Windows员工端](OrbitEmployee-v1.1.0.zip?raw=1) · [SHA-256](OrbitEmployee-v1.1.0.zip.sha256)
- [Mac Apple芯片员工端](OrbitEmployee-Mac-arm64-v1.1.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-arm64-v1.1.0.zip.sha256)
- [Mac Intel员工端](OrbitEmployee-Mac-x64-v1.1.0.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-x64-v1.1.0.zip.sha256)

先备份并更新主机V3.26.0，再更新员工端1.1.0。主机继续原网页版；员工原系统页面正常上传、保存、提交，离线先存本机，恢复连接自动上传并完成原来点击的提交。首次必须在线登录并完成缓存。旧1.0独立工作台要用完整包更新一次。更新保留data，勿删除未同步内容。

Windows运行UpdateEmployee.cmd（首次InstallEmployee.cmd）；Mac运行UpdateEmployee.command（首次InstallEmployee.command），Mac最低13.5，按芯片选择。均自带官方运行环境。主机更新使用Update.cmd。

源代码提交：`3352b19a7bf97d6e37ce4d12d71c371e5ab8ac6a`。128项业务／客户端／安装布局测试、81项权限接口、30项同步接口、12项原页面浏览器检查通过，生产构建及类型检查通过。Windows／Mac实机安装尚未验证；先用一台员工电脑试用。审核及管理等实时操作仍需连接主机。详见包内《V3.26-同页无感同步验收.md》。未部署、未合并默认分支。

`OrbitVideoSetup-v3.26.0.zip`：`d501703184f62220d396788fef0509b86b1e4e72670a99f25645b2779d978aca`

`OrbitEmployee-v1.1.0.zip`：`7be605add936efb052f6965b80a681e90d99504734aeaaa655f0ae847d73a7b9`

`OrbitEmployee-Mac-arm64-v1.1.0.zip`：`07da8f7489428977013ef3a9b728aa44163886545ec6e553475f2f8ccef26d6e`

`OrbitEmployee-Mac-x64-v1.1.0.zip`：`7d1be74d54f165fffaf701ab2ff60e73956221411ca08196ae403e8893715739`

---

以下是旧版历史记录；1.0独立工作台不符合当前同页无感需求，请使用上面的1.1.0。

# V3.25.0 主机支持与员工端1.0.1（Windows测试版）

- [主机安装／更新包](OrbitVideoSetup-v3.25.0.zip?raw=1) · [SHA-256](OrbitVideoSetup-v3.25.0.zip.sha256)
- [员工端安装／更新包](OrbitEmployee-v1.0.1.zip?raw=1) · [SHA-256](OrbitEmployee-v1.0.1.zip.sha256)

先备份并更新主机：已有系统完整解压后运行Update.cmd，首次安装Install.cmd。员工电脑只需员工包：首次InstallEmployee.cmd，后续UpdateEmployee.cmd。主机仍需Node.js >=22.13并在安装阶段联网；员工1.0.1完整包自带官方Node.js 24 LTS Windows x64运行环境，无需另装Node.js。

员工端支持约5GB历史文件缓存、离线新增草稿、上传队列持久化、分块续传、SHA-256完整校验、默认512KB/s限速与用户登录后延迟后台启动。只缓存有权查看的近期正常资料；大图、视频、文档按需保存。未上传文件单独保护，不能自动清理。更新保留本机数据。HTTP局域网使用员工更新包，HTTPS主机支持校验后的自动员工程序更新。

主机新增0045暂存／幂等回执及身份表，不覆盖既有资料，不改变审核流转。详见包内《V3.25-员工离线端与同步验收.md》和员工端README。

主机包源码提交：`f1106ba681d2d7f805306579e824c9f2bd1ecd4f`。

主机包SHA-256：`32cfb0ab5ddec4af8cc00e00bfd54158abf04bb51a5ef8d8e36bfb614b35fcf2`。

员工包SHA-256：`632a66002dd383eba073237e77006e8e8e490ae4a1fb06634512dfe1bf1dfb11`。

14项新增单元、35项接口／断网重启、13项浏览器及97项既有业务回归通过，生产构建与定向静态检查通过。未部署正式系统，未在Windows实机运行安装、开机启动或HTTPS自动更新；先用一两台测试电脑试用。

包内不含数据库、媒体、登录凭证、队列、node_modules或Linux构建产物。未合并默认分支。

员工端1.0.1修复源码：`1e1cfacfeb0590c7c62747fac2288f8766ff424a`。修复无Node.js时安装中止，完整解压并保留runtime文件夹。此前安装失败运行InstallEmployee.cmd；已安装运行UpdateEmployee.cmd，不清空data，主机不需重复更新。PowerShell语法解析、包内及官方运行环境SHA-256、14项员工端单元和定向ESLint通过；Windows实机安装请复测。

## Mac员工端1.0.2（测试版）

- [Apple芯片（M1/M2/M3/M4等）](OrbitEmployee-Mac-arm64-v1.0.2.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-arm64-v1.0.2.zip.sha256)
- [Intel芯片](OrbitEmployee-Mac-x64-v1.0.2.zip?raw=1) · [SHA-256](OrbitEmployee-Mac-x64-v1.0.2.zip.sha256)

需要macOS13.5及以上，自带官方Node.js 24 LTS原生运行环境，不需要另外安装Node.js或Homebrew。完整解压后双击InstallEmployee.command；更新用UpdateEmployee.command。个人Applications提供Orbit Employee，用户级LaunchAgent随登录启动。主机继续用V3.25.0网页版，无需重新更新。

Mac缓存及队列在个人Library/Application Support/OrbitEmployee/data，程序更新保留data。系统安全提示按README-Mac说明确认，不关闭Gatekeeper；测试包尚未Apple公证。4项Mac专用及14项既有客户端测试、脚本语法、官方运行环境及包内校验通过；尚未在Mac实机安装，请先单机试用。

源码提交：`265d575a0c5b7c4490f3c4990e1dfc17e69b2483`。

Mac arm64 SHA-256：`e09f4410ccd3e30aaa3233e62b235aae58004159d54fddb083056fc50e24e72c`。

Mac x64 SHA-256：`a258104802ea3321b3609f35f4549db8ee744cfc9d4774ea9389c1f723f6f937`。
