# GradeView 前端集成 - 按时间排序功能

## 🎯 功能概述

GradeView前端现已支持两种提交历史查看模式：
1. **按Assignment排序** - 原有模式，按category分类显示
2. **按时间排序** - 新增模式，按submission_time倒序显示

## 📝 修改的文件

### 1. `StudentProfile.js`
- 添加了 `sortMode` state ('assignment' | 'time')
- 添加了ToggleButtonGroup切换UI
- 根据sortMode调用不同的API endpoint
- 在header显示排序模式切换按钮

**关键改动：**
```javascript
const [sortMode, setSortMode] = useState('assignment');

const endpoint = sortMode === 'time' 
  ? `/students/${email}/grades?sort=time`
  : `/students/${email}/grades`;
```

### 2. `studentDataProcessor.js`
- 添加了 `processTimeSortedData()` 函数处理时间排序数据
- 保留了原有的 `processAssignmentSortedData()` 函数
- 主函数 `processStudentData()` 根据sortMode分发处理

**数据格式支持：**
```javascript
// Time-sorted format
{
  sortBy: 'time',
  submissions: [
    {
      category, name, score, maxPoints, percentage,
      submissionTime, lateness, courseName, semester, year
    }
  ]
}

// Assignment-sorted format (original)
{
  "Category": {
    "Assignment Name": {
      student: score,
      max: maxPoints
    }
  }
}
```

### 3. `StudentProfileContent.js`
- 添加了 `formatDate()` 函数格式化时间显示
- 在时间排序模式下显示额外的"Submitted"列
- 显示lateness信息（如果有）
- 标题根据模式显示 "(Sorted by Submission Time)"

**UI增强：**
- 提交时间：Month Day, Year HH:MM format
- Late标记：红色显示，如果lateness不是'00:00:00'
- 响应式列显示

## 🎨 Demo页面

创建了独立的 [demo.html](demo.html) 展示功能：
- 完整的时间/assignment切换UI
- 实时数据加载
- 美观的渐变设计
- 响应式表格

**访问Demo：**
```bash
# 启动demo服务器
cd /home/wes/ACE/GradeView
python3 -m http.server 8080

# 浏览器访问
http://localhost:8080/demo.html
```

## 🔧 使用方法

### React组件使用

```jsx
import StudentProfile from './components/StudentProfile';

// 使用组件
<StudentProfile 
  open={true}
  onClose={handleClose}
  studentEmail="student@berkeley.edu"
  studentName="Student Name"
/>
```

用户可以通过dialog header的切换按钮在两种模式间切换：
- 📁 By Assignment - 原有模式
- ⏱️ By Time - 按提交时间

### API调用

前端自动根据模式调用：
```javascript
// Assignment mode
GET /api/v2/students/:email/grades

// Time mode  
GET /api/v2/students/:email/grades?sort=time
```

## 🎯 特性

### 按时间排序模式
✅ 显示提交时间（精确到分钟）  
✅ 显示late标记和延迟时长  
✅ 按最新提交在前排序  
✅ 显示课程信息（name, semester, year）  
✅ 自动计算总分和百分比  

### 按Assignment排序模式
✅ 保持原有功能不变  
✅ 按category分组  
✅ 兼容Redis数据源  

## 📊 数据统计

所有模式都显示：
- Total Score / Max Points
- Overall Percentage
- Grade (A-F)
- Total Assignments Count

## 🧪 测试

### 后端API测试
```bash
# 时间排序
curl "http://localhost:3001/api/v2/students/jippebraams@berkeley.edu/grades?sort=time"

# Assignment排序
curl "http://localhost:3001/api/v2/students/jippebraams@berkeley.edu/grades"
```

### 前端测试

1. 启动API服务器：
```bash
cd /home/wes/ACE/GradeView/api
PORT=3001 node server.js
```

2. 访问demo页面：
```bash
http://localhost:8080/demo.html
```

3. 测试功能：
   - 点击 "By Assignment" 查看原有模式
   - 点击 "By Time" 查看时间排序模式
   - 验证提交时间显示
   - 检查late标记

## 🎨 UI设计

### 切换按钮
- 位置：Dialog header右侧
- 样式：Material-UI ToggleButtonGroup
- 图标：CategoryIcon (分类) / AccessTimeIcon (时间)
- 响应式：移动端友好

### 表格列
**Assignment模式：**
- #, Category, Assignment, Score, Max, %, Grade

**Time模式：**
- #, Category, Assignment, Score, Max, %, Grade, **Submitted**

### 颜色方案
- A: Green (#4caf50)
- B: Light Green (#8bc34a)
- C: Yellow (#ffc107)
- D: Orange (#ff9800)
- F: Red (#f44336)
- Late: Red (#f44336)

## 📦 依赖

新增Material-UI图标：
- `@mui/icons-material` - AccessTimeIcon, CategoryIcon

已有依赖：
- React 18.2.0
- Material-UI 6.4.6
- Axios 1.8.1

## 🚀 部署

前端更改无需额外配置，构建步骤与原有相同：

```bash
cd /home/wes/ACE/GradeView/website
npm run build
```

## 📝 未来改进

- [ ] 添加日期范围筛选
- [ ] 支持导出时间线视图
- [ ] 添加submission time趋势图表
- [ ] 支持多课程切换
- [ ] 添加搜索/过滤功能
- [ ] 缓存优化
