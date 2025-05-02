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

  // compute currentWeek flag
  const hasCurrWeek = data && data.currentWeek != null;
  const currWeek = hasCurrWeek ? Number(data.currentWeek) : Infinity;

  // dynamic dimensions for the full viewport (minus AppBar)
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight - 64,
  });
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - 64,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  return (
    <Box
      className="concept-map-container"
      sx={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 64px)',
        overflow: 'auto',
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
