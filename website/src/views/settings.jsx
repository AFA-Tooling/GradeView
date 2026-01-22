import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Divider,
    Alert,
    Snackbar,
    Chip,
    IconButton,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormHelperText,
    Switch,
    FormControlLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Tab,
    Tabs,
} from '@mui/material';
import {
    Settings as SettingsIcon,
    Save,
    Refresh,
    Info,
    Delete,
    Add,
    ExpandMore,
    School,
    Sync as SyncIcon,
} from '@mui/icons-material';
import PageHeader from '../components/PageHeader';
import apiv2 from '../utils/apiv2';

export default function Settings() {
    const [config, setConfig] = useState(null);
    const [originalConfig, setOriginalConfig] = useState(null);
    const [syncConfig, setSyncConfig] = useState(null);
    const [originalSyncConfig, setOriginalSyncConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [newAdmin, setNewAdmin] = useState('');
    const [tabValue, setTabValue] = useState(0);
    const [expandedCourse, setExpandedCourse] = useState(0);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const [viewResponse, syncResponse] = await Promise.all([
                apiv2.get('/config'),
                apiv2.get('/config/sync')
            ]);
            setConfig(viewResponse.data);
            setOriginalConfig(JSON.parse(JSON.stringify(viewResponse.data)));
            setSyncConfig(syncResponse.data);
            setOriginalSyncConfig(JSON.parse(JSON.stringify(syncResponse.data)));
        } catch (error) {
            showSnackbar('Failed to load configuration', 'error');
            console.error('Error loading config:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        try {
            setSaving(true);
            await Promise.all([
                apiv2.put('/config', config),
                apiv2.put('/config/sync', syncConfig)
            ]);
            setOriginalConfig(JSON.parse(JSON.stringify(config)));
            setOriginalSyncConfig(JSON.parse(JSON.stringify(syncConfig)));
            showSnackbar('Configuration saved successfully', 'success');
        } catch (error) {
            showSnackbar('Failed to save configuration', 'error');
            console.error('Error saving config:', error);
        } finally {
            setSaving(false);
        }
    };

    const resetConfig = () => {
        setConfig(JSON.parse(JSON.stringify(originalConfig)));
        setSyncConfig(JSON.parse(JSON.stringify(originalSyncConfig)));
        showSnackbar('Configuration reset to last saved state', 'info');
    };

    const showSnackbar = (message, severity) => {
        setSnackbar({ open: true, message, severity });
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    const handleSpreadsheetChange = (field, value) => {
        setConfig({
            ...config,
            spreadsheet: {
                ...config.spreadsheet,
                [field]: value,
            },
        });
    };

    const handlePageChange = (page, field, value) => {
        setConfig({
            ...config,
            spreadsheet: {
                ...config.spreadsheet,
                pages: {
                    ...config.spreadsheet.pages,
                    [page]: {
                        ...config.spreadsheet.pages[page],
                        [field]: value,
                    },
                },
            },
        });
    };

    const addAdmin = () => {
        if (newAdmin && newAdmin.includes('@')) {
            if (!config.admins.includes(newAdmin)) {
                setConfig({
                    ...config,
                    admins: [...config.admins, newAdmin],
                });
                setNewAdmin('');
                showSnackbar('Admin added', 'success');
            } else {
                showSnackbar('Admin already exists', 'warning');
            }
        } else {
            showSnackbar('Please enter a valid email address', 'error');
        }
    };

    const removeAdmin = (email) => {
        setConfig({
            ...config,
            admins: config.admins.filter((admin) => admin !== email),
        });
        showSnackbar('Admin removed', 'info');
    };

    const hasChanges = () => {
        return JSON.stringify(config) !== JSON.stringify(originalConfig) ||
               JSON.stringify(syncConfig) !== JSON.stringify(originalSyncConfig);
    };

    // GradeSync specific handlers
    const updateCourse = (index, field, value) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[index] = { ...updatedCourses[index], [field]: value };
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    const updateCourseSection = (courseIndex, section, field, value) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[courseIndex] = {
            ...updatedCourses[courseIndex],
            [section]: { ...updatedCourses[courseIndex][section], [field]: value }
        };
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    const addCourse = () => {
        const newCourse = {
            id: `new_course_${Date.now()}`,
            name: 'New Course',
            department: 'COMPSCI',
            course_number: '0',
            semester: 'Fall',
            year: new Date().getFullYear(),
            instructor: '',
            gradescope: { enabled: false, course_id: '', sync_interval_hours: 24 },
            prairielearn: { enabled: false, course_id: '' },
            iclicker: { enabled: false, course_names: [] },
            spreadsheet: { id: '', scopes: ['https://www.googleapis.com/auth/spreadsheets'] },
            database: { enabled: true, use_as_primary: true },
            assignment_categories: []
        };
        setSyncConfig({ ...syncConfig, courses: [...syncConfig.courses, newCourse] });
        setExpandedCourse(syncConfig.courses.length);
    };

    const removeCourse = (index) => {
        const updatedCourses = syncConfig.courses.filter((_, i) => i !== index);
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
        showSnackbar('Course removed', 'info');
    };

    const addCategory = (courseIndex) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[courseIndex].assignment_categories.push({
            name: 'New Category',
            patterns: []
        });
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    const updateCategory = (courseIndex, catIndex, field, value) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[courseIndex].assignment_categories[catIndex][field] = value;
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    const removeCategory = (courseIndex, catIndex) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[courseIndex].assignment_categories = 
            updatedCourses[courseIndex].assignment_categories.filter((_, i) => i !== catIndex);
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    const addPattern = (courseIndex, catIndex, pattern) => {
        if (pattern.trim()) {
            const updatedCourses = [...syncConfig.courses];
            updatedCourses[courseIndex].assignment_categories[catIndex].patterns.push(pattern.trim());
            setSyncConfig({ ...syncConfig, courses: updatedCourses });
        }
    };

    const removePattern = (courseIndex, catIndex, patternIndex) => {
        const updatedCourses = [...syncConfig.courses];
        updatedCourses[courseIndex].assignment_categories[catIndex].patterns = 
            updatedCourses[courseIndex].assignment_categories[catIndex].patterns.filter((_, i) => i !== patternIndex);
        setSyncConfig({ ...syncConfig, courses: updatedCourses });
    };

    if (loading) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography>Loading configuration...</Typography>
            </Box>
        );
    }

    if (!config || !syncConfig) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">Failed to load configuration</Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader>Settings</PageHeader>
            
            <Alert severity="info" sx={{ mb: 3 }}>
                Configure system-wide settings. Changes will affect all users after saving.
            </Alert>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                    <Tab label="GradeView Configuration" />
                    <Tab label="GradeSync Configuration" icon={<SyncIcon />} iconPosition="start" />
                </Tabs>
            </Box>

            {/* GradeView Configuration Tab */}
            <Box role="tabpanel" hidden={tabValue !== 0}>

            {/* Google Spreadsheet Configuration */}
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Google Spreadsheet Configuration</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                <TextField
                    fullWidth
                    label="Spreadsheet ID"
                    value={config.spreadsheet?.id || ''}
                    onChange={(e) => handleSpreadsheetChange('id', e.target.value)}
                    helperText="The unique identifier of your Google Spreadsheet"
                    sx={{ mb: 2 }}
                />

                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    Grade Page Settings
                </Typography>
                <Box sx={{ pl: 2 }}>
                    <TextField
                        fullWidth
                        label="Page Name"
                        value={config.spreadsheet?.pages?.gradepage?.pagename || ''}
                        onChange={(e) => handlePageChange('gradepage', 'pagename', e.target.value)}
                        helperText="Name of the worksheet containing grade data"
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <TextField
                            label="Assignment Meta Row"
                            type="number"
                            value={config.spreadsheet?.pages?.gradepage?.assignmentMetaRow || 0}
                            onChange={(e) => handlePageChange('gradepage', 'assignmentMetaRow', parseInt(e.target.value))}
                            helperText="Row containing assignment metadata"
                        />
                        <TextField
                            label="Start Row"
                            type="number"
                            value={config.spreadsheet?.pages?.gradepage?.startrow || 0}
                            onChange={(e) => handlePageChange('gradepage', 'startrow', parseInt(e.target.value))}
                            helperText="First row of student data"
                        />
                        <TextField
                            label="Start Column"
                            value={config.spreadsheet?.pages?.gradepage?.startcol || ''}
                            onChange={(e) => handlePageChange('gradepage', 'startcol', e.target.value)}
                            helperText="First column (e.g., 'C')"
                            inputProps={{ maxLength: 2 }}
                        />
                    </Box>
                </Box>

                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    Bin Page Settings
                </Typography>
                <Box sx={{ pl: 2 }}>
                    <TextField
                        fullWidth
                        label="Page Name"
                        value={config.spreadsheet?.pages?.binpage?.pagename || ''}
                        onChange={(e) => handlePageChange('binpage', 'pagename', e.target.value)}
                        helperText="Name of the worksheet containing bin/threshold data"
                        sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Start Cell"
                            value={config.spreadsheet?.pages?.binpage?.startcell || ''}
                            onChange={(e) => handlePageChange('binpage', 'startcell', e.target.value)}
                            helperText="Starting cell (e.g., 'A51')"
                        />
                        <TextField
                            label="End Cell"
                            value={config.spreadsheet?.pages?.binpage?.endcell || ''}
                            onChange={(e) => handlePageChange('binpage', 'endcell', e.target.value)}
                            helperText="Ending cell (e.g., 'B61')"
                        />
                    </Box>
                </Box>
            </Paper>

            {/* Admin Users */}
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Administrator Users</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                <Alert severity="warning" sx={{ mb: 2 }}>
                    Admins have full access to all features including the admin panel and alerts system.
                </Alert>

                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <TextField
                        fullWidth
                        label="Add New Admin"
                        value={newAdmin}
                        onChange={(e) => setNewAdmin(e.target.value)}
                        placeholder="admin@berkeley.edu"
                        helperText="Enter an email address and click Add"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                addAdmin();
                            }
                        }}
                    />
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={addAdmin}
                        sx={{ minWidth: '100px' }}
                    >
                        Add
                    </Button>
                </Box>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {config.admins?.map((admin, index) => (
                        <Chip
                            key={index}
                            label={admin}
                            onDelete={() => removeAdmin(admin)}
                            color="primary"
                            variant="outlined"
                        />
                    ))}
                </Box>
            </Paper>

            {/* Redis Configuration */}
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Redis Configuration</Typography>
                    <Tooltip title="Redis is used for caching and session management">
                        <IconButton size="small" sx={{ ml: 1 }}>
                            <Info fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
                <Divider sx={{ mb: 2 }} />

                <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                        label="Host"
                        value={config.redis?.host || ''}
                        onChange={(e) => setConfig({
                            ...config,
                            redis: { ...config.redis, host: e.target.value }
                        })}
                        helperText="Redis server hostname"
                        fullWidth
                    />
                    <TextField
                        label="Port"
                        type="number"
                        value={config.redis?.port || 6379}
                        onChange={(e) => setConfig({
                            ...config,
                            redis: { ...config.redis, port: parseInt(e.target.value) }
                        })}
                        helperText="Redis server port"
                        sx={{ maxWidth: '150px' }}
                    />
                    <TextField
                        label="Username"
                        value={config.redis?.username || ''}
                        onChange={(e) => setConfig({
                            ...config,
                            redis: { ...config.redis, username: e.target.value }
                        })}
                        helperText="Redis username"
                        fullWidth
                    />
                </Box>
            </Paper>

            {/* Google OAuth */}
            <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <SettingsIcon sx={{ mr: 1 }} />
                    <Typography variant="h6">Google OAuth Configuration</Typography>
                </Box>
                <Divider sx={{ mb: 2 }} />

                <TextField
                    fullWidth
                    label="Client ID"
                    value={config.googleconfig?.oauth?.clientid || ''}
                    onChange={(e) => setConfig({
                        ...config,
                        googleconfig: {
                            ...config.googleconfig,
                            oauth: { ...config.googleconfig?.oauth, clientid: e.target.value }
                        }
                    })}
                    helperText="Google OAuth 2.0 Client ID for authentication"
                />
            </Paper>
            </Box>

            {/* GradeSync Configuration Tab */}
            <Box role="tabpanel" hidden={tabValue !== 1}>
                {syncConfig && (
                    <>
                        {/* Global Settings */}
                        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <SyncIcon sx={{ mr: 1 }} />
                                <Typography variant="h6">Global Sync Settings</Typography>
                            </Box>
                            <Divider sx={{ mb: 2 }} />

                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <TextField
                                    label="CSV Output Directory"
                                    value={syncConfig.global_settings?.csv_output_dir || ''}
                                    onChange={(e) => setSyncConfig({
                                        ...syncConfig,
                                        global_settings: { ...syncConfig.global_settings, csv_output_dir: e.target.value }
                                    })}
                                    helperText="Directory for exported CSV files"
                                    sx={{ flex: 1, minWidth: '200px' }}
                                />
                                <FormControl sx={{ minWidth: '150px' }}>
                                    <InputLabel>Log Level</InputLabel>
                                    <Select
                                        value={syncConfig.global_settings?.log_level || 'INFO'}
                                        onChange={(e) => setSyncConfig({
                                            ...syncConfig,
                                            global_settings: { ...syncConfig.global_settings, log_level: e.target.value }
                                        })}
                                        label="Log Level"
                                    >
                                        <MenuItem value="DEBUG">DEBUG</MenuItem>
                                        <MenuItem value="INFO">INFO</MenuItem>
                                        <MenuItem value="WARNING">WARNING</MenuItem>
                                        <MenuItem value="ERROR">ERROR</MenuItem>
                                    </Select>
                                    <FormHelperText>Logging verbosity</FormHelperText>
                                </FormControl>
                                <TextField
                                    label="Retry Attempts"
                                    type="number"
                                    value={syncConfig.global_settings?.retry_attempts || 3}
                                    onChange={(e) => setSyncConfig({
                                        ...syncConfig,
                                        global_settings: { ...syncConfig.global_settings, retry_attempts: parseInt(e.target.value) }
                                    })}
                                    helperText="Max retry attempts"
                                    sx={{ width: '150px' }}
                                />
                                <TextField
                                    label="Retry Delay (seconds)"
                                    type="number"
                                    value={syncConfig.global_settings?.retry_delay_seconds || 5}
                                    onChange={(e) => setSyncConfig({
                                        ...syncConfig,
                                        global_settings: { ...syncConfig.global_settings, retry_delay_seconds: parseInt(e.target.value) }
                                    })}
                                    helperText="Delay between retries"
                                    sx={{ width: '180px' }}
                                />
                            </Box>
                        </Paper>

                        {/* Courses */}
                        <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <School sx={{ mr: 1 }} />
                                    <Typography variant="h6">Courses</Typography>
                                </Box>
                                <Button startIcon={<Add />} onClick={addCourse} variant="outlined">
                                    Add Course
                                </Button>
                            </Box>
                            <Divider sx={{ mb: 2 }} />

                            {syncConfig.courses?.map((course, courseIndex) => (
                                <Accordion 
                                    key={courseIndex}
                                    expanded={expandedCourse === courseIndex}
                                    onChange={() => setExpandedCourse(expandedCourse === courseIndex ? -1 : courseIndex)}
                                    sx={{ mb: 1 }}
                                >
                                    <AccordionSummary expandIcon={<ExpandMore />}>
                                        <Typography sx={{ fontWeight: 'bold' }}>
                                            {course.name} ({course.department} {course.course_number})
                                        </Typography>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                            {/* Basic Info */}
                                            <Typography variant="subtitle2" color="primary">Basic Information</Typography>
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                <TextField
                                                    label="Course ID"
                                                    value={course.id}
                                                    onChange={(e) => updateCourse(courseIndex, 'id', e.target.value)}
                                                    helperText="Unique identifier"
                                                    sx={{ flex: 1, minWidth: '150px' }}
                                                />
                                                <TextField
                                                    label="Course Name"
                                                    value={course.name}
                                                    onChange={(e) => updateCourse(courseIndex, 'name', e.target.value)}
                                                    sx={{ flex: 2, minWidth: '200px' }}
                                                />
                                                <TextField
                                                    label="Department"
                                                    value={course.department}
                                                    onChange={(e) => updateCourse(courseIndex, 'department', e.target.value)}
                                                    sx={{ width: '120px' }}
                                                />
                                                <TextField
                                                    label="Course #"
                                                    value={course.course_number}
                                                    onChange={(e) => updateCourse(courseIndex, 'course_number', e.target.value)}
                                                    sx={{ width: '100px' }}
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 2 }}>
                                                <FormControl sx={{ minWidth: '120px' }}>
                                                    <InputLabel>Semester</InputLabel>
                                                    <Select
                                                        value={course.semester}
                                                        onChange={(e) => updateCourse(courseIndex, 'semester', e.target.value)}
                                                        label="Semester"
                                                    >
                                                        <MenuItem value="Spring">Spring</MenuItem>
                                                        <MenuItem value="Summer">Summer</MenuItem>
                                                        <MenuItem value="Fall">Fall</MenuItem>
                                                        <MenuItem value="Winter">Winter</MenuItem>
                                                    </Select>
                                                </FormControl>
                                                <TextField
                                                    label="Year"
                                                    type="number"
                                                    value={course.year}
                                                    onChange={(e) => updateCourse(courseIndex, 'year', parseInt(e.target.value))}
                                                    sx={{ width: '100px' }}
                                                />
                                                <TextField
                                                    label="Instructor"
                                                    value={course.instructor}
                                                    onChange={(e) => updateCourse(courseIndex, 'instructor', e.target.value)}
                                                    sx={{ flex: 1 }}
                                                />
                                            </Box>

                                            <Divider sx={{ my: 1 }} />

                                            {/* Integration Settings */}
                                            <Typography variant="subtitle2" color="primary">Integration Settings</Typography>
                                            
                                            {/* Gradescope */}
                                            <Box sx={{ pl: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={course.gradescope?.enabled || false}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'gradescope', 'enabled', e.target.checked)}
                                                        />
                                                    }
                                                    label="Gradescope Enabled"
                                                />
                                                {course.gradescope?.enabled && (
                                                    <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
                                                        <TextField
                                                            label="Course ID"
                                                            value={course.gradescope?.course_id || ''}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'gradescope', 'course_id', e.target.value)}
                                                            sx={{ flex: 1 }}
                                                        />
                                                        <TextField
                                                            label="Sync Interval (hours)"
                                                            type="number"
                                                            value={course.gradescope?.sync_interval_hours || 24}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'gradescope', 'sync_interval_hours', parseInt(e.target.value))}
                                                            sx={{ width: '180px' }}
                                                        />
                                                    </Box>
                                                )}
                                            </Box>

                                            {/* PrairieLearn */}
                                            <Box sx={{ pl: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={course.prairielearn?.enabled || false}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'prairielearn', 'enabled', e.target.checked)}
                                                        />
                                                    }
                                                    label="PrairieLearn Enabled"
                                                />
                                                {course.prairielearn?.enabled && (
                                                    <TextField
                                                        label="Course ID"
                                                        value={course.prairielearn?.course_id || ''}
                                                        onChange={(e) => updateCourseSection(courseIndex, 'prairielearn', 'course_id', e.target.value)}
                                                        fullWidth
                                                        sx={{ mt: 1 }}
                                                    />
                                                )}
                                            </Box>

                                            {/* iClicker */}
                                            <Box sx={{ pl: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={course.iclicker?.enabled || false}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'iclicker', 'enabled', e.target.checked)}
                                                        />
                                                    }
                                                    label="iClicker Enabled"
                                                />
                                                {course.iclicker?.enabled && (
                                                    <Box sx={{ mt: 1 }}>
                                                        <Typography variant="caption">Course Names (one per line)</Typography>
                                                        <TextField
                                                            multiline
                                                            rows={3}
                                                            value={course.iclicker?.course_names?.join('\n') || ''}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'iclicker', 'course_names', e.target.value.split('\n'))}
                                                            fullWidth
                                                        />
                                                    </Box>
                                                )}
                                            </Box>

                                            {/* Database */}
                                            <Box sx={{ pl: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={course.database?.enabled || false}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'database', 'enabled', e.target.checked)}
                                                        />
                                                    }
                                                    label="Database Enabled"
                                                />
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            checked={course.database?.use_as_primary || false}
                                                            onChange={(e) => updateCourseSection(courseIndex, 'database', 'use_as_primary', e.target.checked)}
                                                        />
                                                    }
                                                    label="Use as Primary"
                                                    sx={{ ml: 2 }}
                                                />
                                            </Box>

                                            {/* Spreadsheet */}
                                            <Box sx={{ pl: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                <Typography variant="caption">Spreadsheet Configuration</Typography>
                                                <TextField
                                                    label="Spreadsheet ID"
                                                    value={course.spreadsheet?.id || ''}
                                                    onChange={(e) => updateCourseSection(courseIndex, 'spreadsheet', 'id', e.target.value)}
                                                    fullWidth
                                                    sx={{ mt: 1 }}
                                                />
                                            </Box>

                                            <Divider sx={{ my: 1 }} />

                                            {/* Assignment Categories */}
                                            <Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                    <Typography variant="subtitle2" color="primary">Assignment Categories</Typography>
                                                    <Button size="small" startIcon={<Add />} onClick={() => addCategory(courseIndex)}>
                                                        Add Category
                                                    </Button>
                                                </Box>
                                                {course.assignment_categories?.map((category, catIndex) => (
                                                    <Paper key={catIndex} variant="outlined" sx={{ p: 2, mb: 1 }}>
                                                        <Box sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                                                            <TextField
                                                                label="Category Name"
                                                                value={category.name}
                                                                onChange={(e) => updateCategory(courseIndex, catIndex, 'name', e.target.value)}
                                                                size="small"
                                                                sx={{ flex: 1 }}
                                                            />
                                                            <IconButton 
                                                                size="small" 
                                                                onClick={() => removeCategory(courseIndex, catIndex)}
                                                                color="error"
                                                            >
                                                                <Delete />
                                                            </IconButton>
                                                        </Box>
                                                        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>Patterns:</Typography>
                                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                                                            {category.patterns?.map((pattern, pIndex) => (
                                                                <Chip
                                                                    key={pIndex}
                                                                    label={pattern}
                                                                    onDelete={() => removePattern(courseIndex, catIndex, pIndex)}
                                                                    size="small"
                                                                />
                                                            ))}
                                                        </Box>
                                                        <TextField
                                                            placeholder="Add pattern (press Enter)"
                                                            size="small"
                                                            fullWidth
                                                            onKeyPress={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    addPattern(courseIndex, catIndex, e.target.value);
                                                                    e.target.value = '';
                                                                }
                                                            }}
                                                        />
                                                    </Paper>
                                                ))}
                                            </Box>

                                            <Button
                                                variant="outlined"
                                                color="error"
                                                startIcon={<Delete />}
                                                onClick={() => removeCourse(courseIndex)}
                                                sx={{ mt: 2 }}
                                            >
                                                Remove Course
                                            </Button>
                                        </Box>
                                    </AccordionDetails>
                                </Accordion>
                            ))}
                        </Paper>
                    </>
                )}
            </Box>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
                <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={resetConfig}
                    disabled={!hasChanges()}
                >
                    Reset Changes
                </Button>
                <Button
                    variant="contained"
                    startIcon={<Save />}
                    onClick={saveConfig}
                    disabled={!hasChanges() || saving}
                >
                    {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}
