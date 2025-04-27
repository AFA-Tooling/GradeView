// website/src/views/conceptMap.js

import React, { useContext, useEffect, useState } from 'react';
import Loader from '../components/Loader';
import ConceptMapTree from '../components/conceptMapTree';
import apiv2 from '../utils/apiv2';
import { StudentSelectionContext } from '../components/StudentSelectionWrapper';

export default function ConceptMap() {
  const { selectedStudent } = useContext(StudentSelectionContext);
  const [outlineData, setOutlineData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedStudent) return;            // nothing to fetch yet
    const fetchMap = async () => {
      setLoading(true);
      try {
        const encoded = encodeURIComponent(selectedStudent);
        const { data: raw } = await apiv2.get(
          `/students/${encoded}/masterymapping`
        );

        // reshape for react-d3-tree
        const treeData = {
          name: selectedStudent,
          nodes: {
            children: Object.entries(raw).map(([section, concepts]) => ({
              name: section,
              children: Object.entries(concepts).map(
                ([conceptName, weekStr]) => ({
                  name: conceptName,
                  data: { data: { week: parseInt(weekStr, 10) } },
                  children: [],
                })
              ),
            })),
          },
        };

        setOutlineData(treeData);
      } catch (err) {
        console.error('Error loading concept map:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMap();
  }, [selectedStudent]);

  if (loading || !outlineData) {
    return (
      <div style={{ padding: 20, fontSize: 18 }}>
        Loading concept map…
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ConceptMapTree outlineData={outlineData} />
    </div>
  );
}
