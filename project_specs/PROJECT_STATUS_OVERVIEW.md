# PROJECT_STATUS_OVERVIEW

> **注意**：本文件是数据库的**只读导出视图**。
> **SSOT（单一权威状态源）**是 `.architect/architect.db`（SQLite 数据库）。
> 请勿直接编辑本文件作为状态回写，应通过 DB-first 协议更新数据库。

## 项目概述

本项目已启用 Architect 内核。

## 当前状态

- 状态：初始化完成
- 更新时间：2026-03-11T08:13:27.236Z

## 项目结构

```
.architect/
  architect.db          # SQLite 数据库（SSOT）
  updates/              # SQL 更新脚本

.personal_os/
  memory/
    long.json           # 长期记忆 (v0.17.x)
    mid.json            # 中期记忆 (v0.17.x)
    working.json        # 工作记忆

project_specs/
  PROJECT_STATUS_OVERVIEW.md  # 本文件（只读导出视图）
  tasks/                      # 任务 SPEC 文件
```

## 使用说明

1. 使用 Architect 对话功能进行需求讨论
2. 一键生成任务 SPEC 到 tasks/ 目录
3. 记忆系统自动维护项目上下文
4. 状态更新通过 SQL 脚本写入数据库（SSOT）
