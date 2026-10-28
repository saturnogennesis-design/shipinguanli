# Windows 内网部署说明

本部署包适用于已经确认的服务器环境：Windows 10 专业版、i5-10400F、16GB 内存、约10名局域网用户，以及可用的 `F:` 媒体盘。

## 部署前准备

1. 将媒体盘连接到服务器电脑，并确认 `F:` 盘可以正常打开。不要使用只对当前登录用户可见的映射网络盘。
2. 确认公司网络在 Windows 中设置为“专用网络”，不要设置为“公用网络”。
3. 安装 Node.js 22 LTS 64位版。安装阶段可以联网；平台本身不会发布到外网。
4. 将整个部署包解压到服务器电脑，例如桌面或下载目录。

## 安装

1. 在开始菜单搜索“PowerShell”，右键选择“以管理员身份运行”。
2. 在 PowerShell 中进入解压目录。
3. 执行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\install.ps1 -InstallDir "D:\OrbitVideoApp" -MediaDir "F:\OrbitVideoMedia"
```

脚本默认执行以下操作：

- 程序安装到 `D:\OrbitVideoApp`；
- 数据库优先放到 `D:\OrbitVideoData\database`，没有D盘时放到C盘；
- 视频和图文文件放到 `F:\OrbitVideoMedia`，安装时自动创建并授予系统服务账号写入权限；
- 每天凌晨2点备份数据库，默认保留最近30份；
- 创建开机自动启动任务；
- 仅允许同一局域网通过 TCP 3000 端口访问。

完成后，打开 `D:\OrbitVideoApp\deployment-info.txt`，里面包含本机地址和局域网地址。先在服务器电脑打开本机地址；如果原数据库仍在 `D:\OrbitVideoData\database`，原账号会继续保留。

## 检查运行状态

以管理员身份运行：

```powershell
D:\OrbitVideoApp\deploy\windows\check-server.ps1
```

出现 `Orbit Video Server is ready.` 表示数据库和文件目录都可以使用。

## 已安装服务器升级

升级不会删除数据库和视频文件。先将新版部署包解压到临时目录，再以管理员身份运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\windows\update.ps1 -InstallDir "D:\OrbitVideoApp"
```

升级脚本会先完整停止计划任务和占用端口的旧进程，再备份数据库、替换程序、重新构建并启动服务；同一服务器只允许一个服务实例。不要把新版文件直接拖入正在运行的安装目录。

如果浏览器提示“无法访问此网站”，先以管理员身份运行：

```powershell
D:\OrbitVideoApp\deploy\windows\check-server.ps1
```

检查脚本会等待服务启动；若仍失败，会直接显示最新错误日志。不要反复手工启动多个 PowerShell 服务窗口。

## 备份

默认每天自动备份数据库。需要手工备份时运行：

```powershell
D:\OrbitVideoApp\deploy\windows\backup.ps1
```

视频完整备份必须准备第二块硬盘或 NAS，不能把备份放在同一块媒体盘。准备好第二个存储位置后，再配置 `BackupDir` 并使用 `-IncludeMedia`。

## 重要规则

- 服务器电脑关机、休眠或断网期间，其他员工无法访问。
- 服务器运行时不要拔出 F: 媒体盘。
- 不要手工移动或改名数据库文件和 `OrbitVideoMedia` 目录。
- 正式录入资料前，先按《部署后测试与验收文档》完成局域网、上传、权限和备份测试。
- 后续升级只替换程序文件并重新构建，不会自动删除数据库和视频文件。
