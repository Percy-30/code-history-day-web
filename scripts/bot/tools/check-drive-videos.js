require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');

async function check() {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  const res = await drive.files.list({
    q: `trashed=false`,
    fields: 'files(id,name,size,mimeType,createdTime,parents)',
    pageSize: 10,
    orderBy: 'createdTime desc'
  });
  console.log("Most recent 10 files in Drive:", JSON.stringify(res.data.files, null, 2));
}

check().catch(console.error);
