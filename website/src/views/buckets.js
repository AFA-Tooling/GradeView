import React, { useEffect, useState, useContext } from 'react'
import { Box, useMediaQuery, Typography } from '@mui/material';
import apiv2 from '../utils/apiv2';
import BinTable from '../components/BinTable';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';

export default function Buckets({ embedded = false }) {
    const { selectedStudent } = useContext(StudentSelectionContext);

    const minMedia = useMediaQuery('(min-width:600px)');
    const [binRows, setBins] = useState([]);
    const [loadCount, setLoadCount] = useState(0);
    const [gradingRows, setGradingRows] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [needsSelection, setNeedsSelection] = useState(false);

    // Check if user is admin
    useEffect(() => {
        let mounted = true;
        apiv2.get('/isadmin')
            .then((res) => {
                if (mounted) {
                    const adminStatus = res?.data?.isAdmin === true;
                    setIsAdmin(adminStatus);
                    // If admin and no student selected, show message
                    if (adminStatus && !selectedStudent && !localStorage.getItem('email')) {
                        setNeedsSelection(true);
                    }
                }
            })
            .catch(() => {
                if (mounted) setIsAdmin(false);
            });
        return () => { mounted = false; };
    }, [selectedStudent]);

    useEffect(() => {
        let mounted = true;
        setLoadCount(i => i + 1);
        apiv2.get('/bins').then((res) => {
            if (mounted) {
                console.log('Bins API response:', res.data);
                console.log('Response type:', typeof res.data);
                console.log('Is array?', Array.isArray(res.data));
                console.log('Has bins property?', res.data && res.data.bins);
                
                // Process bins
                // Handle both new format { bins: [...], assignment_points: {...} } and old format (just array)
                let binsData = [];
                if (res.data) {
                    if (Array.isArray(res.data)) {
                        // Old format: direct array
                        console.log('Using old format (direct array)');
                        binsData = res.data;
                    } else if (res.data.bins && Array.isArray(res.data.bins)) {
                        // New format: object with bins property
                        console.log('Using new format (object with bins property)');
                        binsData = res.data.bins;
                    } else {
                        console.error('Unexpected response format:', res.data);
                    }
                }
                
                console.log('Processed binsData:', binsData);
                console.log('binsData length:', binsData ? binsData.length : 'null/undefined');
                
                // Always use the standard bins format for display
                // The database bins may be used for calculations, but we display the standard format
                console.log('Using standard bins format for display');
                const standardBins = [
                    { grade: 'A+', range: '390-400' },
                    { grade: 'A', range: '370-390' },
                    { grade: 'A-', range: '360-370' },
                    { grade: 'B+', range: '350-360' },
                    { grade: 'B', range: '330-350' },
                    { grade: 'B-', range: '320-330' },
                    { grade: 'C+', range: '310-320' },
                    { grade: 'C', range: '290-310' },
                    { grade: 'C-', range: '280-290' },
                    { grade: 'D', range: '240-280' },
                    { grade: 'F', range: '0-240' }
                ];
                console.log('Setting standard bins:', standardBins);
                setBins(standardBins);
                
                // Process grading breakdown from spreadsheet
                const assignmentPoints = res.data.assignment_points || {};
                if (Object.keys(assignmentPoints).length > 0) {
                    // Check if we have individual labs (Lab0, Lab1, etc.)
                    const labPattern = /^Lab\d+$/i; // Matches Lab0, Lab1, Lab2, etc.
                    const hasIndividualLabs = Object.keys(assignmentPoints).some(key => labPattern.test(key));
                    
                    if (hasIndividualLabs) {
                        // Calculate total labs points
                        let labsTotal = 0;
                        Object.entries(assignmentPoints).forEach(([assignment, points]) => {
                            if (labPattern.test(assignment)) {
                                labsTotal += Number(points) || 0;
                            }
                        });
                        
                        // Use standard format with calculated labs total
                        console.log(`Individual labs detected (total: ${labsTotal}), using standard format`);
                        const standardRows = [
                            { assignment: 'Quest', points: 25 },
                            { assignment: 'Midterm', points: 50 },
                            { assignment: 'Postterm', points: 75 },
                            { assignment: 'Project 1: Wordle™-lite', points: 15 },
                            { assignment: 'Project 2: Spelling-Bee', points: 25 },
                            { assignment: 'Project 3: 2048', points: 35 },
                            { assignment: 'Project 4: Explore', points: 20 },
                            { assignment: 'Final Project', points: 60 },
                            { assignment: 'Labs', points: 80 },
                            { assignment: 'Attendance / Participation', points: 15 }
                        ];
                        setGradingRows(standardRows);
                    } else {
                        // Use the data as-is if it's already in the correct format
                        const breakdownRows = Object.entries(assignmentPoints)
                            .map(([assignment, points]) => ({ assignment, points }));
                        setGradingRows(breakdownRows);
                    }
                } else {
                    // Fallback to hardcoded values if no data from spreadsheet
                    const fallbackRows = [
                        { assignment: 'Quest', points: 25 },
                        { assignment: 'Midterm', points: 50 },
                        { assignment: 'Postterm', points: 75 },
                        { assignment: 'Project 1: Wordle™-lite', points: 15 },
                        { assignment: 'Project 2: Spelling-Bee', points: 25 },
                        { assignment: 'Project 3: 2048', points: 35 },
                        { assignment: 'Project 4: Explore', points: 20 },
                        { assignment: 'Final Project', points: 60 },
                        { assignment: 'Labs', points: 80 },
                        { assignment: 'Attendance / Participation', points: 15 }
                    ];
                    setGradingRows(fallbackRows);
                }
            }
        }).catch((err) => {
            console.error('Error fetching bins:', err);
            if (mounted) {
                // Use hardcoded fallback on error
                const fallbackBins = [
                    { grade: 'A+', range: '390-400' },
                    { grade: 'A', range: '370-390' },
                    { grade: 'A-', range: '360-370' },
                    { grade: 'B+', range: '350-360' },
                    { grade: 'B', range: '330-350' },
                    { grade: 'B-', range: '320-330' },
                    { grade: 'C+', range: '310-320' },
                    { grade: 'C', range: '290-310' },
                    { grade: 'C-', range: '280-290' },
                    { grade: 'D', range: '240-280' },
                    { grade: 'F', range: '0-240' }
                ];
                setBins(fallbackBins);
                setGradingRows([]);
            }
        }).finally(() => {
            setLoadCount(i => i - 1);
        });
        return () => mounted = false;
    }, []);

    // Safety check: Ensure we always have bins after loading completes
    useEffect(() => {
        if (loadCount === 0 && binRows.length === 0) {
            console.warn('No bins found after API call completed, setting fallback bins');
            const fallbackBins = [
                { grade: 'A+', range: '390-400' },
                { grade: 'A', range: '370-390' },
                { grade: 'A-', range: '360-370' },
                { grade: 'B+', range: '350-360' },
                { grade: 'B', range: '330-350' },
                { grade: 'B-', range: '320-330' },
                { grade: 'C+', range: '310-320' },
                { grade: 'C', range: '290-310' },
                { grade: 'C-', range: '280-290' },
                { grade: 'D', range: '240-280' },
                { grade: 'F', range: '0-240' }
            ];
            setBins(fallbackBins);
        }
    }, [loadCount, binRows.length]);

    // Debug: Log current state
    console.log('Render - binRows:', binRows, 'length:', binRows.length);
    console.log('Render - gradingRows:', gradingRows, 'length:', gradingRows.length);
    console.log('Render - loadCount:', loadCount);

    // Show message if admin needs to select a student
    if (needsSelection) {
        return (
            <>
                {!embedded && <PageHeader>Buckets</PageHeader>}
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        Please select a student from the dropdown menu in the navigation bar.
                    </Typography>
                </Box>
            </>
        );
    }

    return (
        <>
            {!embedded && <PageHeader>Buckets</PageHeader>}
            {loadCount > 0 ? (<Loader />) : (
                <>
                    <Box sx={minMedia ?
                        { mt: 4, display: 'flex', flexBasis: 'min-content', justifyContent: 'center', gap: '10%' } :
                        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }
                    }
                    >
                        <BinTable title='Grading Breakdown' col1='Component' col2='Points' rows={gradingRows} keys={['assignment', 'points']} />
                        <BinTable 
                            title='Buckets' 
                            col1='Letter Grade' 
                            col2='Range' 
                            rows={binRows} 
                            keys={['grade', 'range']} 
                        />
                        {/* Debug: Show if bins are empty */}
                        {binRows.length === 0 && (
                            <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', color: 'white', borderRadius: 1 }}>
                                ⚠️ Debug: binRows is empty (length: {binRows.length}). Check console for details.
                            </Box>
                        )}
                    </Box>
                </>
            )
            }
        </>
    );
}
