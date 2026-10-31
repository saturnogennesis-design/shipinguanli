# 新Codex账号的开发环境恢复

旧账号的聊天、个人记忆、云环境实例、GitHub授权与凭据不会因为切换账号而自动迁移。本仓库交接的是代码、需求和可复现步骤，环境需要在新账号下重新创建或配置。不要复制认证目录、Cookie、密钥或完整环境变量。

## 选择正确仓库与版本

新Codex账号连接有权限访问saturnogennesis-design/shipinguanli的GitHub身份，选择codex/cross-production-and-visibility-20261030分支最新提交；不要默认使用main。按新界面实际提供的仓库／分支或检出能力选择，不假定两个Codex账号共享环境实例。

先读AGENTS.md和Codex接手说明.md。只做开发环境恢复时不运行Windows部署脚本。

## 所需工具

项目声明Node>=22.13、pnpm11.19.0；旧云端实际验证环境为Node24.19.0、pnpm11.25.0。新云端建议使用Node24以运行包含node:module.registerHooks的回归脚本，安装依赖按lockfile，优先项目声明的pnpm版本，版本差异需验证。

需要旧版文档预览时，开发环境另需LibreOffice。旧环境可执行包装器/workspace/tools/libreoffice/soffice仅是本实例路径，不能假设新环境存在；安装或提供新实例实际可执行路径，再设置ORBIT_OFFICE_EXECUTABLE。

浏览器验收使用Python的Playwright及/usr/bin/chromium；这些不是npm依赖。新环境需要分别检查和配置，路径以实际机器为准。完整视频验收可用ffmpeg生成合成MP4。

旧node_modules、pnpm缓存、浏览器、LibreOffice二进制及dist是可再生文件，不作为账号记忆或Git代码迁移。新会话确认用户授权后在开发副本安装／构建，不在公司正式目录操作。

## 基础恢复命令示例

以下在新环境检出的仓库根目录运行，路径按实际检出位置调整：

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit --incremental false
pnpm run build
pnpm run test:production
```

启动前必须设置两个独立临时路径，否则应用可能使用默认data目录并自动执行升级：

```sh
export ORBIT_DB_PATH=/workspace/qa-new-account/release.sqlite
export ORBIT_MEDIA_DIR=/workspace/qa-new-account/media
# 仅在已确认安装后的实际路径配置：
# export ORBIT_OFFICE_EXECUTABLE=/usr/bin/libreoffice
pnpm start --hostname 127.0.0.1 --port 3100
```

仅给临时服务初始化hjt合成账号，不导入或替换正式数据。第一次连接临时数据库自动应用SQL是开发验收的一部分，不等于获准迁移正式数据。

## 完整接口／浏览器验收的额外准备

已有脚本除仓库内fixtures外，还使用旧云端生成的合成文件；它们不在Git中，不能声称拉代码就已经全套可运行：

- /workspace/qa-projects/sample.mp4：合成有效短视频。
- /workspace/qa-office/results/daily-word.pdf：合成有效PDF。可由仓库tests/fixtures/office/daily-word.doc通过本地LibreOffice导出。
- /workspace/qa-v321：部分生产流程测试固定写入该目录的状态、ZIP和截图；先创建目录。state.json包含临时测试会话Cookie，不得提交或分享。
- tests/fixtures/office下的doc／xls已在Git内。新版docx／xlsx与其他运行时文件按需要另行生成。

视频可在已安装ffmpeg时用测试色块生成，PDF可在已安装LibreOffice时从合成Word转换；先检查工具可用性，不启动公司Update.cmd或安装脚本代替这些准备。

在同一全新临时服务上按顺序验收，某些脚本使用固定测试用户名，不要重复对有旧数据的数据库初始化：

```sh
mkdir -p /workspace/qa-v321
export ORBIT_E2E_BASE_URL=http://127.0.0.1:3100
export ORBIT_QA_STATE_FILE=/workspace/qa-new-account/legacy-state.json
export ORBIT_QA_VIDEO=/workspace/qa-projects/sample.mp4
node tests/projects.e2e.mjs
ORBIT_QA_EXISTING_STATE=/workspace/qa-new-account/legacy-state.json node tests/production-projects.e2e.mjs
node tests/production-files.e2e.mjs
node tests/production-timeline.e2e.mjs
node tests/production-permission-race.e2e.mjs
python tests/production-projects.browser.py
python tests/projects.browser.py
```

浏览器脚本中Chromium路径及部分/workspace固定路径需与新环境一致；如需修改适配，只在开发副本调整。测试Cookie和合成口令不是正式账号，不可作为公司上线数据。

## 旧环境数据如何处理

旧开发副本/workspace/shipinguanli的代码已在Git分支。/workspace/qa-v321*是可重建的临时数据库／文件，/workspace/qa-office、qa-projects及tools也是开发验收产物。它们没有复制到新账号，不是正式系统备份。

恢复功能和验收能力不要求搬运旧测试Cookie或整套旧数据库，优先重建干净测试数据。如果用户另行要求保留某组测试数据，应只导出明确选定的合成文件，排除会话／令牌，检查授权及文件范围后另行交付，不直接打包整个workspace。

本次只增加交接文档，没有重新配置账号或创建新的云环境，也没有运行本文件中的安装／迁移命令。
