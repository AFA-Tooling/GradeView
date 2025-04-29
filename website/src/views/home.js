// website/src/views/Home.jsx
import React, { useContext } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import useFetch from '../utils/useFetch';
import Loader from '../components/Loader';
import GradeAccordion from '../components/GradeAccordion';
import GradeGrid from '../components/GradeGrid';
import { Grid2 } from '@mui/material';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';

export default function Home() {
  // 1) Figure out whose grades to fetch:
  const { selectedStudent } = useContext(StudentSelectionContext);
  const email = selectedStudent || localStorage.getItem('email');

  // 2) Are we on mobile?
  const mobileView = useMediaQuery('(max-width:600px)');

  // 3) Fetch the student object (which has .Assignments)
  const {
    data: studentData,
    loading: gradesLoading,
    error: gradesError,
  } = useFetch(`/students/${encodeURIComponent(email)}`);

  // 4) Extract the Assignments map (or empty object)
  const grades = studentData?.Assignments || {};

  // 5) Loading / error states
  if (gradesLoading) return <Loader />;
  if (gradesError)   return <div>Error loading grades.</div>;

  // 6) Convert to [assignmentName, breakdown] entries once
  const entries = Object.entries(grades);

  return (
    <Box sx={{ display: 'flex', flexFlow: 'column', height: '100%' }}>
      {mobileView ? (
        entries.map(([assignmentName, breakdown]) => (
          <GradeAccordion
            key={assignmentName}
            category={assignmentName}
            assignments={breakdown}
          />
        ))
      ) : (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mt: 4,
            width: '100%',
          }}
        >
          <Grid2
            container
            sx={{ width: '100%' }}
            spacing={{ xs: 3, md: 5 }}
            columns={{ xs: 4, sm: 8, md: 12 }}
          >
            {entries.map(([assignmentName, breakdown]) => (
              <GradeGrid
                key={assignmentName}
                category={assignmentName}
                assignments={breakdown}
              />
            ))}
          </Grid2>
        </Box>
      )}
    </Box>
  );
}
