// src/views/admin.jsx
import { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Button,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  IconButton,
} from '@mui/material';
import { ArrowUpward, ArrowDownward } from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import PageHeader from '../components/PageHeader';
import StudentProfile from '../components/StudentProfile';
import apiv2 from '../utils/apiv2';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';



export default function Admin() {
  // TAB STATE
  const [tab, setTab] = useState(0);

  // --- ASSIGNMENTS UI & STATS ---
  const [searchQuery, setSearchQuery] = useState('');
  const [assignments, setAssignments] = useState([]); // {section,name}[]
  const [filtered, setFiltered]       = useState([]);
  const [loadingA, setLoadingA]       = useState(true);
  const [errorA, setErrorA]           = useState();

  // selected assignment + stats
  const [selected, setSelected]         = useState(null);
  const [stats, setStats]               = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError]     = useState();
  const [distribution, setDistribution] = useState(null);

  // --- STUDENT-SCORES + SORT STATE ---
  const [studentScores, setStudentScores] = useState([]); // [{name,email,scores}]
  const [loadingSS, setLoadingSS]         = useState(false);
  const [errorSS, setErrorSS]             = useState();

  // score details
  const [scoreDetailOpen, setScoreDetailOpen]     = useState(false);
  const [scoreSelected, setScoreSelected]         = useState([]); // Array of selected score ranges
  const [studentsByScore, setStudentsByScore]     = useState([]); // Array of {range, students} objects
  const [studentsByScoreLoading, setStudentsByScoreLoading] = useState(false);
  const [studentsByScoreError, setStudentsByScoreError] = useState(null);

  const [sortBy, setSortBy]   = useState(null); // 'Quest','Midterm','Labs','total' or assignment.name
  const [sortAsc, setSortAsc] = useState(true);
  
  // --- STUDENT PROFILE DIALOG ---
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null); // {email, name}
  
  // --- STUDENT PAGE CUSTOMIZATION ---
  const [visibleAssignments, setVisibleAssignments] = useState({}); // {assignmentName: boolean}
  const [selectorDialogOpen, setSelectorDialogOpen] = useState(null); // Section name or null
  const handleSort = col => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else {
      setSortBy(col);
      setSortAsc(true);
    }
  };

  /** 1) Load assignment categories with max points from grades data **/
  useEffect(() => {
    // First, try to get any student's grades to extract max points
    apiv2.get('/admin/studentScores')
      .then(res => {
        const students = res.data.students;
        if (!students || students.length === 0) {
          // Fallback: no students, just load categories without max points
          return apiv2.get('/admin/categories')
            .then(catRes => {
              const data = catRes.data;
              const items = Object.entries(data)
                .flatMap(([section, obj]) =>
                  Object.keys(obj).map(name => ({ section, name, maxPoints: 0 }))
                );
              setAssignments(items);
              setFiltered(items);
            });
        }
        
        // Get the first student's email and fetch their grades (which includes max points)
        const firstStudentEmail = students[0].email;
        return apiv2.get(`/students/${encodeURIComponent(firstStudentEmail)}/grades`)
          .then(gradesRes => {
            const gradesData = gradesRes.data || {};
            // Extract all assignment names and their max points
            // grades data structure: { [assignmentName]: { [category]: { student: X, max: Y }, ... }, ... }
            const maxPointsMap = {};
            
            Object.entries(gradesData).forEach(([assignmentName, categoryData]) => {
              // categoryData is like { [category]: {student: X, max: Y} }
              Object.entries(categoryData).forEach(([category, scoreObj]) => {
                if (scoreObj && scoreObj.max) {
                  maxPointsMap[assignmentName] = scoreObj.max;
                }
              });
            });
            
            // Now get categories
            return apiv2.get('/admin/categories')
              .then(catRes => {
                const categoriesData = catRes.data;
                const items = Object.entries(categoriesData)
                  .flatMap(([section, obj]) =>
                    Object.keys(obj).map(name => ({ 
                      section, 
                      name,
                      maxPoints: maxPointsMap[name] || 0
                    }))
                  );
                setAssignments(items);
                setFiltered(items);
              });
          });
      })
      .catch(err => setErrorA(err.message || 'Failed to load assignments'))
      .finally(() => setLoadingA(false));
  }, []);

  /** 2) Filter assignments **/
  useEffect(() => {
    setFiltered(
      assignments.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [searchQuery, assignments]);

  /** 3) Fetch stats + distribution when an assignment is clicked **/
  useEffect(() => {
    if (!selected) {
      setStats(null);
      setDistribution(null);
      return;
    }
    setStatsLoading(true);
    setStatsError(null);

    const { section, name } = selected;
    Promise.all([
      apiv2.get(`/admin/stats/${encodeURIComponent(section)}/${encodeURIComponent(name)}`),
      apiv2.get(`/admin/distribution/${encodeURIComponent(section)}/${encodeURIComponent(name)}`)
    ])
      .then(([statsRes, distRes]) => {
        setStats(statsRes.data);
        setDistribution(distRes.data);
      })
      .catch(err => setStatsError(err.message || 'Failed to load stats'))
      .finally(() => setStatsLoading(false));
  }, [selected]);

  /** 4) Load student-scores when Students tab is activated **/
  useEffect(() => {
    if (tab !== 1) return;
    setLoadingSS(true);
    setErrorSS(null);

    apiv2.get('/admin/studentScores')
      .then(res => setStudentScores(res.data.students))
      .catch(err => setErrorSS(err.message || 'Failed to load student scores'))
      .finally(() => setLoadingSS(false));
  }, [tab]);

  // Flattened assignment list (for columns)
  const allAssignments = useMemo(() => assignments, [assignments]);

  // Group assignments by section with max points
  const assignmentsBySection = useMemo(() => {
    const grouped = {};
    assignments.forEach(a => {
      if (!grouped[a.section]) {
        grouped[a.section] = [];
      }
      grouped[a.section].push(a);
    });
    return grouped;
  }, [assignments]);

  // Calculate max points per section
  const sectionMaxPoints = useMemo(() => {
    const maxPoints = {};
    Object.entries(assignmentsBySection).forEach(([section, sectionAssignments]) => {
      maxPoints[section] = sectionAssignments.reduce((sum, a) => sum + (a.maxPoints || 0), 0);
    });
    return maxPoints;
  }, [assignmentsBySection]);

  const totalMaxPoints = useMemo(() => {
    return Object.values(sectionMaxPoints).reduce((sum, v) => sum + v, 0);
  }, [sectionMaxPoints]);

  /** 5) Compute section totals + overall total per student **/
  const studentWithTotals = useMemo(() => {
    return studentScores.map(stu => {
      // First, flatten the scores from { section: { assignment: score } } to { assignment: score }
      const flatScores = {};
      Object.values(stu.scores || {}).forEach(sectionScores => {
        Object.assign(flatScores, sectionScores);
      });

      const sectionTotals = {};
      Object.keys(assignmentsBySection).forEach(sec => {
        sectionTotals[sec] = allAssignments
          .filter(a => a.section === sec)
          .reduce((sum, a) => sum + Number(flatScores[a.name] || 0), 0);
      });
      
      const total = Object.values(sectionTotals).reduce((s, v) => s + v, 0);
      return { ...stu, scores: flatScores, sectionTotals, total };
    });
  }, [studentScores, allAssignments, assignmentsBySection]);

  /** 6) Sort students **/
  const sortedStudents = useMemo(() => {
    const arr = [...studentWithTotals];
    if (!sortBy) return arr;
    arr.sort((a, b) => {
      let aVal, bVal;
      if (sortBy === 'total') {
        aVal = a.total; bVal = b.total;
      } else if (a.sectionTotals?.hasOwnProperty(sortBy)) {
        aVal = a.sectionTotals[sortBy];
        bVal = b.sectionTotals[sortBy];
      } else {
        aVal = a.scores[sortBy] ?? 0;
        bVal = b.scores[sortBy] ?? 0;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [studentWithTotals, sortBy, sortAsc]);

  // Handlers
  const handleTabChange = (_, newTab) => {
    setTab(newTab);
    if (newTab !== 0) {
      setSelected(null);
      setStats(null);
      setDistribution(null);
      setStatsError(null);
    }
  };

  const handleAssignClick = item => setSelected(item);
  const handleCloseDialog  = () => {
    setSelected(null);
    setStats(null);
    setDistribution(null);
    setStatsError(null);
  };

  const handleScoreClick = (data, index) => {
    // 'data' here is the bar data clicked: {range: "50-74", count: N, students: [...], ...}
    if (!selected || !data.students) return;

    const clickedRange = data.range;
    
    // Check if this score range is already selected
    const isAlreadySelected = scoreSelected.includes(clickedRange);
    
    let newSelectedScores;
    let newStudentsByScore;
    
    if (isAlreadySelected) {
      // Remove this score range
      newSelectedScores = scoreSelected.filter(r => r !== clickedRange);
      newStudentsByScore = studentsByScore.filter(group => group.range !== clickedRange);
    } else {
      // Add this score range
      newSelectedScores = [...scoreSelected, clickedRange];
      newStudentsByScore = [...studentsByScore, { range: clickedRange, students: data.students }];
    }
    
    setScoreSelected(newSelectedScores);
    setStudentsByScore(newStudentsByScore);
  };

  /** Close the student list dialog **/
  const handleCloseScoreDialog = () => {
    setScoreDetailOpen(false);
    setScoreSelected([]);
    setStudentsByScore([]); // Clear previous data
    setStudentsByScoreError(null);
  };

  // Generate email with empty fields
  const handleGenerateEmail = () => {
      if (!studentsByScore || !studentsByScore.length || !selected || scoreSelected.length === 0) {
          alert('Student list, assignment name, or score data is missing.');
          return;
      }

      const assignmentName = selected.name;
      
      // Build content for each score range
      const scoreGroupsText = studentsByScore
          .map(group => {
              const studentListText = group.students
                  .map(stu => `  - ${stu.name} (${stu.email})`)
                  .join('\n');
              return `Score: ${group.range}\n${studentListText}`;
          })
          .join('\n\n');

      const emailBodyContent = `---\n` +
                              `Assignment: ${assignmentName}\n` +
                              `---\n\n` +
                              `Students by score:\n\n${scoreGroupsText}`;

      const subject = `Score List for ${assignmentName}`;

      const mailto = `mailto:` + 
                    `?subject=${encodeURIComponent(subject)}` + 
                    `&body=${encodeURIComponent(emailBodyContent)}`;
      
      const link = document.createElement('a');
      link.href = mailto;
      link.target = '_blank'; 
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // Generate text and copy to clipboard
  const handleGenerateTxt = async () => {
      if (!studentsByScore || !studentsByScore.length || !selected || scoreSelected.length === 0) {
          alert('Student list, assignment name, or score data is missing.');
          return;
      }

      const assignmentName = selected.name;
      
      // Build content for each score range
      const scoreGroupsText = studentsByScore
          .map(group => {
              const studentListText = group.students
                  .map(stu => `  - ${stu.name} (${stu.email})`)
                  .join('\n');
              return `Score: ${group.range}\n${studentListText}`;
          })
          .join('\n\n');

      const textContent = `---\n` +
                         `Assignment: ${assignmentName}\n` +
                         `---\n\n` +
                         `Students by score:\n\n${scoreGroupsText}`;

      try {
          await navigator.clipboard.writeText(textContent);
          alert('Text copied to clipboard!');
      } catch (err) {
          console.error('Failed to copy text:', err);
          alert('Failed to copy to clipboard');
      }
  };

  return (
    <>
      {/* Tabs */}
      <Box px={10}>
        <Tabs value={tab} onChange={handleTabChange}>
          <Tab label="Assignments" />
          <Tab label="Students" />
        </Tabs>
      </Box>

      {/* ASSIGNMENTS TAB */}
    {tab === 0 && (
    <Box pl={10} pr={10} pb={6}>
        {/* Search Field */}
        <Box mt={4} mb={2} display="flex" gap={2}>
        <TextField
            placeholder="Search assignments…"
            size="small"
            sx={{ flex: '1 1 auto', maxWidth: 300 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
        />
        </Box>

        {/* Loading / Error */}
        {loadingA && <Typography>Loading assignments…</Typography>}
        {errorA   && <Alert severity="error">{errorA}</Alert>}

        {/* Assignment Buttons */}
        {!loadingA && !errorA && (
        <>
            <Typography variant="h6" textAlign="center" mb={2}>
            Assignments Dashboard
            </Typography>
            {Object.entries(assignmentsBySection).map(([section, sectionAssignments]) => (
              <Box key={section} mb={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', textTransform: 'uppercase', flex: 1 }}>
                    {section}
                  </Typography>
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => handleAssignClick({ section, name: `${section} Summary` })}
                  >
                    Summary
                  </Button>
                </Box>
                <Grid container spacing={2}>
                  {sectionAssignments
                    .filter(item =>
                      item.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((item, i) => (
                      <Grid key={i} item>
                        <Button
                          variant="outlined"
                          sx={{ minWidth: 140, height: 56, fontSize: '1rem' }}
                          onClick={() => handleAssignClick(item)}
                        >
                          {item.name}
                        </Button>
                      </Grid>
                    ))}
                </Grid>
              </Box>
            ))}
        </>
        )}

        {/* Stats & Histogram Dialog */}
        <Dialog
        open={Boolean(selected)}
        onClose={handleCloseDialog}
        fullWidth
        maxWidth="md"
        >
        <DialogTitle>{selected?.name} Statistics</DialogTitle>
        <DialogContent>
            {statsLoading && <Typography>Loading stats…</Typography>}
            {statsError   && <Alert severity="error">{statsError}</Alert>}

            {stats && (
            <>
                <Typography>
                <strong>Section:</strong> {selected.section}
                </Typography>
                <Typography>
                <strong>Average:</strong>{' '}
                {stats.average?.toFixed(2) ?? 'N/A'}
                </Typography>
                <Typography>
                <strong>Max:</strong> {stats.max ?? 'N/A'}
                </Typography>
                <Typography>
                <strong>Min:</strong> {stats.min ?? 'N/A'}
                </Typography>
                {distribution && (() => {
                  const numBins = distribution.distribution?.length || 0;
                  const maxScore = distribution.maxScore || 10;
                  // Calculate appropriate bar size based on number of bins
                  let barSize = undefined; // Let recharts decide by default
                  let barCategoryGap = '10%';
                  
                  if (numBins <= 5) {
                    // Very few bins: set fixed narrow bar width
                    barSize = 30;
                    barCategoryGap = '50%';
                  } else if (numBins <= 10) {
                    // Small number of bins: moderate bar width
                    barSize = 20;
                    barCategoryGap = '30%';
                  } else if (numBins <= 25) {
                    // Medium bins: standard width
                    barCategoryGap = '15%';
                  }
                  
                  return (
                <Box mt={4}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body2" color="textSecondary">
                        💡 Click on bars to select/deselect score ranges. Selected ranges will turn green.
                      </Typography>
                      {scoreSelected.length > 0 && (
                        <Button 
                          variant="contained" 
                          color="primary" 
                          size="small"
                          onClick={() => setScoreDetailOpen(true)}
                        >
                          View Selected ({scoreSelected.length})
                        </Button>
                      )}
                    </Box>
                    <Box height={350}>
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={distribution.distribution || []}
                        margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
                        barSize={barSize}
                        barCategoryGap={barCategoryGap}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                        dataKey="range"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        domain={[0, maxScore]}
                        type="number"
                        interval={distribution.suggestedTickInterval - 1 || Math.max(0, Math.floor(numBins / 20))}
                        label={{ value: 'Score', position: 'bottom', offset: 10 }}
                        tick={{ fontSize: numBins > 50 ? 10 : 12 }}
                        ticks={Array.from({ length: Math.floor(maxScore) + 1 }, (_, i) => i)}
                        />
                        <YAxis
                        allowDecimals={false}
                        label={{ value: 'Count', angle: -90, position: 'insideLeft', offset: 10 }}
                        />
                        <Tooltip 
                        cursor={{ fill: 'rgba(0,0,0,0.1)' }}
                        formatter={(value) => [`${value}`, 'Count']}
                        />

                        <Bar
                        dataKey="count"
                        onClick={(data) => {
                          handleScoreClick(data, 0);
                        }}
                        style={{ cursor: 'pointer' }}
                        >
                        {(distribution.distribution || []).map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={scoreSelected.includes(entry.range) ? '#4caf50' : '#002676'}
                          />
                        ))}
                        <LabelList 
                          dataKey="count" 
                          position="top"
                          content={(props) => {
                            const { x, y, width, value } = props;
                            if (!value || value === 0) return null;
                            return (
                              <text 
                                x={x + width / 2} 
                                y={y - 4} 
                                fill="#666" 
                                textAnchor="middle"
                                fontSize={12}
                              >
                                {value}
                              </text>
                            );
                          }}
                        />
                        </Bar>

                    </BarChart>
                    </ResponsiveContainer>
                    </Box>
                </Box>
                  );
                })()}
            </>
            )}

            {!statsLoading && !stats && !statsError && (
            <Typography>No data available.</Typography>
            )}
        </DialogContent>
        <DialogActions>
            <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
        </Dialog>
        {/* Score Detail Dialog (Students for a specific score)*/}
        <Dialog
        open={scoreDetailOpen}
        onClose={handleCloseScoreDialog}
        fullWidth
        maxWidth="sm"
        >
        <DialogTitle>
            Students with Selected Scores on **{selected?.name}**
            {scoreSelected.length > 0 && (
              <Typography variant="subtitle2" color="textSecondary">
                Selected ranges: {scoreSelected.join(', ')}
              </Typography>
            )}
        </DialogTitle>


        <DialogContent>
            {studentsByScore.length === 0 ? (
                <Typography>No students found with the selected scores.</Typography>
            ) : (
                studentsByScore
                  .sort((a, b) => {
                    // Extract the lower bound of the range for sorting
                    const getMinScore = (range) => {
                      const match = range.match(/^(\d+)/);
                      return match ? parseInt(match[1]) : 0;
                    };
                    return getMinScore(a.range) - getMinScore(b.range);
                  })
                  .map((group, groupIndex) => (
                  <Box key={groupIndex} mb={3}>
                    <Typography variant="h6" gutterBottom color="primary" sx={{ mt: groupIndex > 0 ? 2 : 0 }}>
                      Score Range: {group.range}
                    </Typography>
                    <TableContainer component={Paper} sx={{ mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Name</strong></TableCell>
                            <TableCell><strong>Email</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {group.students.map((stu, i) => (
                            <TableRow key={i}>
                              <TableCell>{stu.name}</TableCell>
                              <TableCell>{stu.email}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                ))
            )}

            <Box mt={4} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
                <Typography variant="h6" gutterBottom>
                    📧 Email Student List
                </Typography>
              
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Generate an email draft or copy the text content to clipboard
                </Typography>
                
                <Box mt={2} display="flex" justifyContent="flex-end" gap={2}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleGenerateEmail}
                        disabled={!studentsByScore.length}
                    >
                        Generate Email
                    </Button>
                    <Button
                        variant="outlined"
                        color="primary"
                        onClick={handleGenerateTxt}
                        disabled={!studentsByScore.length}
                    >
                        Copy to Clipboard
                    </Button>
                </Box>
        </Box>
        

        </DialogContent>
        <DialogActions>
            <Button onClick={handleCloseScoreDialog}>Close</Button>
        </DialogActions>
        </Dialog>

{/* ... end of tab === 0 && (Box) */}
    </Box>
    )}


      {/* STUDENTS × ASSIGNMENTS TAB */}
        {tab === 1 && (
        <Box pl={10} pr={10} pb={6}>
            {loadingSS && <Typography>Loading student scores…</Typography>}
            {errorSS && <Alert severity="error">{errorSS}</Alert>}

            {!loadingSS && !errorSS && (
            <>
                <Typography variant="h6" textAlign="center" mb={3}>
                Students
                </Typography>
                
                {/* Assignment Selector - Buttons for each section */}
                <Box mb={3} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mr: 1 }}>
                        Show Columns:
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                            const allAssignments = {};
                            Object.values(assignmentsBySection).forEach(assignments => {
                                assignments.forEach(a => {
                                    allAssignments[a.name] = true;
                                });
                            });
                            setVisibleAssignments(allAssignments);
                        }}
                    >
                        Select All
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                            const allAssignments = {};
                            Object.values(assignmentsBySection).forEach(assignments => {
                                assignments.forEach(a => {
                                    allAssignments[a.name] = false;
                                });
                            });
                            setVisibleAssignments(allAssignments);
                        }}
                    >
                        Deselect All
                    </Button>
                    
                    {/* Section Buttons */}
                    {Object.entries(assignmentsBySection).map(([section, sectionAssignments]) => {
                        const visibleCount = sectionAssignments.filter(a => visibleAssignments[a.name]).length;
                        const total = sectionAssignments.length;
                        const allVisible = visibleCount === total && total > 0;
                        const someVisible = visibleCount > 0 && visibleCount < total;
                        
                        return (
                            <Box key={section}>
                                <Button
                                    size="small"
                                    variant={allVisible ? "contained" : someVisible ? "outlined" : "outlined"}
                                    sx={{
                                        backgroundColor: allVisible ? '#2196F3' : 'transparent',
                                        color: allVisible ? 'white' : 'inherit',
                                        borderColor: '#2196F3'
                                    }}
                                    onClick={() => setSelectorDialogOpen(section)}
                                >
                                    {section} ({visibleCount}/{total})
                                </Button>
                                
                                {/* Popup Dialog for this section */}
                                <Dialog
                                    open={selectorDialogOpen === section}
                                    onClose={() => setSelectorDialogOpen(null)}
                                    maxWidth="sm"
                                    fullWidth
                                >
                                    <DialogTitle>{section} - Select Assignments</DialogTitle>
                                    <DialogContent sx={{ pt: 2 }}>
                                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    const updated = { ...visibleAssignments };
                                                    sectionAssignments.forEach(a => {
                                                        updated[a.name] = true;
                                                    });
                                                    setVisibleAssignments(updated);
                                                }}
                                            >
                                                Select All
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    const updated = { ...visibleAssignments };
                                                    sectionAssignments.forEach(a => {
                                                        updated[a.name] = false;
                                                    });
                                                    setVisibleAssignments(updated);
                                                }}
                                            >
                                                Deselect All
                                            </Button>
                                        </Box>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                            {sectionAssignments.map(a => (
                                                <Box
                                                    key={a.name}
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        padding: '8px',
                                                        border: '1px solid #eee',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        backgroundColor: visibleAssignments[a.name] ? '#e3f2fd' : '#f5f5f5',
                                                        '&:hover': { backgroundColor: '#f0f0f0' }
                                                    }}
                                                    onClick={() => {
                                                        setVisibleAssignments(prev => ({
                                                            ...prev,
                                                            [a.name]: !prev[a.name]
                                                        }));
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleAssignments[a.name] || false}
                                                        onChange={() => {}}
                                                        style={{ marginRight: '8px', cursor: 'pointer' }}
                                                    />
                                                    <span>{a.name}</span>
                                                </Box>
                                            ))}
                                        </Box>
                                    </DialogContent>
                                    <DialogActions>
                                        <Button onClick={() => setSelectorDialogOpen(null)}>Close</Button>
                                    </DialogActions>
                                </Dialog>
                            </Box>
                        );
                    })}
                </Box>

                {/* Main Table with Tree Structure Headers */}
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            {/* FIRST HEADER ROW */}
                            <TableRow sx={{ backgroundColor: '#f9f9f9' }}>
                                <TableCell><strong>Student</strong></TableCell>
                                <TableCell align="center" colSpan={2} sx={{ borderRight: '2px solid #999' }}>
                                    <strong>Summary</strong>
                                </TableCell>
                                
                                {/* Section Headers */}
                                {Object.entries(assignmentsBySection).map(([section, sectionAssignments]) => {
                                    const visibleInSection = sectionAssignments.filter(a => visibleAssignments[a.name]);
                                    if (visibleInSection.length === 0) return null;
                                    
                                    return (
                                        <TableCell key={section} colSpan={visibleInSection.length + 1} align="center" sx={{ borderLeft: '2px solid #999' }}>
                                            <strong>{section}</strong> (Max: {sectionMaxPoints[section] || 0})
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                            
                            {/* SECOND HEADER ROW */}
                            <TableRow sx={{ backgroundColor: '#fafafa' }}>
                                <TableCell />
                                <TableCell align="center" sx={{ borderRight: '1px solid #ccc' }}>
                                    <Box display="flex" alignItems="center" justifyContent="center">
                                        <strong>Total</strong>
                                        <IconButton size="small" onClick={() => handleSort('total')}>
                                            {sortBy === 'total' ? (sortAsc ? <ArrowUpward fontSize="inherit"/> : <ArrowDownward fontSize="inherit"/>) : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>}
                                        </IconButton>
                                    </Box>
                                </TableCell>
                                <TableCell align="center" sx={{ borderRight: '2px solid #999' }}>
                                    <strong>Final %</strong>
                                </TableCell>
                                
                                {/* Section Total + Assignment Sub-headers */}
                                {Object.entries(assignmentsBySection).map(([section, sectionAssignments]) => {
                                    const visibleInSection = sectionAssignments.filter(a => visibleAssignments[a.name]);
                                    if (visibleInSection.length === 0) return null;
                                    
                                    return (
                                        <>
                                            <TableCell align="center" sx={{ borderRight: '1px solid #ccc', borderLeft: '2px solid #999' }}>
                                                <Box display="flex" alignItems="center" justifyContent="center">
                                                    <strong>{section} Total</strong>
                                                    <IconButton size="small" onClick={() => handleSort(section)}>
                                                        {sortBy === section ? (sortAsc ? <ArrowUpward fontSize="inherit"/> : <ArrowDownward fontSize="inherit"/>) : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>}
                                                    </IconButton>
                                                </Box>
                                            </TableCell>
                                            {visibleInSection.map(a => (
                                                <TableCell key={a.name} align="center" sx={{ minWidth: '60px' }}>
                                                    <Box display="flex" alignItems="center" justifyContent="center">
                                                        <strong style={{ fontSize: '11px' }}>{a.name}</strong>
                                                        <IconButton size="small" onClick={() => handleSort(a.name)}>
                                                            {sortBy === a.name ? (sortAsc ? <ArrowUpward fontSize="inherit"/> : <ArrowDownward fontSize="inherit"/>) : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>}
                                                        </IconButton>
                                                    </Box>
                                                </TableCell>
                                            ))}
                                        </>
                                    );
                                })}
                            </TableRow>
                        </TableHead>
                        
                        <TableBody>
                            {sortedStudents.map(stu => (
                                <TableRow key={stu.email}>
                                    {/* Student Info */}
                                    <TableCell>
                                        <Box
                                            sx={{
                                                cursor: 'pointer',
                                                '&:hover': {
                                                    color: '#1976d2',
                                                    textDecoration: 'underline',
                                                }
                                            }}
                                            onClick={() => {
                                                setSelectedStudent({ email: stu.email, name: stu.name });
                                                setProfileOpen(true);
                                            }}
                                        >
                                            <strong>{stu.name}</strong><br/>
                                            <small>{stu.email}</small>
                                        </Box>
                                    </TableCell>
                                    
                                    {/* Summary Scores */}
                                    <TableCell align="center" sx={{ borderRight: '1px solid #ccc' }}>
                                        {stu.total.toFixed(2)}
                                    </TableCell>
                                    <TableCell align="center" sx={{ borderRight: '2px solid #999' }}>
                                        {totalMaxPoints > 0 ? ((stu.total / totalMaxPoints) * 100).toFixed(2) : '0.00'}%
                                    </TableCell>
                                    
                                    {/* Section + Assignment Scores */}
                                    {Object.entries(assignmentsBySection).map(([section, sectionAssignments]) => {
                                        const visibleInSection = sectionAssignments.filter(a => visibleAssignments[a.name]);
                                        if (visibleInSection.length === 0) return null;
                                        
                                        return (
                                            <>
                                                <TableCell align="center" sx={{ borderRight: '1px solid #ccc', borderLeft: '2px solid #999', fontWeight: 'bold' }}>
                                                    {stu.sectionTotals[section]?.toFixed(2) || '0.00'}
                                                </TableCell>
                                                {visibleInSection.map(a => {
                                                    const rawScore = stu.scores[a.name];
                                                    return (
                                                        <TableCell key={a.name} align="center">
                                                            {(rawScore != null && rawScore !== '') ? Number(rawScore).toFixed(2) : 'N/A'}
                                                        </TableCell>
                                                    );
                                                })}
                                            </>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </>
            )}
        </Box>
        )}

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
