import React from 'react';
import { useContext, useEffect, useState } from 'react';
import Loader from '../components/Loader';
import PageHeader from '../components/PageHeader';
import './css/conceptMap.css';
import { StudentSelectionContext } from "../components/StudentSelectionWrapper";
import apiv2 from "../utils/apiv2";
import ConceptMapTree from '../components/ConceptMapTree';
import { Box, useMediaQuery, Typography } from '@mui/material';

// Temporarily render without ErrorBoundary to surface errors


/**
 * The ConceptMap component renders a concept map based on student progress data from the progressQueryString API.
 * 1. This fetches data either for either:
 *    a. A currently logged-in user (student view)
 *    b. A selected student (instructor view)
 * and displays the concept map within an iframe.
 * 2. The concept map iframe src takes in a string of numbers to display a concept map,
 *    a. This makes an API call to the Python Flask application to create the concept map.
 *    b. Each number represents a student's mastery level for a particular concept.
 * 3. The concept nodes are arranged vertically from top to bottom.
 * 4. The list of numerical strings associated with each node is sorted horizontally from left to right.
 *    a. This numerical string is calculated through the Google Sheets data in the JavaScript API call.
 * @component
 * @returns {JSX.Element} The ConceptMap component.
 */
export default function ConceptMap({ embedded = false }) {
    const [loading, setLoading] = useState(false);
    const [outline, setOutline] = useState(null);
    const [needsSelection, setNeedsSelection] = useState(false);

    const { selectedStudent } = useContext(StudentSelectionContext);


    

    // Fetch dynamic outline + mastery directly from API
    useEffect(() => {
        let mounted = true;
        async function run() {
            setLoading(true);
            try {
                // Admins must select a student; students can use stored email
                let email = selectedStudent || localStorage.getItem('email');
                // Detect admin to require selection
                let isAdmin = false;
                try {
                    const adminRes = await apiv2.get('/isadmin');
                    isAdmin = adminRes?.data?.isAdmin === true;
                } catch (_) {}
                if (!email && localStorage.getItem('token')) {
                    // fallback: some flows store jwt but not email; server will validate
                    const token = localStorage.getItem('token');
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1] || ''));
                        email = payload?.email;
                    } catch (_) {}
                }
                if (!email) {
                    if (isAdmin) {
                        setNeedsSelection(true);
                    }
                    setLoading(false);
                    return;
                }
                setNeedsSelection(false);
                const res = await apiv2.get(`/students/${encodeURIComponent(email)}/concept-structure`);
                if (!mounted) return;
                setOutline(res.data);
            } catch (err) {
                console.error('Error fetching concept-structure:', err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        run();
        return () => { mounted = false; };
    }, [selectedStudent]);

    const hasCurrWeek = outline && outline.currentWeek != null;
    const currWeek = hasCurrWeek ? Number(outline.currentWeek) : Infinity;
  
    if (loading) return <Loader />;
    if (needsSelection) {
        return (
            <>
                {!embedded && <PageHeader>Concept Map</PageHeader>}
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        Please select a student from the dropdown menu in the navigation bar.
                    </Typography>
                </Box>
            </>
        );
    }
    if (!outline) return null;
    const hasChildren = Array.isArray(outline?.nodes?.children) && outline.nodes.children.length > 0;
    if (!hasChildren) {
        return (
            <>
                {!embedded && <PageHeader>Concept Map</PageHeader>}
                <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No concept data available yet. Try refreshing after a minute.
                    </Typography>
                </Box>
            </>
        );
    }

  // ——— HARDCODED LEGEND VALUES ———
  const studentLevels = [
    { name: 'First Steps', color: '#dddddd' },
    { name: 'Needs Practice', color: '#ADD8E6' },
    { name: 'In Progress', color: '#89CFF0' },
    { name: 'Almost There', color: '#6495ED' },
    { name: 'Mastered', color: '#0F4D92' },
  ];
  const classLevels = [
    { name: 'Not Taught', color: '#dddddd' },
    { name: 'Taught', color: '#8fbc8f' },
  ];

  return (
    <>
      {!embedded && <PageHeader>Concept Map</PageHeader>}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: embedded ? 'calc(100vh - 200px)' : 'calc(100vh - 64px)',
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
        outlineData={outline}
        currWeek={currWeek}
        hasCurrWeek={hasCurrWeek}
      />
    </Box>
    </>
  );
}
