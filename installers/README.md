# V3.25.0 主机支持与员工端1.0.0（Windows测试版）

- [主机安装／更新包](OrbitVideoSetup-v3.25.0.zip?raw=1) · [SHA-256](OrbitVideoSetup-v3.25.0.zip.sha256)
- [员工端安装／更新包](OrbitEmployee-v1.0.0.zip?raw=1) · [SHA-256](OrbitEmployee-v1.0.0.zip.sha256)

先备份并更新主机：已有系统完整解压后运行Update.cmd，首次安装Install.cmd。员工电脑只需员工包：首次InstallEmployee.cmd，后续UpdateEmployee.cmd。两端需Node.js >=22.13；员工包不含Node运行时，主机安装阶段需联网。

员工端支持约5GB历史文件缓存、离线新增草稿、上传队列持久化、分块续传、SHA-256完整校验、默认512KB/s限速与用户登录后延迟后台启动。只缓存有权查看的近期正常资料；大图、视频、文档按需保存。未上传文件单独保护，不能自动清理。更新保留本机数据。HTTP局域网使用员工更新包，HTTPS主机支持校验后的自动员工程序更新。

主机新增0045暂存／幂等回执及身份表，不覆盖既有资料，不改变审核流转。详见包内《V3.25-员工离线端与同步验收.md》和员工端README。

源码提交：`f1106ba681d2d7f805306579e824c9f2bd1ecd4f`。

主机包SHA-256：`32cfb0ab5ddec4af8cc00e00bfd54158abf04bb51a5ef8d8e36bfb614b35fcf2`。

员工包SHA-256：`abe3760c12e50f4b7edbd75e0b368453f6dcccd8816106bc85377f156d2db74b`。

14项新增单元、35项接口／断网重启、13项浏览器及97项既有业务回归通过，生产构建与定向静态检查通过。未部署正式系统，未在Windows实机运行安装、开机启动或HTTPS自动更新；先用一两台测试电脑试用。

包内不含数据库、媒体、登录凭证、队列、node_modules或Linux构建产物。未合并默认分支。
