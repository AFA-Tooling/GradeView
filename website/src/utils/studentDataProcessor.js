// src/utils/studentDataProcessor.js

/**
 * Process student grades data into structured format for display
 * @param {Object} data - Raw grades data from API
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @param {string} sortMode - 'assignment' or 'time'
 * @returns {Object} Processed student data
 */
export function processStudentData(data, email, name, sortMode = 'assignment') {
  if (!data || Object.keys(data).length === 0) return null;

  // Handle time-sorted data format
  if (sortMode === 'time' && data.sortBy === 'time' && Array.isArray(data.submissions)) {
    return processTimeSortedData(data.submissions, email, name);
  }

  // Handle assignment-sorted data format (original)
  return processAssignmentSortedData(data, email, name);
}

/**
 * Process time-sorted submission data
 */
function processTimeSortedData(submissions, email, name) {
  const categoriesData = {};
  const assignmentsList = [];
  let totalScore = 0;
  let totalMaxPoints = 0;

  submissions.forEach((submission) => {
    const category = submission.category;
    const assignmentName = submission.name;
    const score = parseFloat(submission.score) || 0;
    const maxPoints = parseFloat(submission.maxPoints) || 0;
    const percentage = submission.percentage || 0;
    const submissionTime = submission.submissionTime;
    const lateness = submission.lateness;

    if (maxPoints > 0) {
      // Add to assignments list with time info
      assignmentsList.push({
        category: category,
        name: assignmentName,
        score: score,
        maxPoints: maxPoints,
        percentage: percentage,
        submissionTime: submissionTime,
        lateness: lateness,
      });

      // Update category data
      if (!categoriesData[category]) {
        categoriesData[category] = {
          scores: [],
          total: 0,
          maxPoints: 0,
          count: 0,
        };
      }

      categoriesData[category].scores.push({
        name: assignmentName,
        score: score,
        maxPoints: maxPoints,
        percentage: percentage,
      });
      categoriesData[category].total += score;
      categoriesData[category].maxPoints += maxPoints;
      categoriesData[category].count++;

      totalScore += score;
      totalMaxPoints += maxPoints;
    }
  });

  // Calculate category percentages and averages
  Object.keys(categoriesData).forEach(category => {
    const data = categoriesData[category];
    data.percentage = data.maxPoints > 0 ? (data.total / data.maxPoints) * 100 : 0;
    data.average = data.count > 0 ? data.total / data.count : 0;
  });

  const categoryPercentages = Object.values(categoriesData).map(d => d.percentage);
  const overallAvg = categoryPercentages.length > 0 
    ? parseFloat((categoryPercentages.reduce((sum, p) => sum + p, 0) / categoryPercentages.length).toFixed(2))
    : 0;

  const radarData = Object.entries(categoriesData).map(([category, data]) => ({
    category: category,
    percentage: parseFloat(data.percentage.toFixed(2)),
    score: parseFloat(data.total.toFixed(2)),
    maxPoints: parseFloat(data.maxPoints.toFixed(2)),
    average: overallAvg,
    fullMark: 100,
  }));

  const trendData = assignmentsList.map((a, idx) => ({
    index: idx + 1,
    name: `${a.category}-${a.name}`,
    percentage: a.percentage,
    category: a.category,
    submissionTime: a.submissionTime, // Include submission time for tooltip
  }));

  return {
    email: email,
    name: name,
    totalScore: totalScore,
    totalMaxPoints: totalMaxPoints,
    overallPercentage: totalMaxPoints > 0 ? (totalScore / totalMaxPoints) * 100 : 0,
    categoriesData: categoriesData,
    assignmentsList: assignmentsList,
    radarData: radarData,
    trendData: trendData,
  };
}

/**
 * Process assignment-sorted data (original logic)
 */
function processAssignmentSortedData(data, email, name) {
  const categoriesData = {};
  const assignmentsList = [];
  let totalScore = 0;
  let totalMaxPoints = 0;

  Object.entries(data).forEach(([category, assignments]) => {
    const categoryScores = [];
    let categoryTotal = 0;
    let categoryMax = 0;
    let categoryCount = 0;

    Object.entries(assignments).forEach(([assignmentName, assignmentData]) => {
      const score = parseFloat(assignmentData.student) || 0;
      const maxPoints = parseFloat(assignmentData.max) || 0;
      
      if (maxPoints > 0) {
        categoryScores.push({
          name: assignmentName,
          score: score,
          maxPoints: maxPoints,
          percentage: (score / maxPoints) * 100,
        });
        
        categoryTotal += score;
        categoryMax += maxPoints;
        categoryCount++;

        assignmentsList.push({
          category: category,
          name: assignmentName,
          score: score,
          maxPoints: maxPoints,
          percentage: (score / maxPoints) * 100,
        });
      }
    });

    if (categoryMax > 0) {
      categoriesData[category] = {
        scores: categoryScores,
        total: categoryTotal,
        maxPoints: categoryMax,
        percentage: (categoryTotal / categoryMax) * 100,
        count: categoryCount,
        average: categoryCount > 0 ? categoryTotal / categoryCount : 0,
      };

      totalScore += categoryTotal;
      totalMaxPoints += categoryMax;
    }
  });

  const categoryPercentages = Object.values(categoriesData).map(d => d.percentage);
  const overallAvg = categoryPercentages.length > 0 
    ? parseFloat((categoryPercentages.reduce((sum, p) => sum + p, 0) / categoryPercentages.length).toFixed(2))
    : 0;

  const radarData = Object.entries(categoriesData).map(([category, data]) => ({
    category: category,
    percentage: parseFloat(data.percentage.toFixed(2)),
    score: parseFloat(data.total.toFixed(2)),
    maxPoints: parseFloat(data.maxPoints.toFixed(2)),
    average: overallAvg,
    fullMark: 100,
  }));

  const trendData = assignmentsList.map((a, idx) => ({
    index: idx + 1,
    name: `${a.category}-${a.name}`,
    percentage: a.percentage,
    category: a.category,
    submissionTime: a.submissionTime || null, // Include for consistency
  }));

  return {
    email: email,
    name: name,
    totalScore: totalScore,
    totalMaxPoints: totalMaxPoints,
    overallPercentage: totalMaxPoints > 0 ? (totalScore / totalMaxPoints) * 100 : 0,
    categoriesData: categoriesData,
    assignmentsList: assignmentsList,
    radarData: radarData,
    trendData: trendData,
  };
}

/**
 * Get grade level based on percentage
 * @param {number} percentage - Score percentage
 * @returns {Object} Grade info with grade letter and color
 */
export function getGradeLevel(percentage) {
  if (percentage >= 90) return { grade: 'A', color: '#4caf50' };
  if (percentage >= 80) return { grade: 'B', color: '#8bc34a' };
  if (percentage >= 70) return { grade: 'C', color: '#ffc107' };
  if (percentage >= 60) return { grade: 'D', color: '#ff9800' };
  return { grade: 'F', color: '#f44336' };
}
