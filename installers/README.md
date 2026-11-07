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
