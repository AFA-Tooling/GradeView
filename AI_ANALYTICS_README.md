# AI Analytics 模块 - MCP集成指南

## 概述

已创建4个AI分析模块的完整前端界面，使用示例数据展示。后续需要集成MCP服务来获取真实数据。

## 模块结构

### 1. 语义化数据侦探 (Natural Language Query Engine)
**文件位置**: `aiAnalytics.jsx` - 第一个Paper组件

**前端功能**:
- 自然语言输入框
- 建议查询选项
- 查询结果显示区域

**需要的MCP接口**:
```javascript
// API调用示例
const response = await mcpService.naturalLanguageQuery({
  query: queryInput,  // 用户输入的自然语言问题
  context: {
    course: currentCourse,
    semester: currentSemester
  }
});

// 期望返回格式
{
  answer: "回答文本",
  data: [...],  // 相关数据
  visualizationType: "table" | "chart" | "list",
  metadata: { ... }
}
```

**数据库查询需求**:
- 学生成绩历史
- 作业提交时间戳
- 题目得分明细
- 班级对比数据

---

### 2. 知识盲点诊断 (Automated Knowledge Gap Discovery)
**文件位置**: `aiAnalytics.jsx` - 第二个Paper组件

**前端显示**:
- 知识点卡片（包含错误率、影响学生数、常见错误）
- 严重程度分级（high/medium/low）
- 详情查看和生成教学建议按钮

**需要的MCP接口**:
```javascript
// API调用
const gaps = await mcpService.analyzeKnowledgeGaps({
  assignmentId: selectedAssignment,
  rubricItems: true  // 需要细粒度的评分项
});

// 期望返回格式
[{
  topic: "知识点名称",
  errorRate: 65,  // 错误率百分比
  affectedStudents: 28,  // 受影响学生数
  commonMistakes: ["错误1", "错误2"],  // AI总结的常见错误
  severity: "high" | "medium" | "low",
  relatedTopics: ["相关知识点"],  // 关联分析
  teachingSuggestions: "教学建议文本"
}]
```

**数据库查询需求**:
- Gradescope的Rubric Items得分
- 学生答题错误模式
- 知识点标签/分类
- 跨题目关联分析

---

### 3. 学生成功预警 (Predictive Student Success Plan)
**文件位置**: `aiAnalytics.jsx` - 第三个Grid组件（左侧）

**前端显示**:
- 风险学生列表（高/中/低风险）
- 风险因素列表
- 成绩趋势指示器
- 生成干预邮件按钮

**需要的MCP接口**:
```javascript
// API调用
const riskStudents = await mcpService.predictStudentRisk({
  timeWindow: 'recent_3_weeks',
  includeHistory: true
});

// 期望返回格式
[{
  studentId: "student_id",
  name: "学生姓名",
  email: "email@example.com",
  riskLevel: "high" | "medium" | "low",
  riskScore: 0.85,  // 0-1的风险分数
  reasons: [
    "连续3次作业延迟提交",
    "分数持续下降15%"
  ],
  currentGrade: 72,
  gradeHistory: [...],  // 历史成绩数组
  trend: -8,  // 趋势变化
  behaviorPatterns: {
    submissionTiming: "last_minute",
    codeRevisionFrequency: "abnormal_high",
    officeHourAttendance: "declining"
  },
  interventionEmail: "AI生成的邮件草稿"
}]
```

**数据库查询需求**:
- 作业提交时间分布
- 成绩变化趋势
- 代码提交/修改记录
- Office Hour参与记录
- 历史风险模型训练数据

---

### 4. 试题质量分析 (Item Analysis & Exam Audit)
**文件位置**: `aiAnalytics.jsx` - 第四个Grid组件（右侧）

**前端显示**:
- 问题卡片（包含平均用时、分值、区分度、难度系数）
- 问题标识（时间分配不合理、区分度过低等）
- 优化建议

**需要的MCP接口**:
```javascript
// API调用
const analysis = await mcpService.analyzeExamQuality({
  examId: selectedExam,
  calculateStatistics: true
});

// 期望返回格式
[{
  questionNumber: 8,
  questionId: "q_id",
  title: "题目标题",
  avgTime: 40,  // 平均完成时间（分钟）
  points: 5,  // 分值
  discrimination: 0.28,  // 区分度（-1到1）
  difficulty: 0.72,  // 难度系数（0到1）
  pointBiserialCorrelation: 0.45,  // 与总分的相关性
  distractor Analysis: {...},  // 选择题选项分析
  issue: "时间分配不合理",
  recommendation: "建议增加分值到10分或降低难度",
  performanceByGroup: {
    topQuartile: { correctRate: 0.85 },
    bottomQuartile: { correctRate: 0.20 }
  }
}]
```

