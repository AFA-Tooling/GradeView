// src/views/alerts.jsx
import { useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  TrendingDown as TrendingDownIcon,
  Assignment as AssignmentIcon,
  Error as ErrorIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import StudentProfile from '../components/StudentProfile';
import apiv2 from '../utils/apiv2';

export default function Alerts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [studentScores, setStudentScores] = useState([]);
  const [assignments, setAssignments] = useState([]);
  
  // Alert thresholds (configurable)
  const [thresholds, setThresholds] = useState({
    lowScoreThreshold: 60,        // Below this percentage is considered low
    consecutiveLowCount: 2,       // Number of consecutive low scores to trigger alert
    trendingDownThreshold: -10,   // Percentage drop to consider trending down
    missingAssignmentCount: 2,    // Number of missing assignments to trigger alert
  });
  
  const [alerts, setAlerts] = useState({
    lowPerformers: [],
    trendingDown: [],
    missingAssignments: [],
    atRisk: [],
  });

  // Student profile dialog
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  const [showSettings, setShowSettings] = useState(false);

  // Load student data
  useEffect(() => {
    setLoading(true);
    setError(null);

    apiv2.get('/admin/studentScores')
      .then(scoresRes => {
        const students = scoresRes.data.students || [];
        setStudentScores(students);
        
        // Extract assignments with maxPoints from student data
        const assignmentsMap = new Map();
        students.forEach(student => {
          const scores = student.scores || {};
          Object.entries(scores).forEach(([section, assignments]) => {
            Object.entries(assignments).forEach(([assignmentName, scoreValue]) => {
              const key = `${section}::${assignmentName}`;
              if (!assignmentsMap.has(key)) {
                assignmentsMap.set(key, { section, name: assignmentName });
              }
            });
          });
        });
        
        const allAssignments = Array.from(assignmentsMap.values());
        setAssignments(allAssignments);
        
        analyzeStudents(students, allAssignments);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setError('Failed to load student data');
        setLoading(false);
      });
  }, []);

  // Re-analyze when thresholds change
  useEffect(() => {
    if (studentScores.length > 0) {
      analyzeStudents(studentScores, assignments);
    }
  }, [thresholds, studentScores, assignments]);

  const analyzeStudents = (students, assignmentsList) => {
    const lowPerformers = [];
    const trendingDown = [];
    const missingAssignments = [];
    const atRisk = [];

    // First, get max points for each assignment from the first student's grades API
    // But we need to use the assignmentsList which should have maxPoints from admin.jsx approach
    // Let's build a map from the students data
    
    // Find MAX POINTS student or extract from first real student
    let maxPointsMap = new Map();
    
    students.forEach(student => {
      const scores = student.scores || {};
      Object.entries(scores).forEach(([section, assignments]) => {
        Object.entries(assignments).forEach(([assignmentName, scoreValue]) => {
          const key = `${section}::${assignmentName}`;
          // For MAX POINTS student, this IS the max
          // For other students, we need to get it from grades API or assume default
          if (student.email === 'MAX POINTS' || student.name === 'MAX POINTS') {
            maxPointsMap.set(key, parseFloat(scoreValue) || 0);
          }
        });
      });
    });

    console.log('Max points map size:', maxPointsMap.size);
    console.log('Sample max points:', Array.from(maxPointsMap.entries()).slice(0, 5));

    students.forEach(student => {
      // Skip MAX POINTS student
      if (student.email === 'MAX POINTS' || student.name === 'MAX POINTS') return;
      
      const scores = student.scores || {};
      
      // Flatten scores from {section: {assignment: score}} to array
      const allScores = [];
      
      Object.entries(scores).forEach(([section, assignments]) => {
        Object.entries(assignments).forEach(([assignmentName, scoreValue]) => {
          const key = `${section}::${assignmentName}`;
          const maxPoints = maxPointsMap.get(key);
          
          // Only include if we have max points
          if (maxPoints && maxPoints > 0) {
            const score = parseFloat(scoreValue) || 0;
            allScores.push({
              name: assignmentName,
              section: section,
              score: score,
              maxPoints: maxPoints,
              percentage: (score / maxPoints) * 100,
            });
          }
        });
      });

      if (allScores.length === 0) return; // Skip students with no valid scores

      // Calculate overall percentage
      const totalScore = allScores.reduce((sum, s) => sum + s.score, 0);
      const totalMax = allScores.reduce((sum, s) => sum + s.maxPoints, 0);
      const overallPercentage = totalMax > 0 ? (totalScore / totalMax) * 100 : 0;
      
      if (student.name === 'Perfect, Paula') {
        console.log('Paula scores:', allScores.slice(0, 3));
        console.log('Paula total:', totalScore, 'max:', totalMax, 'percentage:', overallPercentage);
      }

      // 1. Check for low performers (overall low score)
      if (overallPercentage < thresholds.lowScoreThreshold) {
        lowPerformers.push({
          ...student,
          overallPercentage,
          alertType: 'low-performer',
          severity: overallPercentage < 50 ? 'critical' : 'warning',
        });
      }

      // 2. Check for consecutive low scores
      let consecutiveLow = 0;
      let maxConsecutiveLow = 0;
      allScores.forEach(s => {
        if (s.percentage < thresholds.lowScoreThreshold) {
          consecutiveLow++;
          maxConsecutiveLow = Math.max(maxConsecutiveLow, consecutiveLow);
        } else {
          consecutiveLow = 0;
        }
      });

      if (maxConsecutiveLow >= thresholds.consecutiveLowCount) {
        const existing = lowPerformers.find(s => s.email === student.email);
        if (!existing) {
          lowPerformers.push({
            ...student,
            overallPercentage,
            consecutiveLowCount: maxConsecutiveLow,
            alertType: 'consecutive-low',
            severity: 'warning',
          });
        }
      }

      // 3. Check for trending down (recent scores worse than early scores)
      if (allScores.length >= 4) {
        const half = Math.floor(allScores.length / 2);
        const firstHalf = allScores.slice(0, half);
        const secondHalf = allScores.slice(half);
        
        const firstAvg = firstHalf.reduce((sum, s) => sum + s.percentage, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, s) => sum + s.percentage, 0) / secondHalf.length;
        const trend = secondAvg - firstAvg;

        if (trend < thresholds.trendingDownThreshold) {
          trendingDown.push({
            ...student,
            overallPercentage,
            firstHalfAvg: firstAvg,
            secondHalfAvg: secondAvg,
            trend,
            alertType: 'trending-down',
            severity: trend < -20 ? 'critical' : 'warning',
          });
        }
      }

      // 4. Check for missing assignments (score of 0 or null)
      const missingCount = allScores.filter(s => s.score === 0).length;
      if (missingCount >= thresholds.missingAssignmentCount) {
        missingAssignments.push({
          ...student,
          overallPercentage,
          missingCount,
          alertType: 'missing-assignments',
          severity: missingCount >= 4 ? 'critical' : 'warning',
        });
      }

      // 5. At-risk students (multiple alert types)
      const alertCount = [
        overallPercentage < thresholds.lowScoreThreshold,
        maxConsecutiveLow >= thresholds.consecutiveLowCount,
        missingCount >= thresholds.missingAssignmentCount,
      ].filter(Boolean).length;

      if (alertCount >= 2) {
        atRisk.push({
          ...student,
          overallPercentage,
          alertCount,
          alertType: 'at-risk',
          severity: 'critical',
        });
      }
    });

    setAlerts({
      lowPerformers: lowPerformers.sort((a, b) => a.overallPercentage - b.overallPercentage),
      trendingDown: trendingDown.sort((a, b) => a.trend - b.trend),
      missingAssignments: missingAssignments.sort((a, b) => b.missingCount - a.missingCount),
      atRisk: atRisk.sort((a, b) => b.alertCount - a.alertCount),
    });
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return '#f44336';
      case 'warning': return '#ff9800';
      default: return '#2196f3';
    }
  };

  const handleStudentClick = (student) => {
    setSelectedStudent({ email: student.email, name: student.name });
    setProfileOpen(true);
  };

  const AlertCard = ({ title, count, icon, color, children }) => (
    <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
          <Box display="flex" alignItems="center" gap={1}>
            {icon}
            <Typography variant="h6">{title}</Typography>
          </Box>
          <Chip 
            label={count} 
            sx={{ 
              backgroundColor: color, 
              color: 'white',
              fontWeight: 'bold',
              fontSize: '16px',
            }} 
          />
        </Box>
        {children}
      </CardContent>
    </Card>
  );

  return (
    <>
      <PageHeader>Alert System</PageHeader>

      <Box pl={10} pr={10} pb={6} pt={4}>
        {loading && <Typography>Loading alert data...</Typography>}
        {error && <Alert severity="error">{error}</Alert>}

        {!loading && !error && (
          <>
            {/* Settings Panel */}
            <Box mb={3}>
              <Button
                startIcon={<SettingsIcon />}
                onClick={() => setShowSettings(!showSettings)}
                variant="outlined"
                size="small"
              >
                {showSettings ? 'Hide Settings' : 'Configure Thresholds'}
              </Button>

              {showSettings && (
                <Paper sx={{ p: 3, mt: 2 }}>
                  <Typography variant="h6" gutterBottom>Alert Thresholds</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="Low Score Threshold (%)"
                        type="number"
                        size="small"
                        value={thresholds.lowScoreThreshold}
                        onChange={(e) => setThresholds({ ...thresholds, lowScoreThreshold: parseFloat(e.target.value) })}
                        inputProps={{ min: 0, max: 100 }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="Consecutive Low Count"
                        type="number"
                        size="small"
                        value={thresholds.consecutiveLowCount}
                        onChange={(e) => setThresholds({ ...thresholds, consecutiveLowCount: parseInt(e.target.value) })}
                        inputProps={{ min: 1, max: 10 }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="Trending Down Threshold (%)"
                        type="number"
                        size="small"
                        value={thresholds.trendingDownThreshold}
                        onChange={(e) => setThresholds({ ...thresholds, trendingDownThreshold: parseFloat(e.target.value) })}
                        inputProps={{ min: -50, max: 0 }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        label="Missing Assignment Count"
                        type="number"
                        size="small"
                        value={thresholds.missingAssignmentCount}
                        onChange={(e) => setThresholds({ ...thresholds, missingAssignmentCount: parseInt(e.target.value) })}
                        inputProps={{ min: 1, max: 20 }}
                      />
                    </Grid>
                  </Grid>
                </Paper>
              )}
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} mb={4}>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ backgroundColor: '#f44336', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h3" align="center">{alerts.atRisk.length}</Typography>
                    <Typography variant="h6" align="center">At Risk</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ backgroundColor: '#ff9800', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h3" align="center">{alerts.lowPerformers.length}</Typography>
                    <Typography variant="h6" align="center">Low Performers</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ backgroundColor: '#2196f3', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h3" align="center">{alerts.trendingDown.length}</Typography>
                    <Typography variant="h6" align="center">Trending Down</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Card sx={{ backgroundColor: '#9c27b0', color: 'white' }}>
                  <CardContent>
                    <Typography variant="h3" align="center">{alerts.missingAssignments.length}</Typography>
                    <Typography variant="h6" align="center">Missing Work</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            {/* Alert Details */}
            <Box>
              {/* At-Risk Students (Critical) */}
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <ErrorIcon sx={{ color: '#f44336' }} />
                    <Typography variant="h6">At-Risk Students ({alerts.atRisk.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {alerts.atRisk.length === 0 ? (
                    <Typography color="textSecondary">No at-risk students found</Typography>
                  ) : (
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#ffebee' }}>
                            <TableCell><strong>Student</strong></TableCell>
                            <TableCell align="center"><strong>Overall %</strong></TableCell>
                            <TableCell align="center"><strong>Alert Count</strong></TableCell>
                            <TableCell><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {alerts.atRisk.map((student, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2"><strong>{student.name}</strong></Typography>
                                  <Typography variant="caption" color="textSecondary">{student.email}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${student.overallPercentage.toFixed(1)}%`}
                                  size="small"
                                  sx={{ backgroundColor: getSeverityColor('critical'), color: 'white' }}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={student.alertCount}
                                  size="small"
                                  color="error"
                                />
                              </TableCell>
                              <TableCell>
                                <Button 
                                  size="small" 
                                  variant="outlined"
                                  onClick={() => handleStudentClick(student)}
                                >
                                  View Profile
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </AccordionDetails>
              </Accordion>

              {/* Low Performers */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <WarningIcon sx={{ color: '#ff9800' }} />
                    <Typography variant="h6">Low Performers ({alerts.lowPerformers.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {alerts.lowPerformers.length === 0 ? (
                    <Typography color="textSecondary">No low performers found</Typography>
                  ) : (
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                            <TableCell><strong>Student</strong></TableCell>
                            <TableCell align="center"><strong>Overall %</strong></TableCell>
                            <TableCell align="center"><strong>Severity</strong></TableCell>
                            <TableCell><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {alerts.lowPerformers.map((student, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2"><strong>{student.name}</strong></Typography>
                                  <Typography variant="caption" color="textSecondary">{student.email}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${student.overallPercentage.toFixed(1)}%`}
                                  size="small"
                                  sx={{ backgroundColor: getSeverityColor(student.severity), color: 'white' }}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={student.severity}
                                  size="small"
                                  color={student.severity === 'critical' ? 'error' : 'warning'}
                                />
                              </TableCell>
                              <TableCell>
                                <Button 
                                  size="small" 
                                  variant="outlined"
                                  onClick={() => handleStudentClick(student)}
                                >
                                  View Profile
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </AccordionDetails>
              </Accordion>

              {/* Trending Down */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <TrendingDownIcon sx={{ color: '#2196f3' }} />
                    <Typography variant="h6">Trending Down ({alerts.trendingDown.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {alerts.trendingDown.length === 0 ? (
                    <Typography color="textSecondary">No declining trends detected</Typography>
                  ) : (
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#e3f2fd' }}>
                            <TableCell><strong>Student</strong></TableCell>
                            <TableCell align="center"><strong>Early Avg</strong></TableCell>
                            <TableCell align="center"><strong>Recent Avg</strong></TableCell>
                            <TableCell align="center"><strong>Trend</strong></TableCell>
                            <TableCell><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {alerts.trendingDown.map((student, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2"><strong>{student.name}</strong></Typography>
                                  <Typography variant="caption" color="textSecondary">{student.email}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="center">{student.firstHalfAvg.toFixed(1)}%</TableCell>
                              <TableCell align="center">{student.secondHalfAvg.toFixed(1)}%</TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={`${student.trend.toFixed(1)}%`}
                                  size="small"
                                  sx={{ backgroundColor: getSeverityColor(student.severity), color: 'white' }}
                                />
                              </TableCell>
                              <TableCell>
                                <Button 
                                  size="small" 
                                  variant="outlined"
                                  onClick={() => handleStudentClick(student)}
                                >
                                  View Profile
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </AccordionDetails>
              </Accordion>

              {/* Missing Assignments */}
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <AssignmentIcon sx={{ color: '#9c27b0' }} />
                    <Typography variant="h6">Missing Assignments ({alerts.missingAssignments.length})</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {alerts.missingAssignments.length === 0 ? (
                    <Typography color="textSecondary">No students with missing assignments</Typography>
                  ) : (
                    <TableContainer component={Paper}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ backgroundColor: '#f3e5f5' }}>
                            <TableCell><strong>Student</strong></TableCell>
                            <TableCell align="center"><strong>Missing Count</strong></TableCell>
                            <TableCell align="center"><strong>Overall %</strong></TableCell>
                            <TableCell><strong>Actions</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {alerts.missingAssignments.map((student, idx) => (
                            <TableRow key={idx} hover>
                              <TableCell>
                                <Box>
                                  <Typography variant="body2"><strong>{student.name}</strong></Typography>
                                  <Typography variant="caption" color="textSecondary">{student.email}</Typography>
                                </Box>
                              </TableCell>
                              <TableCell align="center">
                                <Chip 
                                  label={student.missingCount}
                                  size="small"
                                  color={student.severity === 'critical' ? 'error' : 'warning'}
                                />
                              </TableCell>
                              <TableCell align="center">{student.overallPercentage.toFixed(1)}%</TableCell>
                              <TableCell>
                                <Button 
                                  size="small" 
                                  variant="outlined"
                                  onClick={() => handleStudentClick(student)}
                                >
                                  View Profile
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </AccordionDetails>
              </Accordion>
            </Box>
          </>
        )}
      </Box>

      {/* Student Profile Dialog */}
      <StudentProfile 
        open={profileOpen}
        onClose={() => {
          setProfileOpen(false);
          setSelectedStudent(null);
        }}
        studentEmail={selectedStudent?.email}
        studentName={selectedStudent?.name}
      />
    </>
  );
}
