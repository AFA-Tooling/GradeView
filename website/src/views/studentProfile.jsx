// src/views/studentProfile.jsx
import React, { useMemo, useContext, useState, useEffect } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
import apiv2 from '../utils/apiv2';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import Buckets from './buckets';
import ConceptMap from './conceptMap';

/**
 * Unified Student Profile Page
 * Combines detailed student analytics, Buckets, and Concept Map into tabs
 */
export default function StudentProfile() {
  const [tab, setTab] = useState(0);
  const { selectedStudent, setSelectedStudent } = useContext(StudentSelectionContext);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [studentData, setStudentData] = useState(null);

  // Check if user is admin and load student list
  useEffect(() => {
    let mounted = true;
    apiv2.get('/isadmin')
      .then((res) => {
        if (mounted) {
          const adminStatus = res?.data?.isAdmin === true;
          setIsAdmin(adminStatus);
          
          // If admin, load student list
          if (adminStatus) {
            apiv2.get('/students').then((studentsRes) => {
              if (mounted) {
                const sortedStudents = studentsRes.data.students.sort((a, b) =>
                  a[0].localeCompare(b[0])
                );
                setStudents(sortedStudents);
                
                // If no student selected, select first one
                if (!selectedStudent && sortedStudents.length > 0) {
                  setSelectedStudent(sortedStudents[0][1]);
                }
              }
            }).catch(err => {
              console.error('Failed to load students:', err);
            });
          }
          
          // Check if admin needs to select a student
          if (adminStatus && !selectedStudent && !localStorage.getItem('email')) {
            setNeedsSelection(true);
          } else {
            setNeedsSelection(false);
          }
        }
      })
      .catch(() => {
        if (mounted) setIsAdmin(false);
      });
    return () => { mounted = false; };
  }, [selectedStudent, setSelectedStudent]);

  const fetchEmail = useMemo(() => {
    return selectedStudent || localStorage.getItem('email');
  }, [selectedStudent]);

  const studentName = useMemo(() => {
    if (isAdmin && students.length > 0 && fetchEmail) {
      const student = students.find(s => s[1] === fetchEmail);
      return student ? student[0] : fetchEmail;
    }
    return localStorage.getItem('name') || fetchEmail;
  }, [fetchEmail, isAdmin, students]);

  // Load student data
  useEffect(() => {
    if (!fetchEmail) {
      setStudentData(null);
      return;
    }

    setLoading(true);
    apiv2.get(`/students/${encodeURIComponent(fetchEmail)}/grades`)
      .then(res => {
        const data = res.data;
        setStudentData(processStudentData(data, fetchEmail, studentName));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load student profile:', err);
        setStudentData(null);
        setLoading(false);
      });
  }, [fetchEmail, studentName]);

  // Process student data
  const processStudentData = (data, email, name) => {
    if (!data || Object.keys(data).length === 0) return null;

    const categoriesData = {};
    const assignmentsList = [];
    let totalScore = 0;
    let totalMaxPoints = 0;

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

    const categoryPercentages = Object.values(categoriesData).map(d => d.percentage);
    const overallAvg = categoryPercentages.length > 0 
      ? parseFloat((categoryPercentages.reduce((sum, p) => sum + p, 0) / categoryPercentages.length).toFixed(2))
      : 0;

    const radarData = Object.entries(categoriesData).map(([category, data]) => ({
      category: category,
      percentage: parseFloat(data.percentage.toFixed(2)),
      score: parseFloat(data.total.toFixed(2)),
      maxPoints: parseFloat(data.maxPoints.toFixed(2)),
      average: overallAvg,
      fullMark: 100,
    }));

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

  const getGradeLevel = (percentage) => {
    if (percentage >= 90) return { grade: 'A', color: '#4caf50' };
    if (percentage >= 80) return { grade: 'B', color: '#8bc34a' };
    if (percentage >= 70) return { grade: 'C', color: '#ffc107' };
    if (percentage >= 60) return { grade: 'D', color: '#ff9800' };
    return { grade: 'F', color: '#f44336' };
  };

  const handleTabChange = (event, newValue) => {
    setTab(newValue);
  };

  const handleStudentChange = (event) => {
    setSelectedStudent(event.target.value);
  };

  // Show message if admin needs to select a student
  if (needsSelection || !fetchEmail) {
    return (
      <>
        <PageHeader>Student Profile</PageHeader>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary">
            Please select a student from the dropdown menu in the navigation bar.
          </Typography>
        </Box>
      </>
    );
  }

  // Show loader while fetching grades
  if (loading) {
    return <Loader />;
  }

  const gradeLevel = studentData ? getGradeLevel(studentData.overallPercentage) : { grade: 'N/A', color: '#999' };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 4, pt: 2 }}>
        <PageHeader>Student Profile</PageHeader>
        
        {/* Student selector for admin */}
        {isAdmin && students.length > 0 && (
          <FormControl
            size='small'
            sx={{ minWidth: 200 }}
            variant='outlined'
          >
            <InputLabel id='profile-student-dropdown-label'>
              Select Student
            </InputLabel>
            <Select
              labelId='profile-student-dropdown-label'
              id='profile-student-dropdown'
              label='Select Student'
              value={selectedStudent || ''}
              onChange={handleStudentChange}
            >
              {students.map((student) => (
                <MenuItem
                  key={student[1]}
                  value={student[1]}
                >
                  {student[0]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 4 }}>
        <Tabs value={tab} onChange={handleTabChange} centered>
          <Tab label="Performance Analytics" />
          <Tab label="Buckets" />
          <Tab label="Concept Map" />
        </Tabs>
      </Box>

      {/* Performance Analytics Tab */}
      {tab === 0 && studentData && (
        <Box sx={{ p: 4 }}>
          {/* Student Info Header */}
          {studentName && (
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              {studentName} ({fetchEmail})
            </Typography>
          )}

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
      )}

      {/* Buckets Tab */}
      {tab === 1 && (
        <Box sx={{ p: 0 }}>
          <Buckets embedded />
        </Box>
      )}

      {/* Concept Map Tab */}
      {tab === 2 && (
        <Box sx={{ p: 0 }}>
          <ConceptMap embedded />
        </Box>
      )}
    </>
  );
}
