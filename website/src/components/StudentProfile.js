// src/components/StudentProfile.js
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Grid,
  Divider,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import apiv2 from '../utils/apiv2';

/**
 * StudentProfile Component
 * 显示学生的详细档案信息，包括：
 * - 基本信息
 * - 成绩汇总统计
 * - 各类别作业详细成绩
 * - 成绩趋势图表
 * - 雷达图显示各类别表现
 */
export default function StudentProfile({ open, onClose, studentEmail, studentName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [studentData, setStudentData] = useState(null);

  // 加载学生详细数据
  useEffect(() => {
    if (!open || !studentEmail) {
      setStudentData(null);
      return;
    }

    setLoading(true);
    setError(null);

    // 获取学生的成绩数据 - 正确的 API 端点是 /students/:email/grades
    apiv2.get(`/students/${encodeURIComponent(studentEmail)}/grades`)
      .then(res => {
        const data = res.data;
        setStudentData(processStudentData(data, studentEmail, studentName));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load student profile:', err);
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load student data');
        setLoading(false);
      });
  }, [open, studentEmail, studentName]);

  // 处理学生数据，计算汇总统计
  // API 返回格式: { category: { assignmentName: { student: score, max: maxPoints } } }
  const processStudentData = (data, email, name) => {
    if (!data || Object.keys(data).length === 0) return null;

    const categoriesData = {};
    const assignmentsList = [];
    let totalScore = 0;
    let totalMaxPoints = 0;

    // 按类别组织成绩
    Object.entries(data).forEach(([category, assignments]) => {
      const categoryScores = [];
      let categoryTotal = 0;
      let categoryMax = 0;
      let categoryCount = 0;

      Object.entries(assignments).forEach(([assignmentName, assignmentData]) => {
        const score = parseFloat(assignmentData.student) || 0;
        const maxPoints = parseFloat(assignmentData.max) || 0;
        
        if (maxPoints > 0) {
          categoryScores.push({
            name: assignmentName,
            score: score,
            maxPoints: maxPoints,
            percentage: (score / maxPoints) * 100,
          });
          
          categoryTotal += score;
          categoryMax += maxPoints;
          categoryCount++;

          assignmentsList.push({
            category: category,
            name: assignmentName,
            score: score,
            maxPoints: maxPoints,
            percentage: (score / maxPoints) * 100,
          });
        }
      });

      if (categoryMax > 0) {
        categoriesData[category] = {
          scores: categoryScores,
          total: categoryTotal,
          maxPoints: categoryMax,
          percentage: (categoryTotal / categoryMax) * 100,
          count: categoryCount,
          average: categoryCount > 0 ? categoryTotal / categoryCount : 0,
        };

        totalScore += categoryTotal;
        totalMaxPoints += categoryMax;
      }
    });

    // 计算所有类别的平均百分比
    const categoryPercentages = Object.values(categoriesData).map(d => d.percentage);
    const overallAvg = categoryPercentages.length > 0 
      ? parseFloat((categoryPercentages.reduce((sum, p) => sum + p, 0) / categoryPercentages.length).toFixed(2))
      : 0;

    // 准备雷达图数据
    const radarData = Object.entries(categoriesData).map(([category, data]) => ({
      category: category,
      percentage: parseFloat(data.percentage.toFixed(2)),
      average: overallAvg,
      average: overallAvg,
      fullMark: 100,
    }));

    // 准备趋势图数据（按作业顺序）
    const trendData = assignmentsList.map((a, idx) => ({
      index: idx + 1,
      name: `${a.category}-${a.name}`,
      percentage: a.percentage,
      category: a.category,
    }));

    return {
      email: email,
      name: name,
      totalScore: totalScore,
      totalMaxPoints: totalMaxPoints,
      overallPercentage: totalMaxPoints > 0 ? (totalScore / totalMaxPoints) * 100 : 0,
      categoriesData: categoriesData,
      assignmentsList: assignmentsList,
      radarData: radarData,
      trendData: trendData,
    };
  };

  // 根据百分比返回成绩等级
  const getGradeLevel = (percentage) => {
    if (percentage >= 90) return { grade: 'A', color: '#4caf50' };
    if (percentage >= 80) return { grade: 'B', color: '#8bc34a' };
    if (percentage >= 70) return { grade: 'C', color: '#ffc107' };
    if (percentage >= 60) return { grade: 'D', color: '#ff9800' };
    return { grade: 'F', color: '#f44336' };
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '80vh' }
      }}
    >
      <DialogTitle sx={{ backgroundColor: '#1976d2', color: 'white' }}>
        <Typography variant="h5">Student Profile</Typography>
        {studentName && (
          <Typography variant="subtitle1" sx={{ mt: 1 }}>
            {studentName} ({studentEmail})
          </Typography>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && studentData && (
          <Box>
            {/* Overall Summary */}
            <Paper elevation={2} sx={{ p: 3, mb: 3, backgroundColor: '#f5f5f5' }}>
              <Typography variant="h6" gutterBottom color="primary">
                Overall Summary
              </Typography>
              <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="body2" color="textSecondary">Total Score</Typography>
                    <Typography variant="h4" color="primary">
                      {studentData.totalScore.toFixed(2)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      / {studentData.totalMaxPoints.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="body2" color="textSecondary">Percentage</Typography>
                    <Typography variant="h4" color="secondary">
                      {studentData.overallPercentage.toFixed(2)}%
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="body2" color="textSecondary">Grade</Typography>
                    <Chip 
                      label={getGradeLevel(studentData.overallPercentage).grade}
                      sx={{ 
                        mt: 1,
                        fontSize: '24px',
                        height: '50px',
                        backgroundColor: getGradeLevel(studentData.overallPercentage).color,
                        color: 'white',
                        fontWeight: 'bold'
                      }}
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Box textAlign="center">
                    <Typography variant="body2" color="textSecondary">Total Assignments</Typography>
                    <Typography variant="h4">
                      {studentData.assignmentsList.length}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            {/* Performance by Category */}
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom color="primary">
                Performance by Category
              </Typography>
              <TableContainer sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#e3f2fd' }}>
                      <TableCell><strong>Category</strong></TableCell>
                      <TableCell align="center"><strong>Score</strong></TableCell>
                      <TableCell align="center"><strong>Max</strong></TableCell>
                      <TableCell align="center"><strong>%</strong></TableCell>
                      <TableCell align="center"><strong>Count</strong></TableCell>
                      <TableCell align="center"><strong>Avg</strong></TableCell>
                      <TableCell align="center"><strong>Grade</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(studentData.categoriesData).map(([category, data]) => {
                      const gradeInfo = getGradeLevel(data.percentage);
                      return (
                        <TableRow key={category} hover>
                          <TableCell><strong>{category}</strong></TableCell>
                          <TableCell align="center">{data.total.toFixed(2)}</TableCell>
                          <TableCell align="center">{data.maxPoints.toFixed(2)}</TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={`${data.percentage.toFixed(2)}%`}
                              size="small"
                              sx={{ 
                                backgroundColor: gradeInfo.color,
                                color: 'white',
                                fontWeight: 'bold'
                              }}
                            />
                          </TableCell>
                          <TableCell align="center">{data.count}</TableCell>
                          <TableCell align="center">{data.average.toFixed(2)}</TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={gradeInfo.grade}
                              size="small"
                              sx={{ 
                                backgroundColor: gradeInfo.color,
                                color: 'white'
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>

            {/* 图表区域 */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {/* 雷达图 - 各类别表现 */}
              <Grid item xs={12} md={6}>
                <Paper elevation={2} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom color="primary">
                    Category Performance Radar
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={studentData.radarData}>
                      <PolarGrid stroke="#ccc" />
                      <PolarAngleAxis dataKey="category" tick={{ fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Radar 
                        name="Score %" 
                        dataKey="percentage" 
                        stroke="#1565c0" 
                        strokeWidth={3}
                        fill="#1976d2" 
                        fillOpacity={0.4} 
                        dot={{ r: 5, fill: '#1565c0', strokeWidth: 2, stroke: '#fff' }}
                      />
                      <Radar 
                        name="Average %" 
                        dataKey="average" 
                        stroke="#ef6c00" 
                        strokeWidth={3}
                        strokeDasharray="5 5"
                        fill="#ff9800" 
                        fillOpacity={0.2} 
                        dot={{ r: 4, fill: '#ef6c00', strokeWidth: 2, stroke: '#fff' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '10px' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc' }}
                        formatter={(value) => `${value}%`}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Bar Chart - Category Comparison */}
              <Grid item xs={12} md={6}>
                <Paper elevation={2} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom color="primary">
                    Category Scores Comparison
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart 
                      data={Object.entries(studentData.categoriesData).map(([cat, data]) => ({
                        category: cat,
                        percentage: data.percentage,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" />
                      <YAxis domain={[0, 100]} />
                      <Tooltip />
                      <Bar dataKey="percentage" fill="#1976d2" />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>

              {/* Line Chart - Score Trend */}
              <Grid item xs={12}>
                <Paper elevation={2} sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom color="primary">
                    Score Trend
                  </Typography>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={studentData.trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="index" label={{ value: 'Assignment #', position: 'insideBottom', offset: -5 }} />
                      <YAxis domain={[0, 100]} label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip 
                        content={({ payload }) => {
                          if (payload && payload.length > 0) {
                            const data = payload[0].payload;
                            return (
                              <Paper sx={{ p: 1 }}>
                                <Typography variant="body2">{data.name}</Typography>
                                <Typography variant="body2" color="primary">
                                  {data.percentage.toFixed(2)}%
                                </Typography>
                              </Paper>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="percentage" 
                        stroke="#1976d2" 
                        strokeWidth={2}
                        dot={{ fill: '#1976d2', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            </Grid>

            {/* Detailed Assignment Scores */}
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom color="primary">
                Detailed Assignment Scores
              </Typography>
              <TableContainer sx={{ mt: 2, maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ backgroundColor: '#e3f2fd' }}><strong>#</strong></TableCell>
                      <TableCell sx={{ backgroundColor: '#e3f2fd' }}><strong>Category</strong></TableCell>
                      <TableCell sx={{ backgroundColor: '#e3f2fd' }}><strong>Assignment</strong></TableCell>
                      <TableCell align="center" sx={{ backgroundColor: '#e3f2fd' }}><strong>Score</strong></TableCell>
                      <TableCell align="center" sx={{ backgroundColor: '#e3f2fd' }}><strong>Max</strong></TableCell>
                      <TableCell align="center" sx={{ backgroundColor: '#e3f2fd' }}><strong>%</strong></TableCell>
                      <TableCell align="center" sx={{ backgroundColor: '#e3f2fd' }}><strong>Grade</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {studentData.assignmentsList.map((assignment, idx) => {
                      const gradeInfo = getGradeLevel(assignment.percentage);
                      return (
                        <TableRow key={idx} hover>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell>{assignment.category}</TableCell>
                          <TableCell>{assignment.name}</TableCell>
                          <TableCell align="center">{assignment.score.toFixed(2)}</TableCell>
                          <TableCell align="center">{assignment.maxPoints.toFixed(2)}</TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={`${assignment.percentage.toFixed(2)}%`}
                              size="small"
                              sx={{ 
                                backgroundColor: gradeInfo.color,
                                color: 'white'
                              }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Chip 
                              label={gradeInfo.grade}
                              size="small"
                              sx={{ 
                                backgroundColor: gradeInfo.color,
                                color: 'white'
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
