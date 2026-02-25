import * as React from 'react';
import { useState, useEffect } from 'react';
import { Grid2 } from '@mui/material';
import GradeTable from './GradeTable';


export default function GradeGrid({ category, assignments }) {

    const [cumGrade, setCumGrade] = useState(0);
    const [cumMaxGrade, setCumMaxGrade] = useState(0);

    useEffect(() => {
        // Guard against undefined/null assignments
        if (!assignments || typeof assignments !== 'object') {
            setCumGrade(0);
            setCumMaxGrade(0);
            return;
        }
        
        let cg = 0;
        let cmg = 0;
        Object.values(assignments).forEach((category) => {
            // Handle empty strings and convert to numbers safely
            const studentScore = category.student === "" ? 0 : +(category.student || 0);
            const maxScore = category.max === "" ? 0 : +(category.max || 0);
            cg += studentScore;
            cmg += maxScore;
        })
        setCumGrade(Math.round(cg * 100) / 100);
        setCumMaxGrade(Math.round(cmg * 100) / 100);
    }, [assignments]);

    const headerRight = `${cumGrade} / ${cumMaxGrade}`;

    return (
        <Grid2 xs={2} sm={4} md={4} sx={{ minWidth: '20%' }}>
            <GradeTable assignments={assignments} headerLeft={category} headerRight={headerRight} />
        </Grid2>
    );
}
