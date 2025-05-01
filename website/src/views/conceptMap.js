// src/views/ConceptMap.jsx
import React, { useMemo, useContext } from 'react';
import Loader from '../components/Loader';
import ConceptMapTree from '../components/ConceptMapTree';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';
import { Box, useMediaQuery, Typography } from '@mui/material';
import useFetch from '../utils/useFetch';

export default function ConceptMap() {
  const mobileView = useMediaQuery('(max-width:600px)');
  const { selectedStudent } = useContext(StudentSelectionContext);

  const fetchEmail = useMemo(
    () => selectedStudent || localStorage.getItem('email'),
    [selectedStudent]
  );

  const { data, loading, error } = useFetch(
    `students/${encodeURIComponent(fetchEmail)}/conceptmap`
  );

      // after you’ve got `data` from useFetch…
  const hasCurrWeek = data && data.currentWeek != null; // true if the API sent you a number
  const currWeek = hasCurrWeek
    ? Number(data.currentWeek)        // use the real week
    : Infinity;                       // or some sentinel meaning “don’t color by week”


  

  if (loading) return <Loader />;
  if (error) {
    return (
      <Box p={4}>
        <Typography color="error">
          Error loading concept map: {error.message}
        </Typography>
      </Box>
    );
  }
  if (!data || !data.nodes) {
    return (
      <Box p={4}>
        <Typography>No concept‐map data available.</Typography>
      </Box>
    );
  }

  const dimensions = mobileView
    ? { width: 300, height: 400 }
    : { width: 800, height: 600 };

  // You were using `data.week` for currWeek, but the API doesn't return that
  // at the root. If you have a “current week” elsewhere, pass it here.
  // For now let’s default to a large number so everything shows as “taught”.






  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <ConceptMapTree
        outlineData={data}
        dimensions={dimensions}
        currWeek={currWeek}
        hasCurrWeek={hasCurrWeek}
      />
    </div>
  );
}
