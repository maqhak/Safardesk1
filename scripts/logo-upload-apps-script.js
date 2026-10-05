/**
 * SafarDesk Logo Upload — Google Apps Script
 *
 * SETUP (one time, by Moin):
 * 1. Go to https://script.google.com → New Project
 * 2. Paste this entire file as Code.gs
 * 3. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL (ends with /exec)
 * 5. Put it in each agency's .env as VITE_LOGO_UPLOAD_URL
 *
 * The script receives a base64 logo, saves it to the central
 * SafarDesk logos Drive folder, makes it publicly viewable,
 * and returns the direct image URL.
 */

const LOGO_FOLDER_ID = '10MtmKc8B6aFj1tas9ezxMJFqN2Y52Kwp';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const folder = DriveApp.getFolderById(LOGO_FOLDER_ID);

    // Extract base64 data (remove "data:image/png;base64," prefix)
    const base64Data = data.image.split(',')[1];
    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64Data),
      data.mimeType || 'image/png',
      data.filename || ('logo_' + Date.now() + '.png')
    );

    const file = folder.createFile(blob);

    // Make publicly viewable (anyone with link)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Return direct image URL (works in <img> tags)
    const imageUrl = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400';

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, url: imageUrl, fileId: file.getId() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function (run manually to verify folder access)
function testFolderAccess() {
  const folder = DriveApp.getFolderById(LOGO_FOLDER_ID);
  Logger.log('Folder name: ' + folder.getName());
}
