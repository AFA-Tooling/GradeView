import * as React from 'react';
import { useState, useEffect } from 'react';
import { Grid2 } from '@mui/material';
import GradeTable from './GradeTable';


export default function GradeGrid({ category, assignments }) {

    const [cumGrade, setCumGrade] = useState(0);
    const [cumMaxGrade, setCumMaxGrade] = useState(0);


    useEffect(() => {
        let cg = 0;
        let cmg = 0;
        Object.values(assignments).forEach((category) => {
            cg += +(category.student || 0);
            cmg += +(category.max || 0);
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