# GradeView PostgreSQL Integration

## 概述

GradeView现已集成GradeSync的PostgreSQL数据库，支持按提交时间排序查看学生成绩历史，同时保留原有Redis功能。

## 实现的功能

### 1. 数据库Helper (`api/lib/dbHelper.mjs`)

新增PostgreSQL连接和查询功能：

- `getStudentSubmissionsByTime(email, courseId)` - 按提交时间倒序获取学生所有提交记录
- `getStudentSubmissionsGrouped(email, courseId)` - 按category分组的提交记录（类似Redis格式）
- `studentExistsInDb(email)` - 检查学生是否存在于数据库

### 2. API端点扩展 (`api/v2/Routes/students/grades/index.js`)

`GET /api/v2/students/:email/grades` 现在支持以下查询参数：

#### 参数说明

- `sort` (可选):
  - 不设置或 `assignment`: 默认行为，从Redis按assignment分类排序
  - `time`: 从数据库按submission_time倒序排序

- `format` (可选):
  - 不设置: 默认格式
  - `db`: 从数据库获取grouped格式（包含submissionTime）

#### 使用示例

```bash
# 1. 按提交时间排序（新功能）
GET /api/v2/students/student@berkeley.edu/grades?sort=time

返回格式:
{
  "sortBy": "time",
  "submissions": [
    {
      "category": "Projects",
      "name": "Project 5",
      "score": 50,
      "maxPoints": 50,
      "percentage": 100,
      "submissionTime": "2025-12-16T00:03:32.000Z",
      "lateness": "160:04:32",
      "courseName": "CS10",
      "semester": "Fall",
      "year": "2025"
    },
    ...
  ]
}

# 2. 默认按assignment分类（保持兼容）
GET /api/v2/students/student@berkeley.edu/grades

返回Redis格式 (原有行为)

# 3. 数据库grouped格式
GET /api/v2/students/student@berkeley.edu/grades?format=db

返回按category分组，包含submissionTime
```

## 配置

### 环境变量

在 `/home/wes/ACE/GradeView/api/.env` 添加：

```bash
GRADESYNC_DATABASE_URL=postgresql://gradesync:changeme@localhost:5432/gradesync
```

### 依赖

已安装 `pg` (PostgreSQL client for Node.js)

## 数据状态

- ✅ Submission time 解析成功率: **100%** (7373/7373 条记录)
- ✅ 数据库包含: 205 students, 99 assignments
- ✅ 所有submission都有准确的提交时间戳

## 兼容性

- ✅ 完全保留原有Redis逻辑
- ✅ 默认行为不变（使用Redis）
- ✅ 新功能通过查询参数启用
- ✅ Redis和PostgreSQL独立运行

## 测试

运行测试脚本:
```bash
./test_db_integration.sh
```

或手动测试:
```bash
# 启动服务器
cd /home/wes/ACE/GradeView/api
PORT=3001 node server.js

# 测试按时间排序
curl "http://localhost:3001/api/v2/students/jippebraams@berkeley.edu/grades?sort=time"

# 测试默认模式
curl "http://localhost:3001/api/v2/students/jippebraams@berkeley.edu/grades"

# 测试DB格式
curl "http://localhost:3001/api/v2/students/jippebraams@berkeley.edu/grades?format=db"
```

## 下一步建议

1. **前端集成**: 在StudentProfileContent组件添加"Sort by Time"开关
2. **缓存优化**: 考虑添加Redis缓存DB查询结果
3. **课程过滤**: 支持按courseId过滤（当有多个课程时）
4. **错误处理**: 添加更详细的错误信息和fallback逻辑
5. **性能监控**: 记录DB查询性能指标
