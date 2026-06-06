#!/usr/bin/env python3
"""
memory — 结构化项目记忆管理

Usage:
    memory add "pattern" --confidence 9 --source review --tags api,error --files src/api.ts
    memory search "关键词"
    memory list [--confidence-min 7]
    memory check          # 检查引用文件是否存在
    memory prune --stale  # 清理 stale
    memory export --format md
    memory apply --query "api error" --json
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from memory import main

if __name__ == "__main__":
    main()
