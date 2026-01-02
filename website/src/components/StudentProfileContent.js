// src/components/StudentProfileContent.js
import React from 'react';
import {
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

/**
 * Shared Student Profile Content Component
 * Used by both the dialog version and the page version
 */
export default function StudentProfileContent({ studentData, getGradeLevel }) {
  if (!studentData) return null;

  const gradeLevel = getGradeLevel(studentData.overallPercentage);

  return (
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
                label={gradeLevel.grade}
                sx={{ 
                  mt: 1,
                  fontSize: '24px',
                  height: '50px',
                  backgroundColor: gradeLevel.color,
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

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Radar Chart */}
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
                  content={({ payload }) => {
                    if (payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <Paper sx={{ p: 1 }}>
                          <Typography variant="body2"><strong>{data.category}</strong></Typography>
                          {payload.map((entry, index) => (
                            <Typography key={index} variant="body2" sx={{ color: entry.color }}>
                              {entry.name}: {entry.value}%
                              {entry.dataKey === 'percentage' && ` (${data.score}/${data.maxPoints})`}
                            </Typography>
                          ))}
                        </Paper>
                      );
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Bar Chart */}
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
                  score: data.total,
                  maxPoints: data.maxPoints,
                }))}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis domain={[0, 100]} />
                <Tooltip 
                  content={({ payload }) => {
                    if (payload && payload.length > 0) {
                      const data = payload[0].payload;
                      return (
                        <Paper sx={{ p: 1 }}>
                          <Typography variant="body2"><strong>{data.category}</strong></Typography>
                          <Typography variant="body2" color="primary">
                            {data.percentage.toFixed(2)}% ({data.score.toFixed(2)}/{data.maxPoints.toFixed(2)})
                          </Typography>
                        </Paper>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="percentage" fill="#1976d2" />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Line Chart */}
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
  );
}
