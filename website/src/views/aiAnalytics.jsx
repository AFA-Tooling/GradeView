// src/views/aiAnalytics.jsx
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  LinearProgress,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Search,
  Psychology,
  Warning,
  Assessment,
  Send,
  TrendingUp,
  TrendingDown,
  Help,
  AutoAwesome,
} from '@mui/icons-material';

/**
 * AI Analytics - 4个智能分析模块
 * 1. 语义化数据侦探
 * 2. 知识盲点诊断
 * 3. 学生成功预警
 * 4. 试题质量分析
 */
export default function AIAnalytics() {
  const [queryInput, setQueryInput] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState(null);

  // 示例查询建议
  const suggestedQueries = [
    '找出这学期成绩波动最大的 5 个学生',
    '哪些题目是高分段学生也普遍出错的？',
    '对比班级 A 和班级 B 在递归函数的表现',
    '上周作业平均完成时间是多少？'
  ];

  // 处理自然语言查询
  const handleQuery = () => {
    setQueryLoading(true);
    // TODO: 调用MCP服务处理查询
    setTimeout(() => {
      setQueryResult({
        query: queryInput,
        answer: '这是一个示例回答。实际数据将通过MCP服务获取。',
        data: [
          { name: '张三', score: 85, trend: 'up' },
          { name: '李四', score: 78, trend: 'down' },
        ]
      });
      setQueryLoading(false);
    }, 1500);
  };

  // 示例知识盲点数据
  const knowledgeGaps = [
    {
      topic: '递归函数',
      errorRate: 65,
      affectedStudents: 28,
      commonMistakes: ['基础条件未定义', '递归深度过大', '返回值错误'],
      severity: 'high'
    },
    {
      topic: '内存管理',
      errorRate: 48,
      affectedStudents: 21,
      commonMistakes: ['内存泄漏', '指针使用错误'],
      severity: 'medium'
    },
    {
      topic: '算法复杂度',
      errorRate: 32,
      affectedStudents: 14,
      commonMistakes: ['时间复杂度计算错误'],
      severity: 'low'
    },
  ];

  // 示例风险学生数据
  const riskStudents = [
    {
      name: '张三',
      email: 'zhang@example.com',
      riskLevel: 'high',
      reasons: ['连续3次作业延迟提交', '分数持续下降15%', '最近未参加Office Hour'],
      currentGrade: 72,
      trend: -8,
    },
    {
      name: '李四',
      email: 'li@example.com',
      riskLevel: 'medium',
      reasons: ['提交时间集中在截止前2小时', '代码修改频率异常高'],
      currentGrade: 85,
      trend: -3,
    },
  ];

  // 示例试题分析数据
  const examAnalysis = [
    {
      questionNumber: 8,
      title: '二叉树遍历',
      avgTime: 40,
      points: 5,
      discrimination: 0.28,
      difficulty: 0.72,
      issue: '时间分配不合理',
      recommendation: '建议增加分值到10分或降低难度'
    },
    {
      questionNumber: 3,
      title: '基础语法',
      avgTime: 5,
      points: 10,
      discrimination: 0.12,
      difficulty: 0.95,
      issue: '区分度过低',
      recommendation: '题目过于简单，无法区分学生能力'
    },
  ];

  return (
    <Box sx={{ bgcolor: '#f5f7fa', minHeight: '100vh', p: 4 }}>
      {/* Module 1: 语义化数据侦探 */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 3,
          backgroundColor: 'white',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Search sx={{ fontSize: 32, color: '#4f46e5', mr: 2 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e3a8a' }}>
              语义化数据侦探
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Natural Language Query Engine - 用自然语言查询成绩数据
            </Typography>
          </Box>
        </Box>

        {/* 查询输入 */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            fullWidth
            placeholder="输入你的问题，例如：找出成绩波动最大的学生..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleQuery()}
            disabled={queryLoading}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleQuery}
            disabled={queryLoading || !queryInput}
            startIcon={<Send />}
            sx={{
              bgcolor: '#4f46e5',
              '&:hover': { bgcolor: '#4338ca' },
              textTransform: 'none',
              minWidth: 120
            }}
          >
            查询
          </Button>
        </Box>

        {/* 建议查询 */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
            试试这些问题：
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {suggestedQueries.map((query, idx) => (
              <Chip
                key={idx}
                label={query}
                onClick={() => setQueryInput(query)}
                sx={{
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#eef2ff' }
                }}
              />
            ))}
          </Box>
        </Box>

        {/* 加载中 */}
        {queryLoading && <LinearProgress sx={{ mb: 2 }} />}

        {/* 查询结果 */}
        {queryResult && (
          <Paper sx={{ p: 3, bgcolor: '#f9fafb', borderRadius: 2 }}>
            <Typography variant="subtitle2" color="textSecondary" sx={{ mb: 1 }}>
              回答：
            </Typography>
            <Typography variant="body1" sx={{ mb: 2 }}>
              {queryResult.answer}
            </Typography>
            {/* TODO: 展示具体数据表格或图表 */}
          </Paper>
        )}
      </Paper>

      {/* Module 2: 知识盲点诊断 */}
      <Paper
        elevation={0}
        sx={{
          p: 4,
          mb: 3,
          backgroundColor: 'white',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Psychology sx={{ fontSize: 32, color: '#ec4899', mr: 2 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e3a8a' }}>
              知识盲点诊断
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Automated Knowledge Gap Discovery - 自动识别教学薄弱环节
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={3}>
          {knowledgeGaps.map((gap, idx) => (
            <Grid item xs={12} md={4} key={idx}>
              <Card
                elevation={0}
                sx={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 2,
                  height: '100%',
                  borderLeft: `4px solid ${
                    gap.severity === 'high' ? '#ef4444' :
                    gap.severity === 'medium' ? '#f59e0b' : '#10b981'
                  }`
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {gap.topic}
                    </Typography>
                    <Chip
                      label={`${gap.errorRate}%`}
                      size="small"
                      sx={{
                        bgcolor: `${
                          gap.severity === 'high' ? '#ef444420' :
                          gap.severity === 'medium' ? '#f59e0b20' : '#10b98120'
                        }`,
                        color: gap.severity === 'high' ? '#ef4444' :
                               gap.severity === 'medium' ? '#f59e0b' : '#10b981',
                        fontWeight: 600
                      }}
                    />
                  </Box>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    {gap.affectedStudents} 名学生受影响
                  </Typography>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                    常见错误：
                  </Typography>
                  <List dense>
                    {gap.commonMistakes.map((mistake, i) => (
                      <ListItem key={i} sx={{ py: 0.5 }}>
                        <ListItemText
                          primary={`• ${mistake}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
                <CardActions>
                  <Button size="small" sx={{ textTransform: 'none' }}>
                    查看详情
                  </Button>
                  <Button size="small" sx={{ textTransform: 'none' }}>
                    生成教学建议
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Module 3: 学生成功预警 */}
        <Grid item xs={12} lg={6}>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              backgroundColor: 'white',
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              height: '100%'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Warning sx={{ fontSize: 32, color: '#f59e0b', mr: 2 }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e3a8a' }}>
                  学生成功预警
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Predictive Student Success Plan - 风险学生早期识别
                </Typography>
              </Box>
            </Box>

            {riskStudents.map((student, idx) => (
              <Paper
                key={idx}
                sx={{
                  p: 3,
                  mb: 2,
                  bgcolor: '#fef3c7',
                  border: '1px solid #fbbf24',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {student.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      {student.email}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Chip
                      label={student.riskLevel === 'high' ? '高风险' : '中风险'}
                      size="small"
                      sx={{
                        bgcolor: student.riskLevel === 'high' ? '#ef4444' : '#f59e0b',
                        color: 'white',
                        fontWeight: 600,
                        mb: 0.5
                      }}
                    />
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                      当前: {student.currentGrade}
                      {student.trend < 0 ? (
                        <TrendingDown sx={{ color: '#ef4444', fontSize: 18, ml: 0.5 }} />
                      ) : (
                        <TrendingUp sx={{ color: '#10b981', fontSize: 18, ml: 0.5 }} />
                      )}
                      <span style={{ color: student.trend < 0 ? '#ef4444' : '#10b981' }}>
                        {student.trend > 0 ? '+' : ''}{student.trend}
                      </span>
                    </Typography>
                  </Box>
                </Box>

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  风险因素：
                </Typography>
                <List dense>
                  {student.reasons.map((reason, i) => (
                    <ListItem key={i} sx={{ py: 0 }}>
                      <ListItemText
                        primary={`• ${reason}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                </List>

                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AutoAwesome />}
                    sx={{
                      bgcolor: '#4f46e5',
                      '&:hover': { bgcolor: '#4338ca' },
                      textTransform: 'none'
                    }}
                  >
                    生成干预邮件
                  </Button>
                  <Button size="small" variant="outlined" sx={{ textTransform: 'none' }}>
                    查看详情
                  </Button>
                </Box>
              </Paper>
            ))}

            <Alert severity="info" sx={{ mt: 2 }}>
              共发现 {riskStudents.length} 名需要关注的学生
            </Alert>
          </Paper>
        </Grid>

        {/* Module 4: 试题质量分析 */}
        <Grid item xs={12} lg={6}>
          <Paper
            elevation={0}
            sx={{
              p: 4,
              backgroundColor: 'white',
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              height: '100%'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
              <Assessment sx={{ fontSize: 32, color: '#06b6d4', mr: 2 }} />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 600, color: '#1e3a8a' }}>
                  试题质量分析
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Item Analysis & Exam Audit - 科学评估试卷质量
                </Typography>
              </Box>
            </Box>

            {examAnalysis.map((item, idx) => (
              <Paper
                key={idx}
                sx={{
                  p: 3,
                  mb: 2,
                  bgcolor: '#f0f9ff',
                  border: '1px solid #0ea5e9',
                  borderRadius: 2
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    第 {item.questionNumber} 题: {item.title}
                  </Typography>
                  <Chip
                    icon={<Help />}
                    label={item.issue}
                    size="small"
                    sx={{
                      bgcolor: '#fef3c7',
                      color: '#f59e0b',
                      fontWeight: 600
                    }}
                  />
                </Box>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      平均用时
                    </Typography>
                    <Typography variant="h6">{item.avgTime} 分钟</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      分值
                    </Typography>
                    <Typography variant="h6">{item.points} 分</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      区分度
                    </Typography>
                    <Typography variant="h6">{item.discrimination}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">
                      难度系数
                    </Typography>
                    <Typography variant="h6">{item.difficulty}</Typography>
                  </Grid>
                </Grid>

                <Divider sx={{ my: 2 }} />

                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: '#0ea5e9' }}>
                  💡 优化建议：
                </Typography>
                <Typography variant="body2">
                  {item.recommendation}
                </Typography>
              </Paper>
            ))}

            <Button
              fullWidth
              variant="outlined"
              sx={{
                mt: 2,
                textTransform: 'none',
                borderColor: '#06b6d4',
                color: '#06b6d4',
                '&:hover': {
                  borderColor: '#0891b2',
                  bgcolor: '#f0f9ff'
                }
              }}
            >
              查看完整试卷分析报告
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
