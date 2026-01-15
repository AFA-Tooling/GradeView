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
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import { Bar as ChartBar, Line as ChartLine, Radar as ChartRadar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Title,
  ChartTooltip,
  ChartLegend
);

/**
 * Shared Student Profile Content Component
 * Used by both the dialog version and the page version
 */
export default function StudentProfileContent({ studentData, getGradeLevel, sortMode = 'assignment' }) {
  if (!studentData) return null;

  const gradeLevel = getGradeLevel(studentData.overallPercentage);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Box>
      {/* Overall Summary */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 4, 
          mb: 3, 
          backgroundColor: 'white',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600, mb: 3 }}>
          Overall Summary
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={3}>
            <Box textAlign="center" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', fontSize: '0.875rem', mb: 1 }}>Total Score</Typography>
              <Typography variant="h4" sx={{ color: '#1e3a8a', fontWeight: 600, mb: 0.5 }}>
                {Math.round(studentData.totalScore)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                / {Math.round(studentData.totalMaxPoints)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box textAlign="center" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', fontSize: '0.875rem', mb: 1 }}>Percentage</Typography>
              <Typography variant="h4" sx={{ color: '#ea580c', fontWeight: 600 }}>
                {studentData.overallPercentage.toFixed(2)}%
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box textAlign="center" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', fontSize: '0.875rem', mb: 1 }}>Grade</Typography>
              <Chip 
                label={gradeLevel.grade}
                sx={{ 
                  mt: 1,
                  fontSize: '1.5rem',
                  height: '56px',
                  minWidth: '56px',
                  backgroundColor: `${gradeLevel.color}20`,
                  color: gradeLevel.color,
                  fontWeight: 700,
                  border: `2px solid ${gradeLevel.color}40`,
                  borderRadius: '12px'
                }}
              />
            </Box>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Box textAlign="center" sx={{ p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', fontSize: '0.875rem', mb: 1 }}>Total Assignments</Typography>
              <Typography variant="h4" sx={{ color: '#1e3a8a', fontWeight: 600 }}>
                {studentData.assignmentsList.length}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Performance by Category */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 4, 
          mb: 3,
          backgroundColor: 'white',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600, mb: 3 }}>
          Performance by Category
        </Typography>
        <TableContainer sx={{ mt: 2, borderRadius: 2, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f9fafb' }}>
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
                    <TableCell align="center">{Math.round(data.total)}</TableCell>
                    <TableCell align="center">{Math.round(data.maxPoints)}</TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={`${data.percentage.toFixed(2)}%`}
                        size="small"
                        sx={{ 
                          backgroundColor: `${gradeInfo.color}20`,
                          color: gradeInfo.color,
                          fontWeight: 600,
                          border: `1px solid ${gradeInfo.color}40`,
                          borderRadius: '8px'
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
                          backgroundColor: `${gradeInfo.color}20`,
                          color: gradeInfo.color,
                          fontWeight: 600,
                          border: `1px solid ${gradeInfo.color}40`,
                          borderRadius: '8px'
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
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3,
              backgroundColor: 'white',
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600 }}>
              Category Performance Radar
            </Typography>
            <Box sx={{ height: 300, position: 'relative' }}>
              <ChartRadar 
                data={{
                  labels: studentData.radarData.map(d => d.category),
                  datasets: [
                    {
                      label: 'Score %',
                      data: studentData.radarData.map(d => d.percentage),
                      borderColor: '#1565c0',
                      backgroundColor: 'rgba(25, 118, 210, 0.4)',
                      borderWidth: 3,
                      pointRadius: 5,
                      pointBackgroundColor: '#1565c0',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                    },
                    {
                      label: 'Average %',
                      data: studentData.radarData.map(d => d.average),
                      borderColor: '#ef6c00',
                      backgroundColor: 'rgba(255, 152, 0, 0.2)',
                      borderWidth: 3,
                      borderDash: [5, 5],
                      pointRadius: 4,
                      pointBackgroundColor: '#ef6c00',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                    }
                  ]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    r: {
                      min: 0,
                      max: 100,
                      beginAtZero: true,
                      ticks: {
                        stepSize: 20,
                        backdropColor: 'transparent'
                      },
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      },
                      angleLines: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      },
                      pointLabels: {
                        font: {
                          size: 12
                        }
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      position: 'bottom',
                      labels: {
                        padding: 10,
                        usePointStyle: true
                      }
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const dataIndex = context.dataIndex;
                          const data = studentData.radarData[dataIndex];
                          if (context.datasetIndex === 0) {
                            return `Score: ${context.parsed.r.toFixed(2)}% (${Math.round(data.score)}/${Math.round(data.maxPoints)})`;
                          } else {
                            return `Average: ${context.parsed.r.toFixed(2)}%`;
                          }
                        }
                      }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Bar Chart */}
        <Grid item xs={12} md={6}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3,
              backgroundColor: 'white',
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600 }}>
              Category Scores Comparison
            </Typography>
            <Box sx={{ height: 300, position: 'relative' }}>
              <ChartBar
                data={{
                  labels: Object.keys(studentData.categoriesData),
                  datasets: [{
                    label: 'Percentage',
                    data: Object.values(studentData.categoriesData).map(d => d.percentage),
                    backgroundColor: '#1976d2',
                    borderColor: '#1565c0',
                    borderWidth: 1,
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      min: 0,
                      max: 100,
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      },
                      ticks: {
                        stepSize: 20
                      },
                      title: {
                        display: true,
                        text: 'Percentage (%)',
                        font: {
                          size: 12
                        }
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      },
                      title: {
                        display: true,
                        text: 'Category',
                        font: {
                          size: 12
                        }
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    },
                    datalabels: {
                      display: false  // Hide labels, show only on hover
                    },
                    tooltip: {
                      callbacks: {
                        label: function(context) {
                          const category = context.label;
                          const data = studentData.categoriesData[category];
                          return `${data.percentage.toFixed(2)}% (${Math.round(data.total)}/${Math.round(data.maxPoints)})`;
                        }
                      }
                    }
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>

        {/* Line Chart */}
        <Grid item xs={12}>
          <Paper 
            elevation={0} 
            sx={{ 
              p: 3,
              backgroundColor: 'white',
              borderRadius: 3,
              border: '1px solid #e5e7eb',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600 }}>
              Score Trend {sortMode === 'time' ? '(Sorted by Submission Time)' : '(Sorted by Assignment)'}
            </Typography>
            <Box sx={{ height: 300, position: 'relative' }}>
              <ChartLine
                data={{
                  labels: studentData.trendData.map(d => d.index),
                  datasets: [{
                    label: 'Percentage',
                    data: studentData.trendData.map(d => d.percentage),
                    borderColor: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#1976d2',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    tension: 0.1,
                    fill: true,
                  }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: {
                    y: {
                      min: 0,
                      max: 100,
                      beginAtZero: true,
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                      },
                      ticks: {
                        stepSize: 20
                      },
                      title: {
                        display: true,
                        text: 'Percentage (%)',
                        font: {
                          size: 12
                        }
                      }
                    },
                    x: {
                      grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                      },
                      title: {
                        display: true,
                        text: sortMode === 'time' ? 'Submission Order' : 'Assignment #',
                        font: {
                          size: 12
                        }
                      }
                    }
                  },
                  plugins: {
                    legend: {
                      display: false
                    },
                    datalabels: {
                      display: false  // Hide labels, show only on hover
                    },
                    tooltip: {
                      callbacks: {
                        title: function(context) {
                          const index = context[0].dataIndex;
                          return studentData.trendData[index].name;
                        },
                        label: function(context) {
                          const index = context.dataIndex;
                          const data = studentData.trendData[index];
                          let label = `Score: ${data.percentage.toFixed(2)}%`;
                          if (sortMode === 'time' && data.submissionTime) {
                            label += `\nSubmitted: ${formatDate(data.submissionTime)}`;
                          }
                          return label;
                        }
                      }
                    }
                  },
                  interaction: {
                    mode: 'index',  // Show tooltip when hovering near any x-position
                    intersect: false,
                    axis: 'x'  // Trigger based on x-axis proximity
                  }
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Detailed Assignment Scores */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 4,
          backgroundColor: 'white',
          borderRadius: 3,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }}
      >
        <Typography variant="h6" gutterBottom sx={{ color: '#1e3a8a', fontWeight: 600, mb: 3 }}>
          Detailed Assignment Scores {sortMode === 'time' && '(Sorted by Submission Time)'}
        </Typography>
        <TableContainer sx={{ mt: 2, maxHeight: 600, borderRadius: 2, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>#</TableCell>
                <TableCell sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Assignment</TableCell>
                <TableCell align="center" sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Score</TableCell>
                <TableCell align="center" sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Max</TableCell>
                <TableCell align="center" sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>%</TableCell>
                <TableCell align="center" sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Grade</TableCell>
                {sortMode === 'time' && (
                  <TableCell align="center" sx={{ backgroundColor: '#f9fafb', fontWeight: 600 }}>Submitted</TableCell>
                )}
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
                    <TableCell align="center">{Math.round(assignment.score)}</TableCell>
                    <TableCell align="center">{Math.round(assignment.maxPoints)}</TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={`${assignment.percentage.toFixed(2)}%`}
                        size="small"
                        sx={{ 
                          backgroundColor: `${gradeInfo.color}20`,
                          color: gradeInfo.color,
                          fontWeight: 600,
                          border: `1px solid ${gradeInfo.color}40`,
                          borderRadius: '8px'
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={gradeInfo.grade}
                        size="small"
                        sx={{ 
                          backgroundColor: `${gradeInfo.color}20`,
                          color: gradeInfo.color,
                          fontWeight: 600,
                          border: `1px solid ${gradeInfo.color}40`,
                          borderRadius: '8px'
                        }}
                      />
                    </TableCell>
                    {sortMode === 'time' && (
                      <TableCell align="center" sx={{ fontSize: '0.875rem' }}>
                        {formatDate(assignment.submissionTime)}
                        {assignment.lateness && assignment.lateness !== '00:00:00' && (
                          <Box component="span" sx={{ display: 'block', color: '#f44336', fontSize: '0.75rem', mt: 0.5 }}>
                            Late: {assignment.lateness}
                          </Box>
                        )}
                      </TableCell>
                    )}
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
