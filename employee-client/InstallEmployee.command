#!/bin/bash
set -euo pipefail
trap 'status=$?; if [ "$status" -ne 0 ]; then echo "安装未完成。请保留上方错误信息，不要删除已有 data 目录。"; fi; read -r -p "按回车关闭窗口..." _ || true' EXIT
cd "$(dirname "$0")"
if [ "$(/usr/bin/uname -s)" != Darwin ]; then echo '此安装包只能在 Mac 上运行。'; exit 1; fi
os=$(/usr/bin/sw_vers -productVersion)
major=$(echo "$os" | /usr/bin/cut -d. -f1)
minor=$(echo "$os" | /usr/bin/cut -d. -f2)
if [ "$major" -lt 13 ] || { [ "$major" -eq 13 ] && [ "$minor" -lt 5 ]; }; then echo '需要 macOS 13.5 或更高版本。'; exit 1; fi
arch=$(/usr/bin/uname -m)
if [ "$(/usr/sbin/sysctl -in sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then arch=arm64; fi
if [ "$arch" = x86_64 ]; then arch=x64; fi
expected_arch=$(/usr/bin/tr -d '\r\n' < runtime/arch.txt)
if [ "$arch" != "$expected_arch" ]; then echo '芯片类型不匹配，请下载对应的 Apple 芯片或 Intel 安装包。'; exit 1; fi
expected=$(/usr/bin/tr -d '\r\n' < runtime/node.sha256)
actual=$(/usr/bin/shasum -a 256 runtime/node | /usr/bin/awk '{print $1}')
if ! [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || [ "$actual" != "$expected" ]; then echo '运行环境校验失败，请重新下载并完整解压。'; exit 1; fi
/bin/chmod 700 runtime/node
./runtime/node install-mac.mjs "$@"
