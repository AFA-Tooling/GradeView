// src/components/StudentSelectionWrapper.jsx
import React, { createContext, useState } from 'react';

export const StudentSelectionContext = createContext();

export default function StudentSelectionWrapper({ children }) {
  // Pull your email out of localStorage (set by the login step)
  const storedEmail = localStorage.getItem('email') || '';
  const [selectedStudent, setSelectedStudent] = useState(storedEmail);

  return (
    <StudentSelectionContext.Provider value={{ selectedStudent, setSelectedStudent }}>
      {children}
    </StudentSelectionContext.Provider>
  );
}