**数据库查询需求**:
- 每道题的完成时间
- 学生得分分布
- 题目与总分的相关性
- 高分/低分段学生的答题情况

---

## 集成步骤

### Step 1: 创建MCP服务连接
在 `website/src/utils/` 下创建 `mcpService.js`:

```javascript
// mcpService.js
import axios from 'axios';

const MCP_BASE_URL = process.env.REACT_APP_MCP_URL || 'http://localhost:3001/mcp';

class MCPService {
  async naturalLanguageQuery(params) {
    const response = await axios.post(`${MCP_BASE_URL}/query`, params);
    return response.data;
  }

  async analyzeKnowledgeGaps(params) {
    const response = await axios.post(`${MCP_BASE_URL}/knowledge-gaps`, params);
    return response.data;
  }

  async predictStudentRisk(params) {
    const response = await axios.post(`${MCP_BASE_URL}/risk-prediction`, params);
    return response.data;
  }

  async analyzeExamQuality(params) {
    const response = await axios.post(`${MCP_BASE_URL}/exam-analysis`, params);
    return response.data;
  }

  async generateInterventionEmail(studentData) {
    const response = await axios.post(`${MCP_BASE_URL}/generate-email`, studentData);
    return response.data;
  }
}

export default new MCPService();
```

### Step 2: 更新aiAnalytics.jsx
将示例数据替换为真实API调用：

```javascript
import mcpService from '../utils/mcpService';

// 在handleQuery函数中
const handleQuery = async () => {
  setQueryLoading(true);
  try {
    const result = await mcpService.naturalLanguageQuery({
      query: queryInput,
      context: { course: 'CS10', semester: 'Fall2024' }
    });
    setQueryResult(result);
  } catch (error) {
    console.error('Query failed:', error);
    // 显示错误提示
  } finally {
    setQueryLoading(false);
  }
};
```

### Step 3: 添加useEffect加载数据
在组件中添加数据加载逻辑：

```javascript
useEffect(() => {
  // 加载知识盲点数据
  loadKnowledgeGaps();
  // 加载风险学生数据
  loadRiskStudents();
  // 加载试题分析数据
  loadExamAnalysis();
}, []);
```

### Step 4: 环境配置
在 `.env` 文件中添加：

```
REACT_APP_MCP_URL=http://your-mcp-server:port/api
```

---

## 数据库Schema建议

### 需要的核心表/集合:

1. **submissions** - 作业提交记录
   - student_id, assignment_id, submission_time, score, max_score
   - code_revisions (JSON) - 代码修改历史
   - time_spent (seconds)

2. **rubric_scores** - 细粒度评分
   - submission_id, rubric_item_id, score, max_score
   - feedback_text

3. **rubric_items** - 评分项定义
   - item_id, assignment_id, description
   - knowledge_tag (知识点标签)

4. **student_behavior** - 学生行为追踪
   - student_id, timestamp, event_type
   - event_data (JSON)

5. **exam_analytics_cache** - 试题分析缓存
   - exam_id, question_id, statistics (JSON)
   - last_updated

---

## UI组件说明

### 当前使用的示例数据变量：
- `suggestedQueries` - 建议查询列表
- `knowledgeGaps` - 知识盲点数据
- `riskStudents` - 风险学生列表
- `examAnalysis` - 试题分析数据

### 需要替换为API调用的地方：
1. `handleQuery()` - 第51行
2. 知识盲点数据加载 - 添加useEffect
3. 风险学生数据加载 - 添加useEffect
4. 试题分析数据加载 - 添加useEffect

---

## 下一步工作

1. **后端MCP服务开发**
   - 设置MCP服务器
   - 实现4个核心API端点
   - 连接Gradescope数据库

2. **数据预处理**
   - 从Gradescope导出历史数据
   - 建立知识点标签体系
   - 训练预测模型

3. **前端集成**
   - 创建mcpService.js
   - 更新aiAnalytics.jsx调用真实API
   - 添加错误处理和加载状态

4. **测试和优化**
   - 测试各模块功能
   - 优化查询性能
   - 调整UI展示

---

## 技术栈
- **前端**: React 18, Material-UI v5
- **后端**: Node.js + Express (建议)
- **MCP**: Model Context Protocol
- **数据库**: PostgreSQL/MongoDB (建议)
- **AI/ML**: OpenAI API / 本地LLM

---

## 联系方式
有问题请查看代码注释或联系开发团队。
