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

  // ——— HARDCODED LEGEND VALUES ———
  const studentLevels = [
    { name: 'First Steps', color: '#dddddd' },
    { name: 'Needs Practice', color: '#a3d7fc' },
    { name: 'In Progress', color: '#59b0f9' },
    { name: 'Almost There', color: '#3981c1' },
    { name: 'Mastered', color: '#20476a' },
  ];
  const classLevels = [
    { name: 'Not Taught', color: '#dddddd' },
    { name: 'Taught', color: '#8fbc8f' },
  ];

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
      }}
    >
      {/* === LEGEND ROW 1: student‐mastery rings === */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mt: 0.8,
          mb: 0.5
        }}
      >
        {studentLevels.map((lvl) => {
          const bg = lvl.color + '33'; // ~20% opacity
          return (
            <Box
              key={lvl.name}
              sx={{
                m: 1,
                width: 60,
                height: 60,
                borderRadius: '50%',
                border: `10px solid ${lvl.color}`,
                backgroundColor: bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography
                variant="subtitle1"
                align="center"
                sx={{ color: '#000', fontSize: '0.7rem', px: 1 }}
              >
                {lvl.name}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* === LEGEND ROW 2: taught / not‐taught bars === */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          mt: 0.5,
          mb: 2
        }}
      >
        {classLevels.map((lvl) => (
          <Box
            key={lvl.name}
            sx={{
              m: 1,
              pt: '24px',
              width: 100,
              borderBottom: `4px solid ${lvl.color}`,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="subtitle1"
              align="center"
              sx={{ color: '#000', fontSize: '0.9rem' }}
            >
              {lvl.name}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* === YOUR EXISTING TREE === */}
      <ConceptMapTree
        outlineData={data}
        currWeek={currWeek}
        hasCurrWeek={hasCurrWeek}
      />
    </Box>
  );
}
