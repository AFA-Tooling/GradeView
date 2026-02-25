// src/utils/studentDataProcessor.js

/**
 * Process student grades data into structured format for display
 * @param {Object} data - Raw grades data from API
 * @param {string} email - Student email
 * @param {string} name - Student name
 * @returns {Object} Processed student data
 */
export function processStudentData(data, email, name) {
  if (!data || Object.keys(data).length === 0) return null;

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
