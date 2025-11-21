// src/views/admin.jsx
import React, { useState, useEffect, useMemo } from 'react';
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
import apiv2 from '../utils/apiv2';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
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
  const [scoreSelected, setScoreSelected]         = useState(null); // The score that was clicked
  const [studentsByScore, setStudentsByScore]     = useState([]); // Students with that score
  const [studentsByScoreLoading, setStudentsByScoreLoading] = useState(false);
  const [studentsByScoreError, setStudentsByScoreError] = useState(null);

  const [sortBy, setSortBy]   = useState(null); // 'Quest','Midterm','Labs','total' or assignment.name
  const [sortAsc, setSortAsc] = useState(true);


  // --- EMAIL FORM STATE ---
  const [mailRecipient, setMailRecipient] = useState(''); // Email address to send the list to
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailSending, setMailSending] = useState(false);
  const [mailResult, setMailResult] = useState(null); // { success: boolean, message: string }
  const handleSort = col => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else {
      setSortBy(col);
      setSortAsc(true);
    }
  };

  /** 1) Load assignment categories **/
  useEffect(() => {
    apiv2.get('/admin/categories')
      .then(res => {
        const data = res.data;
        const items = Object.entries(data)
          .flatMap(([section, obj]) =>
            Object.keys(obj).map(name => ({ section, name }))
          );
        setAssignments(items);
        setFiltered(items);
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
    console.log('Fetching stats for', section, name);
    Promise.all([
      apiv2.get(`/admin/stats/${encodeURIComponent(section)}/${encodeURIComponent(name)}`),
      apiv2.get(`/admin/distribution/${encodeURIComponent(section)}/${encodeURIComponent(name)}`)
    ])
      .then(([statsRes, distRes]) => {
        setStats(statsRes.data);
        console.log('Distribution data:', distRes.data);
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

  /** 5) Compute section totals + overall total per student **/
  const studentWithTotals = useMemo(() => {
    return studentScores.map(stu => {
      const sectionTotals = {};
      ['Quest','Midterm','Labs'].forEach(sec => {
        sectionTotals[sec] = allAssignments
          .filter(a => a.section === sec)
          .reduce((sum, a) => {
            const raw = stu.scores[sec]?.[a.name];
            return sum + ((raw != null && raw !== '') ? +raw : 0);
          }, 0);
      });
      const total = Object.values(sectionTotals).reduce((s, v) => s + v, 0);
      return { ...stu, sectionTotals, total };
    });
  }, [studentScores, allAssignments]);

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
        const sec = allAssignments.find(x => x.name === sortBy)?.section;
        aVal = +(a.scores[sec]?.[sortBy] ?? 0);
        bVal = +(b.scores[sec]?.[sortBy] ?? 0);
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return arr;
  }, [studentWithTotals, sortBy, sortAsc, allAssignments]);

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
    // 'data' here is the data point clicked: {score: N, count: M}
    if (!selected) return; // Should not happen if dialog is open

    setScoreSelected(data.score);
    setScoreDetailOpen(true);
  };

  /** Close the student list dialog **/
  const handleCloseScoreDialog = () => {
    setScoreDetailOpen(false);
    setScoreSelected(null);
    setStudentsByScore([]); // Clear previous data
    setStudentsByScoreError(null);
  };


  const handleGenerateMailto = () => {
      if (!studentsByScore || !studentsByScore.length || !selected || scoreSelected == null) {
          alert('Student list, assignment name, or score data is missing.');
          return;
      }

      const assignmentName = selected.name;
      const score = scoreSelected;
      
      // 1. 格式化学生列表为纯文本
      const studentListText = studentsByScore
          .map(stu => `- ${stu.name} (${stu.email})`)
          .join('\n');

      // 2. 构造邮件正文
      // 使用 mailBody（可选的用户输入前缀）和格式化的数据
      const emailBodyContent = `${mailBody ? mailBody + '\n\n' : ''}` + 
                              `---\n` +
                              `Assignment: ${assignmentName}\n` +
                              `Score: ${score}\n` +
                              `---\n\n` +
                              `Students who achieved this score:\n${studentListText}`;

      // 3. 确定收件人和主题
      const recipient = mailRecipient || '';
      const subject = mailSubject || `Score List for ${assignmentName}`;

      // 4. 编码数据以确保在 URL 中安全传递
      const mailto = `mailto:${encodeURIComponent(recipient)}` + 
                    `?subject=${encodeURIComponent(subject)}` + 
                    `&body=${encodeURIComponent(emailBodyContent)}`;
      
      const link = document.createElement('a');
      
      // 3. 设置 mailto 链接作为 href
      link.href = mailto;
      
      // 4. 🌟 关键：设置 target="_blank" 让其在新窗口打开
      link.target = '_blank'; 
      
      // 5. 将链接添加到文档中 (必须步骤)
      document.body.appendChild(link);
      
      // 6. 模拟点击链接
      link.click();
      
      // 7. 清理：从文档中移除临时链接
      document.body.removeChild(link);
  };

  useEffect(() => {
    if (scoreSelected == null || !selected) {
      setStudentsByScore([]);
      return;
    }
    setStudentsByScoreLoading(true);
    setStudentsByScoreError(null);
    const { section, name } = selected; // The currently selected assignment
    const score = scoreSelected;

    console.log(`Fetching students for ${section}/${name} with score ${score}`);
    apiv2.get(`/admin/studentScores/${encodeURIComponent(section)}/${encodeURIComponent(name)}/${score}`)
      .then(res => {
        // Assume API returns [{name, email, score}]
        setStudentsByScore(res.data.students);
      })
      .catch(err => setStudentsByScoreError(err.message || 'Failed to load students for this score'))
      .finally(() => setStudentsByScoreLoading(false));
  }, [scoreSelected, selected]); // Rerun when scoreSelected or selected assignment changes

  return (
    <>
      <PageHeader>Admin</PageHeader>

      {/* Tabs */}
      <Box px={10} pt={4}>
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
            <Grid container spacing={2}>
            {filtered.map((item, i) => (
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
                {distribution && (
                <Box mt={4} height={300}>
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={distribution.freq.map((count, index) => ({ 
                          score: distribution.minScore + index, 
                          count}))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                        dataKey="score"
                        allowDecimals={false}
                        label={{ value: 'Score', position: 'insideBottomRight', offset: -5 }}
                        />
                        <YAxis
                        allowDecimals={false}
                        label={{ value: 'Count', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip />

                        <Bar
                        dataKey="count"
                        barSize={Math.max(5, Math.floor(400 / distribution.freq.length))}
                        onClick={handleScoreClick}
                        >
                        <LabelList dataKey="count" position="top" />
                        </Bar>

                    </BarChart>
                    </ResponsiveContainer>
                </Box>
                )}
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
            Students with Score **{scoreSelected}** on **{selected?.name}**
        </DialogTitle>


        <DialogContent>
            {studentsByScoreLoading && <Typography>Loading student list…</Typography>}
            {studentsByScoreError && <Alert severity="error">{studentsByScoreError}</Alert>}

            {!studentsByScoreLoading && !studentsByScoreError && (
            <TableContainer component={Paper}>
                <Table size="small">
                <TableHead>
                    <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Email</strong></TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {studentsByScore.map((stu, i) => (
                    <TableRow key={i}>
                        <TableCell>{stu.name}</TableCell>
                        <TableCell>{stu.email}</TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </TableContainer>
            )}

            {!studentsByScoreLoading && !studentsByScore && !studentsByScoreError && (
            <Typography>No students found with this score.</Typography>
            )}

            <Box mt={4} sx={{ borderTop: 1, borderColor: 'divider', pt: 3 }}>
                <Typography variant="h6" gutterBottom>
                    📧 Email Student List To
                </Typography>
                
                {mailResult && (
                    <Alert severity={mailResult.success ? "success" : "error"} sx={{ mb: 2 }}>
                        {mailResult.message}
                    </Alert>
                )}
                
                {/* 1. Recipient Email */}
                <Box mb={2}> 
                    <TextField
                        fullWidth
                        label="Recipient Email (e.g., admin@example.com)"
                        value={mailRecipient}
                        onChange={e => { setMailRecipient(e.target.value); setMailResult(null); }}
                        size="small"
                    />
                </Box>
                
                {/* 2. Subject */}
                <Box mb={2}>
                    <TextField
                        fullWidth
                        label="Subject (e.g., Score List for Quest 1)"
                        value={mailSubject}
                        onChange={e => setMailSubject(e.target.value)}
                        size="small"
                    />
                </Box>
                
                {/* 3. Email Body */}
                <Box mb={2}>
                    <TextField
                        fullWidth
                        label="Email Body (Optional intro text)"
                        multiline
                        rows={3}
                        value={mailBody}
                        onChange={e => setMailBody(e.target.value)}
                        size="small"
                        placeholder="This text will appear above the student list in the email."
                    />
                </Box>
                
                <Box mt={2} display="flex" justifyContent="flex-end">
                  <Button
                        variant="contained"
                        color="primary"
                        onClick={handleGenerateMailto} 
                        // 移除 mailSending 状态，因为它与 mailto 链接无关
                        disabled={!studentsByScore.length}
                        sx={{ ml: 1 }}
                    >
                    Generate Email
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
                <Typography variant="h6" textAlign="center" mb={2}>
                Students
                </Typography>
                <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                    <TableRow>
                        <TableCell><strong>Student</strong></TableCell>

                        {/* Aggregated columns first */}
                        {['Quest','Midterm','Labs','total'].map(col => (
                        <TableCell key={col} align="center">
                            <Box display="flex" alignItems="center" justifyContent="center">
                            <strong>{
                                col === 'total'
                                ? 'Overall Total'
                                : (col === 'Labs' ? 'Lab Total' : col)
                            }</strong>
                            <IconButton size="small" onClick={() => handleSort(col)}>
                                {sortBy === col
                                ? (sortAsc
                                    ? <ArrowUpward fontSize="inherit"/>
                                    : <ArrowDownward fontSize="inherit"/>)
                                : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>
                                }
                            </IconButton>
                            </Box>
                        </TableCell>
                        ))}

                        {/* Then each individual assignment */}
                        {allAssignments.map((a, i) => (
                        <TableCell key={i} align="center">
                            <Box display="flex" alignItems="center" justifyContent="center">
                            <strong>{a.name}</strong>
                            <IconButton size="small" onClick={() => handleSort(a.name)}>
                                {sortBy === a.name
                                ? (sortAsc
                                    ? <ArrowUpward fontSize="inherit"/>
                                    : <ArrowDownward fontSize="inherit"/>)
                                : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>
                                }
                            </IconButton>
                            </Box>
                        </TableCell>
                        ))}

                        {/* Final column header */}
                        <TableCell align="center">
                        <Box display="flex" alignItems="center" justifyContent="center">
                            <strong>Final</strong>
                            <IconButton size="small" onClick={() => handleSort('Final')}>
                            {sortBy === 'Final'
                                ? (sortAsc
                                    ? <ArrowUpward fontSize="inherit"/>
                                    : <ArrowDownward fontSize="inherit"/>)
                                : <ArrowUpward fontSize="inherit" style={{ opacity: 0.3 }}/>
                            }
                            </IconButton>
                        </Box>
                        </TableCell>
                    </TableRow>
                    </TableHead>

                    <TableBody>
                    {sortedStudents.map(stu => (
                        <TableRow key={stu.email}>
                        <TableCell>
                            {stu.name}<br/>
                            <small>{stu.email}</small>
                        </TableCell>

                        {/* Aggregated values */}
                        {['Quest','Midterm','Labs'].map(sec => (
                            <TableCell key={sec} align="center">
                            {stu.sectionTotals[sec]}
                            </TableCell>
                        ))}
                        {/* Overall total */}
                        <TableCell align="center">{stu.total}</TableCell>

                        {/* Individual assignment scores */}
                        {allAssignments.map((a, i) => {
                            const raw = stu.scores[a.section]?.[a.name];
                            return (
                            <TableCell key={i} align="center">
                                {raw != null && raw !== '' ? raw : '—'}
                            </TableCell>
                            );
                        })}

                        {/* Final score cell */}
                        <TableCell align="center">
                            {stu.scores['Exams']?.['Final'] ?? '—'}
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
                </TableContainer>
            </>
            )}
        </Box>
        )}

    </>
  );
}
