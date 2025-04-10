/**
 * Test script for Redis-based assignment score queries.
 *
 * This script runs a set of tests against helper functions in redisHelper.mjs
 * to evaluate assignment statistics, including:
 * - Average score for a given assignment
 * - Maximum and minimum score
 * - Top K students by assignment score
 * - Top K students by total course score
 *
 * Run inside the gradeview-api Docker container:
 *    docker exec -it gradeview-api sh
 *    cd /api
 *    node testAssignmentQueries.mjs
 */

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
