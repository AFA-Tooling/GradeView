import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { createClient } from 'redis';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Environment variables
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SPREADSHEET_TITLE = process.env.SPREADSHEET_SHEETNAME;
const SPREADSHEET_WORKSHEET = process.env.SPREADSHEET_WORKSHEET;
const SPREADSHEET_SCOPES = JSON.parse(process.env.SPREADSHEET_SCOPES || '[]');
const REDIS_URL =
  process.env.REDIS_URL ||
  `redis://:${process.env.REDIS_DB_SECRET}@${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`;

async function createAuthClient() {
    if (!process.env.SERVICE_ACCOUNT_CREDENTIALS) {
        throw new Error("SERVICE_ACCOUNT_CREDENTIALS environment variable is not defined.");
      }
      const credentials = JSON.parse(process.env.SERVICE_ACCOUNT_CREDENTIALS);
      
      
    const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    SPREADSHEET_SCOPES
  );
  await auth.authorize();
  return auth;
}

async function getWorksheetTitle(authClient) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const res = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets(properties(title,index))',
  });
  const sheetsArray = res.data.sheets.sort(
    (a, b) => a.properties.index - b.properties.index
  );
  const index = parseInt(SPREADSHEET_WORKSHEET, 10);
  if (index < 0 || index >= sheetsArray.length) {
    throw new Error(`Worksheet index ${index} is out of range.`);
  }
  return sheetsArray[index].properties.title;
}

async function fetchSpreadsheetData(authClient) {
  const sheets = google.sheets({ version: 'v4', auth: authClient });
  const actualTabName = await getWorksheetTitle(authClient);
  console.log("Spreadsheet title from .env:", SPREADSHEET_TITLE);
  console.log("Actual worksheet (tab) name at index " + SPREADSHEET_WORKSHEET + ":", actualTabName);
  const range = `'${actualTabName}'!A1:ZZ`;
  console.log("Using range:", range);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  return res.data.values;
}

function formatAsText(sheetData) {
  // Static meta information
  const name = "CS10";
  const term = "Fall 2024";
  const orientation = "left to right";
  const startDate = "2024 08 26";
  const staticStyleLevels = [
    "name: root, shape: ellipse, style: filled, fillcolor: #3A73A5",
    "name: blue1, shape: ellipse, style: filled, fillcolor: #74B3CE",
    "name: blue2, shape: ellipse, style: filled, fillcolor: #87CEEB",
    "name: default, shape: ellipse, style: filled, fillcolor: #E0E0E0"
  ];
  const staticClassLevels = [
    "Not Taught: #dddddd",
    "Taught: #8fbc8f"
  ];
  const staticStudentLevels = [
    "First Steps: #dddddd",
    "Needs Practice: #a3d7fc",
    "In Progress: #59b0f9",
    "Almost There: #3981c1",
    "Mastered: #20476a"
  ];

  let output = "";
  output += "name: " + name + "\n";
  output += "term: " + term + "\n";
  output += "orientation: " + orientation + "\n";
  output += "start date: " + startDate + "\n";

  output += "style levels:\n";
  staticStyleLevels.forEach((lvl) => {
    output += "    " + lvl + "\n";
  });

  output += "class levels:\n";
  staticClassLevels.forEach((lvl) => {
    output += "    " + lvl + "\n";
  });

  output += "student levels:\n";
  staticStudentLevels.forEach((lvl) => {
    output += "    " + lvl + "\n";
  });

  output += "nodes:\n";
  if (sheetData && sheetData.length >= 2) {
    const conceptRow = sheetData[0];
    const categoryRow = sheetData[1];

    const groupedNodes = {};
    // Starting at column 1 if node data begins there (adjust as needed)
    for (let col = 2; col < conceptRow.length; col++) {
      const concept = (conceptRow[col] || "").trim();
      const category = (categoryRow[col] || "").trim();
      if (concept && category) {
        if (!groupedNodes[category]) {
          groupedNodes[category] = [];
        }
        groupedNodes[category].push(concept);
      }
    }

    const defaultWeekMapping = {
      "CATEGORY": "Week1",
      "Quest": "Week1",
      "Midterm": "Week5",
      "Projects": "Week5",
      "Labs": "Week5"
    };

    for (let category in groupedNodes) {
      const outerWeek = defaultWeekMapping[category] || "Week1";
      output += "    " + category + " [blue2, " + outerWeek + "]\n";
      const concepts = groupedNodes[category];
      let conceptWeek = 1;
      for (let concept of concepts) {
        output += "        " + concept + " [default, Week" + conceptWeek + "]\n";
        conceptWeek++;
      }
    }
  } else {
    output += "    // No node data found in spreadsheet.\n";
  }

  output += "end\n";
  return output;
}

async function generateTextFile() {
  try {
    const auth = await createAuthClient();
    const sheetData = await fetchSpreadsheetData(auth);
    const textContent = formatAsText(sheetData);

    const metaDir = path.join(__dirname, '..', 'progressReport', 'meta');
    if (!fs.existsSync(metaDir)) {
      fs.mkdirSync(metaDir, { recursive: true });
      console.log("Created directory:", metaDir);
    }
    const filePath = path.join(metaDir, 'Berkeley_CS10.txt');
    fs.writeFileSync(filePath, textContent, 'utf8');
    console.log("File saved to:", filePath);

    const redisClient = createClient({ url: REDIS_URL });
    await redisClient.connect();
    await redisClient.set('metaData', textContent);
    console.log("Meta data cached in Redis under key 'metaData'");
    await redisClient.quit();
  } catch (error) {
    console.error("Failed to generate text file:", error);
  }
}

(async () => {
  await generateTextFile();
})();
