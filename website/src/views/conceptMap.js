import React, { useMemo, useContext, useState, useEffect } from 'react';
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

  const hasCurrWeek = data && data.currentWeek != null;
  const currWeek = hasCurrWeek ? Number(data.currentWeek) : Infinity;

  if (loading) return <Loader />;
  if (error)
    return (
      <Box p={4}>
        <Typography color="error">
          Error loading concept map: {error.message}
        </Typography>
      </Box>
    );
  if (!data || !data.nodes)
    return (
      <Box p={4}>
        <Typography>No concept‐map data available.</Typography>
      </Box>
    );
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
      }}
    >
      <ConceptMapTree
        outlineData={data}
        currWeek={currWeek}
        hasCurrWeek={hasCurrWeek}
      />
    </Box>
  );
}

