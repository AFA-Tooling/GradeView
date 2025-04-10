import {
    getAverageAssignmentScore,
    getMaxAssignmentScore,
    getMinAssignmentScore,
    getTopKAssignmentScores,
    getTopKTotalScores
} from './lib/redisHelper.mjs';

const SECTION = 'Projects';
const ASSIGNMENT = 'Project 2: Spelling Bee';
const K = 3;

async function runTests() {
    try {
        console.log('--- Assignment Query Tests ---');
        console.log(`Section: ${SECTION}, Assignment: ${ASSIGNMENT}`);

        const avg = await getAverageAssignmentScore(SECTION, ASSIGNMENT);
        console.log(`Average score: ${avg}`);

        const max = await getMaxAssignmentScore(SECTION, ASSIGNMENT);
        console.log(`Max score: ${max}`);

        const min = await getMinAssignmentScore(SECTION, ASSIGNMENT);
        console.log(`Min score: ${min}`);

        const topK = await getTopKAssignmentScores(SECTION, ASSIGNMENT, K);
        console.log(`Top ${K} students for assignment:`);
        topK.forEach((s, i) => {
            console.log(`${i + 1}. ${s.name} (${s.email}): ${s.score}`);
        });

        const topTotal = await getTopKTotalScores(K);
        console.log(`Top ${K} students by total score:`);
        topTotal.forEach((s, i) => {
            console.log(`${i + 1}. ${s.name} (${s.email}): ${s.total}`);
        });

    } catch (err) {
        console.error('Error during tests:', err);
    }
}

runTests();
