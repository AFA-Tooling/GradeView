import React from 'react';
import { useState, useEffect } from 'react';
import { Accordion, AccordionSummary, Typography, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GradeTable from './GradeTable';

export default function GradeAccordion({ category, assignments }) {

    const [cumGrade, setCumGrade] = useState(0);
    const [cumMaxGrade, setCumMaxGrade] = useState(0);
    const [expanded, setExpanded] = useState(true);

    useEffect(() => {
        let cg = 0;
        let cmg = 0;
        Object.values(assignments).forEach((category) => {
            cg += category.student;
            cmg += category.max;
        })
        setCumGrade(Math.round(cg * 100) / 100);
        setCumMaxGrade(Math.round(cmg * 100) / 100);
    }, [assignments]);

    /**
     * Returns the formatting for the font-weight.
     * @param {Float} student
     * @param {Float} max
     * @returns {String} 'bold' or 'normal'
     */
    function isBold(student, max) {
        if (student === max) {
            return 'bold';
        }
        return 'normal';
    }

    // Code for keeping accordion unhidden
    function handleChange(panel) {
        return (_, newExpanded) => {
            setExpanded(newExpanded ? panel : false);
        };
    }
    const headerLeft = 'Assignment';
    const headerRight = 'Grade';

    return (
        <>
            <Accordion expanded={expanded} onChange={handleChange(true)}>
                <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    aria-controls='panel1a-content'
                    id='panel1a-header'>
                    <Typography>{category}</Typography>
                    <Typography sx={{ marginLeft: 'auto', pr: 1, fontWeight: isBold(cumGrade, cumMaxGrade) }}>
                        {cumGrade} / {cumMaxGrade}
                    </Typography>
                </AccordionSummary>
                <AccordionDetails>
                    <GradeTable assignments={assignments} headerLeft={headerLeft} headerRight={headerRight} />
                </AccordionDetails>
            </Accordion>
        </>
    );
}
