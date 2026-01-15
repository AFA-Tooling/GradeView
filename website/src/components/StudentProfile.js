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
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryIcon from '@mui/icons-material/Category';
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
  const [sortMode, setSortMode] = useState('assignment'); // 'assignment' or 'time'

  // Load student detailed data
  useEffect(() => {
    if (!open || !studentEmail) {
      setStudentData(null);
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = sortMode === 'time' 
      ? `/students/${encodeURIComponent(studentEmail)}/grades?sort=time`
      : `/students/${encodeURIComponent(studentEmail)}/grades`;

    apiv2.get(endpoint)
      .then(res => {
        const data = res.data;
        setStudentData(processStudentData(data, studentEmail, studentName, sortMode));
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load student profile:', err);
        setError(err.response?.data?.message || err.response?.data?.error || 'Failed to load student data');
        setLoading(false);
      });
  }, [open, studentEmail, studentName, sortMode]);

  const handleSortModeChange = (event, newMode) => {
    if (newMode !== null) {
      setSortMode(newMode);
    }
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
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5">Student Profile</Typography>
            {studentName && (
              <Typography variant="subtitle1" sx={{ mt: 1 }}>
                {studentName} ({studentEmail})
              </Typography>
            )}
          </Box>
          <ToggleButtonGroup
            value={sortMode}
            exclusive
            onChange={handleSortModeChange}
            size="small"
            sx={{ 
              backgroundColor: 'white',
              '& .MuiToggleButton-root': {
                color: '#1976d2',
                '&.Mui-selected': {
                  backgroundColor: '#1976d2',
                  color: 'white',
                  '&:hover': {
                    backgroundColor: '#1565c0',
                  }
                }
              }
            }}
          >
            <ToggleButton value="assignment">
              <CategoryIcon sx={{ mr: 1, fontSize: 18 }} />
              By Assignment
            </ToggleButton>
            <ToggleButton value="time">
              <AccessTimeIcon sx={{ mr: 1, fontSize: 18 }} />
              By Time
            </ToggleButton>
          </ToggleButtonGroup>
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
            sortMode={sortMode}
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
