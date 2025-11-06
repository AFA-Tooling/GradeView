import React, { useEffect, useState } from 'react'
import { Box, useMediaQuery } from '@mui/material';
import apiv2 from '../utils/apiv2';
import BinTable from '../components/BinTable';
import Loader from '../components/Loader';

export default function Buckets() {

    const minMedia = useMediaQuery('(min-width:600px)');
    const [binRows, setBins] = useState([]);
    const [loadCount, setLoadCount] = useState(0);

    const [gradingRows, setGradingRows] = useState([]);

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
                
                let tempBins = [];
                if (binsData && Array.isArray(binsData) && binsData.length > 0) {
                    console.log(`Processing ${binsData.length} bins...`);
                    console.log('Raw bins data:', JSON.stringify(binsData, null, 2));
                    
                    // Sort bins by points (ascending) to ensure correct order
                    const sortedBins = [...binsData].sort((a, b) => {
                        const aPoints = a?.points ?? 0;
                        const bPoints = b?.points ?? 0;
                        return aPoints - bPoints;
                    });
                    
                    console.log('Sorted bins:', JSON.stringify(sortedBins, null, 2));
                    
                    // Iterate backwards to display from highest to lowest grade
                    for (let i = sortedBins.length - 1; i >= 0; i--) {
                        const bin = sortedBins[i];
                        console.log(`Processing bin at index ${i}:`, bin);
                        if (bin && bin.letter && bin.points !== undefined) {
                            const grade = bin.letter;
                            // Lower bound is the previous grade's points (or 0 for the lowest grade)
                            // Since we're iterating backwards, i-1 is the next lower bin in sorted order
                            const lower = (i > 0) ? +sortedBins[i - 1].points : 0;
                            const range = `${lower}-${bin.points}`;
                            tempBins.push({ grade, range });
                            console.log(`✓ Added bin: ${grade} with range ${range}`);
                        } else {
                            console.warn(`✗ Skipping invalid bin at index ${i}:`, bin);
                        }
                    }
                } else {
                    console.warn('No bins data found or bins array is empty. binsData:', binsData);
                }
                
                console.log(`Final tempBins (${tempBins.length} items):`, tempBins);
                
                // Fallback to hardcoded bins if processing failed or returned empty
                // Always ensure we have bins to display
                if (tempBins.length === 0) {
                    console.warn('No bins processed, using hardcoded fallback');
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
                    console.log('Setting fallback bins:', fallbackBins);
                    setBins(fallbackBins);
                } else {
                    console.log('Setting processed bins:', tempBins);
                    setBins(tempBins);
                }
                
                // Process grading breakdown from spreadsheet
                const assignmentPoints = res.data.assignment_points || {};
                if (Object.keys(assignmentPoints).length > 0) {
                    // Convert assignment_points object to array of rows
                    // Preserve the order from the spreadsheet (as stored in Redis)
                    const breakdownRows = Object.entries(assignmentPoints)
                        .map(([assignment, points]) => ({ assignment, points }));
                    // Note: Order is preserved from spreadsheet, no sorting needed
                    setGradingRows(breakdownRows);
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

    return (
        <>
            {loadCount > 0 ? (<Loader />) : (
                <>
                    <Box sx={minMedia ?
                        { mt: 4, display: 'flex', flexBasis: 'min-content', justifyContent: 'center', gap: '10%' } :
                        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }
                    }
                    >
                        <BinTable title='Grading Breakdown' col1='Component' col2='Points' rows={gradingRows} keys={['assignment', 'points']} />
                        <BinTable 
                            title='boyyyyy' 
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
