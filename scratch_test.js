const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });
const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2 });

async function run() {
  const res = await drive.files.list({ 
    q: "name contains '13-07-2026'", 
    fields: "files(id,name,mimeType,exportLinks)" 
  });
  console.log(JSON.stringify(res.data.files, null, 2));
}
run();
