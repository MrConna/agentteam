#!/usr/bin/env python3
"""
context — 会话级状态持久化

Usage:
    context save --description "xxx" --decisions "d1|d2" --remaining "r1|r2"
    context restore [--id ID]
    context list
    context show [--id ID]
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from context import main

if __name__ == "__main__":
    main()
