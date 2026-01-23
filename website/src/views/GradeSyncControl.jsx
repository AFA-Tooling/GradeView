import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Typography, 
    Button, 
    Paper, 
    FormControl, 
    InputLabel, 
    Select, 
    MenuItem, 
    Alert, 
    CircularProgress,
    Divider
} from '@mui/material';
import { Refresh, Sync as SyncIcon } from '@mui/icons-material';
import apiv2 from '../utils/apiv2';

export default function GradeSyncControl() {
    const [courses, setCourses] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const fetchCourses = () => {
        setLoadingCourses(true);
        setError(null);
        apiv2.get('/admin/sync')
            .then(res => {
                if (res.data && res.data.courses) {
                    setCourses(res.data.courses);
                    // Default to first course if available
                    if (res.data.courses.length > 0 && !selectedCourse) {
                        setSelectedCourse(res.data.courses[0].id);
                    }
                }
            })
            .catch(err => {
                console.error("Failed to fetch courses", err);
                setError("Failed to load courses from GradeSync service. Is the service running?");
            })
            .finally(() => setLoadingCourses(false));
    };

    useEffect(() => {
        fetchCourses();
    }, []);

    const handleSync = () => {
        if (!selectedCourse) return;
        
        setSyncing(true);
        setResult(null);
        setError(null);
        
        apiv2.post(`/admin/sync/${selectedCourse}`)
            .then(res => {
                setResult(res.data);
            })
            .catch(err => {
                console.error("Sync failed", err);
                setError(err.response?.data?.detail || err.response?.data?.error || err.message || "Sync failed");
            })
            .finally(() => setSyncing(false));
    };

    return (
        <Box px={4} py={4}>
            <Paper elevation={0} sx={{ p: 4, border: '1px solid #e5e7eb', borderRadius: 2, maxWidth: 800 }}>
                <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                        GradeSync Control
                    </Typography>
                    <Button 
                        startIcon={<Refresh />} 
                        onClick={fetchCourses} 
                        disabled={loadingCourses || syncing}
                        size="small"
                    >
                        Refresh Courses
                    </Button>
                </Box>

                <Box mb={4}>
                    <Typography variant="body2" color="textSecondary" paragraph>
                        Select a course to synchronize grades from Gradescope, PrairieLearn, and iClicker.
                        This process may take several minutes.
                    </Typography>
                    
                    <Box display="flex" gap={2} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Course</InputLabel>
                            <Select
                                value={selectedCourse}
                                label="Course"
                                onChange={(e) => setSelectedCourse(e.target.value)}
                                disabled={loadingCourses || syncing || courses.length === 0}
                            >
                                {courses.map(c => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {c.name} ({c.id})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        
                        <Button 
                            variant="contained" 
                            color="primary" 
                            startIcon={syncing ? <CircularProgress size={20} color="inherit" /> : <SyncIcon />}
                            onClick={handleSync}
                            disabled={!selectedCourse || syncing}
                        >
                            {syncing ? 'Syncing...' : 'Start Sync'}
                        </Button>
                    </Box>
                </Box>
                
                {loadingCourses && (
                     <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'gray' }}>Loading courses...</Typography>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 3 }}>
                        {error}
                    </Alert>
                )}

                {result && (
                    <Box mt={3}>
                        <Divider sx={{ mb: 3 }} />
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                            Last Sync Result
                        </Typography>
                        
                        <Alert severity={result.success !== false ? "success" : "warning"} sx={{ mb: 2 }}>
                            Sync completed.
                        </Alert>
                        
                        <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8f9fa', maxHeight: 400, overflow: 'auto' }}>
                            <pre style={{ margin: 0, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        </Paper>
                    </Box>
                )}
            </Paper>
        </Box>
    );
}
