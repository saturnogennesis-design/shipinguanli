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
