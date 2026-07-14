const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });
const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2 });

async function run() {
  const fileId = "1nv0ngK7J-Qp-3eBsEGO2xUTQHGKECw4QUzA8OBQ-wTs"; // Google Vids file ID
  try {
    const file = await drive.files.get({ fileId, fields: 'id,name,mimeType,exportLinks' });
    console.log("File Info:", JSON.stringify(file.data, null, 2));
  } catch (e) {
    console.error("Error get:", e.message);
  }
}
run();
