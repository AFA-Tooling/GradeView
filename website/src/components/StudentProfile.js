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
  CircularProgress,
  Alert,
} from '@mui/material';
import apiv2 from '../utils/apiv2';
import { processStudentData, getGradeLevel } from '../utils/studentDataProcessor';
import StudentProfileContent from './StudentProfileContent';

/**
 * StudentProfile Component - Dialog Version
 * Displays detailed student profile in a dialog
 */
export default function StudentProfile({ open, onClose, studentEmail, studentName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [studentData, setStudentData] = useState(null);

  // Load student detailed data
  useEffect(() => {
    if (!open || !studentEmail) {
      setStudentData(null);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch both student grades and class category averages
    Promise.all([
      apiv2.get(`/students/${encodeURIComponent(studentEmail)}/grades?format=db`),
      apiv2.get('/students/category-stats')
    ])
      .then(([gradesRes, statsRes]) => {
        const data = gradesRes.data;
        const classAverages = statsRes.data;
        setStudentData(processStudentData(data, studentEmail, studentName, undefined, classAverages));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load student profile:', err);
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load student data');
        setLoading(false);
      });
  }, [open, studentEmail, studentName]);

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
        <Box>
          <Typography variant="h5" sx={{ color: 'white' }}>Student Profile</Typography>
          {studentName && (
            <Typography variant="subtitle2" sx={{ mt: 1, color: 'rgba(255,255,255,0.9)' }}>
              {studentName} ({studentEmail})
            </Typography>
          )}
        </Box>
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
          <StudentProfileContent 
            studentData={studentData} 
            getGradeLevel={getGradeLevel}
          />
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
