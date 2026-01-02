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
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import apiv2 from '../utils/apiv2';
import { processStudentData, getGradeLevel } from '../utils/studentDataProcessor';
import StudentProfileContent from '../components/StudentProfileContent';
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
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const [adminSelectedStudent, setAdminSelectedStudent] = useState('');

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
            setLoadingStudents(true);
            apiv2.get('/students').then((studentsRes) => {
              if (mounted) {
                const studentsList = studentsRes.data.students.map(s => ({
                  name: s[0],
                  email: s[1]
                })).sort((a, b) => a.name.localeCompare(b.name));
                
                setStudents(studentsList);
                setLoadingStudents(false);
                
                // If no student selected, select first one
                if (!selectedStudent && studentsList.length > 0) {
                  setSelectedStudent(studentsList[0].email);
                  setAdminSelectedStudent(studentsList[0].email);
                }
              }
            }).catch(err => {
              console.error('Failed to load students:', err);
              if (mounted) setLoadingStudents(false);
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
    if (isAdmin) {
      return adminSelectedStudent || selectedStudent;
    }
    return localStorage.getItem('email');
  }, [isAdmin, adminSelectedStudent, selectedStudent]);

  const studentName = useMemo(() => {
    if (isAdmin && students.length > 0 && fetchEmail) {
      const student = students.find(s => s.email === fetchEmail);
      return student ? student.name : fetchEmail;
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
    setError(null);
    apiv2.get(`/students/${encodeURIComponent(fetchEmail)}/grades`)
      .then(res => {
        const data = res.data;
        setStudentData(processStudentData(data, fetchEmail, studentName));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load student profile:', err);
        setError('Failed to load student data. Please try again.');
        setStudentData(null);
        setLoading(false);
      });
  }, [fetchEmail, studentName]);

  const handleAdminStudentChange = (event) => {
    const newEmail = event.target.value;
    setAdminSelectedStudent(newEmail);
    setSelectedStudent(newEmail);
  };

  // Show message if admin needs to select a student
  if (needsSelection || !fetchEmail) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Please select a student from the dropdown menu.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#f5f7fa', minHeight: '100vh', pb: 4 }}>
      {/* Page Header with Student Name and Admin Student Selector */}
      <Paper 
        elevation={0} 
        sx={{ 
          p: 3, 
          mb: 3,
          backgroundColor: 'white',
          borderRadius: 0,
          borderBottom: '1px solid #e5e7eb'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h4" component="h1" sx={{ color: '#1e3a8a', fontWeight: 600 }}>
            {studentData?.studentName || studentName || 'Loading...'}
          </Typography>
          
          {/* Admin Student Selector */}
          {isAdmin && (
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel>Select Student</InputLabel>
              <Select
                value={adminSelectedStudent}
                label="Select Student"
                onChange={handleAdminStudentChange}
                disabled={loadingStudents}
              >
                {students.map((student) => (
                  <MenuItem key={student.email} value={student.email}>
                    {student.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
      </Paper>

      <Box sx={{ px: 4 }}>
        {/* Tabs */}
        <Tabs 
          value={tab} 
          onChange={(e, newValue) => setTab(newValue)}
          sx={{ 
            mb: 3,
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: '0.95rem',
              fontWeight: 500
            }
          }}
        >
          <Tab label="Performance Analytics" />
          <Tab label="Buckets" />
          <Tab label="Concept Map" />
      </Tabs>

      {/* Performance Analytics Tab */}
      {tab === 0 && loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}

      {tab === 0 && error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {tab === 0 && studentData && (
        <StudentProfileContent 
          studentData={studentData}
          getGradeLevel={getGradeLevel}
        />
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
      </Box>
    </Box>
  );
}
