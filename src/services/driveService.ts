import { 
  DriveIntegrationDoc, 
  AiVerificationResult 
} from '../types/payment';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth, storage, isConfigPlaceholder } from './firebase';
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const INTEGRATIONS_DOC_PATH = 'settings/integrations';
const LOCAL_STORAGE_INTEGRATION_KEY = 'safardesk_drive_integration_v1';

// In-memory access token cache (security requirement: no tokens in localStorage)
let cachedAccessToken: string | null = null;

const DEFAULT_INTEGRATION: DriveIntegrationDoc = {
  id: 'integrations',
  connected: false,
  connectedEmail: null,
  connectedAt: null,
  connectedBy: null,
  rootFolderId: null,
  receivedFolderId: null,
  sentFolderId: null,
  lastAuthAt: null,
  isActive: false,
  updatedAt: new Date().toISOString(),
};

/**
 * Fetch the current Google Drive integration configuration
 */
export async function getDriveIntegration(): Promise<DriveIntegrationDoc> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDoc(doc(db, INTEGRATIONS_DOC_PATH));
      if (snap.exists()) {
        return snap.data() as DriveIntegrationDoc;
      }
    }
  } catch (err) {
    console.warn('Could not read settings/integrations from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_INTEGRATION_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  return DEFAULT_INTEGRATION;
}

/**
 * Connect Google Drive via OAuth popup (Buyer company's dedicated Gmail)
 */
export async function connectGoogleDrive(currentUser?: { name?: string; email?: string }): Promise<DriveIntegrationDoc> {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/drive.file');
  provider.setCustomParameters({
    prompt: 'select_account',
    access_type: 'offline',
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to obtain Google Drive OAuth access token.');
  }

  cachedAccessToken = credential.accessToken;
  const email = result.user?.email || currentUser?.email || 'company@gmail.com';

  // Auto-create folder structure: Receipt -> Received & Sent
  const folders = await ensureDriveFolderStructure(cachedAccessToken);

  const integrationDoc: DriveIntegrationDoc = {
    id: 'integrations',
    connected: true,
    connectedEmail: email,
    connectedAt: new Date().toISOString(),
    connectedBy: currentUser?.name || 'Agency Owner',
    rootFolderId: folders.rootFolderId,
    receivedFolderId: folders.receivedFolderId,
    sentFolderId: folders.sentFolderId,
    lastAuthAt: new Date().toISOString(),
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LOCAL_STORAGE_INTEGRATION_KEY, JSON.stringify(integrationDoc));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, INTEGRATIONS_DOC_PATH), integrationDoc);
    }
  } catch (err) {
    console.warn('Could not save settings/integrations in Firestore:', err);
  }

  return integrationDoc;
}

/**
 * Fix #22 — Drive session persistence.
 *
 * The browser OAuth popup flow cannot issue a true server-side refresh token,
 * so the session is persisted as: (a) the integration doc in Firestore
 * (survives reloads), and (b) a silent re-authorization attempt below that
 * restores the in-memory access token whenever the Google session is still
 * valid — no manual reconnect needed after a page reload.
 */
export async function ensureDriveAccessToken(currentUser?: { name?: string; email?: string }): Promise<string> {
  if (cachedAccessToken) return cachedAccessToken;

  const integration = await getDriveIntegration();
  if (!integration.connected) {
    throw new Error('Google Drive is not connected in Settings > Integrations.');
  }

  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.setCustomParameters({ prompt: 'none' }); // silent: no account picker
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) throw new Error('No access token returned.');
    cachedAccessToken = credential.accessToken;
    await touchDriveAuthAt();
    return cachedAccessToken;
  } catch (err: any) {
    cachedAccessToken = null;
    throw new Error('Google Drive session expired. Please reconnect Google Drive in Settings > Integrations.');
  }
}

async function touchDriveAuthAt(): Promise<void> {
  const at = new Date().toISOString();
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_INTEGRATION_KEY);
    if (stored) {
      const doc = JSON.parse(stored);
      doc.lastAuthAt = at;
      doc.updatedAt = at;
      localStorage.setItem(LOCAL_STORAGE_INTEGRATION_KEY, JSON.stringify(doc));
    }
  } catch { /* non-fatal */ }
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDoc(doc(db, INTEGRATIONS_DOC_PATH));
      if (snap.exists()) {
        await setDoc(doc(db, INTEGRATIONS_DOC_PATH), { lastAuthAt: at, updatedAt: at }, { merge: true } as any);
      }
    }
  } catch { /* non-fatal */ }
}

/** Convert a data URL to a Blob for upload. */
function dataUrlToBlob(fileDataUrl: string, fileType: 'image' | 'pdf' | 'audio'): Blob {
  const mimeMatch = fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = mimeMatch ? mimeMatch[1]
    : fileType === 'pdf' ? 'application/pdf'
    : fileType === 'audio' ? 'audio/ogg'
    : 'image/jpeg';
  const base64Data = mimeMatch ? mimeMatch[2] : fileDataUrl;
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Fix #22 — Firebase Storage fallback for receipts.
 * Used automatically when Google Drive is unavailable; files land in
 * `receipts/<ManualNo>.<ext>` with a public download URL stored on the payment.
 */
export async function uploadReceiptToStorage(params: {
  paymentNo: string;
  fileDataUrl: string;
  fileType: 'image' | 'pdf' | 'audio';
}): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
  try {
    const ext = params.fileType === 'pdf' ? '.pdf' : params.fileType === 'audio' ? '.ogg' : '.jpg';
    const path = `receipts/${params.paymentNo}${ext}`;
    const blob = dataUrlToBlob(params.fileDataUrl, params.fileType);
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob, { contentType: blob.type || undefined });
    const downloadUrl = await getDownloadURL(storageRef);
    return { success: true, downloadUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Firebase Storage upload failed.' };
  }
}

/**
 * Fix #22 — unified receipt upload: Google Drive first, Firebase Storage fallback.
 */
export async function uploadReceipt(params: {
  paymentNo: string;
  fileDataUrl: string;
  fileType: 'image' | 'pdf' | 'audio';
  isReceived: boolean;
}): Promise<{
  success: boolean;
  provider: 'drive' | 'storage' | 'none';
  driveFileId?: string;
  webViewLink?: string;
  error?: string;
}> {
  const driveRes = await uploadReceiptToDrive({
    paymentNo: params.paymentNo,
    fileDataUrl: params.fileDataUrl,
    fileType: params.fileType === 'audio' ? 'image' : params.fileType,
    isReceived: params.isReceived,
  });
  if (driveRes.success && driveRes.webViewLink) {
    return { success: true, provider: 'drive', driveFileId: driveRes.driveFileId, webViewLink: driveRes.webViewLink };
  }
  const storageRes = await uploadReceiptToStorage(params);
  if (storageRes.success && storageRes.downloadUrl) {
    return { success: true, provider: 'storage', webViewLink: storageRes.downloadUrl };
  }
  return {
    success: false,
    provider: 'none',
    error: [driveRes.error, storageRes.error].filter(Boolean).join(' | ') || 'Receipt upload failed.',
  };
}

/**
 * Disconnect Google Drive
 */
export async function disconnectGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  const disconnected: DriveIntegrationDoc = {
    ...DEFAULT_INTEGRATION,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(LOCAL_STORAGE_INTEGRATION_KEY, JSON.stringify(disconnected));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, INTEGRATIONS_DOC_PATH), disconnected);
    }
  } catch (err) {
    console.warn('Could not update settings/integrations:', err);
  }
}

/**
 * Ensures the exact Drive folder structure:
 * "Receipt" (root) -> "Received" & "Sent"
 */
async function ensureDriveFolderStructure(accessToken: string): Promise<{
  rootFolderId: string;
  receivedFolderId: string;
  sentFolderId: string;
}> {
  // 1. Find or create root "Receipt" folder
  let rootFolderId = await findFolder(accessToken, 'Receipt');
  if (!rootFolderId) {
    rootFolderId = await createFolder(accessToken, 'Receipt');
  }

  // 2. Find or create "Received" subfolder
  let receivedFolderId = await findFolder(accessToken, 'Received', rootFolderId);
  if (!receivedFolderId) {
    receivedFolderId = await createFolder(accessToken, 'Received', rootFolderId);
  }

  // 3. Find or create "Sent" subfolder
  let sentFolderId = await findFolder(accessToken, 'Sent', rootFolderId);
  if (!sentFolderId) {
    sentFolderId = await createFolder(accessToken, 'Sent', rootFolderId);
  }

  return { rootFolderId, receivedFolderId, sentFolderId };
}

/**
 * Find folder by name and parent ID
 */
async function findFolder(accessToken: string, name: string, parentId?: string): Promise<string | null> {
  try {
    let query = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.files?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Create folder in Google Drive
 */
async function createFolder(accessToken: string, name: string, parentId?: string): Promise<string> {
  const metadata: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!res.ok) {
    throw new Error(`Failed to create Google Drive folder: ${name}`);
  }

  const data = await res.json();
  return data.id;
}

/**
 * Upload receipt to Google Drive into Receipt/Received or Receipt/Sent
 * and rename to the payment's Manual No. (e.g. "PMT-00105.jpg")
 */
export async function uploadReceiptToDrive(params: {
  paymentNo: string;
  fileDataUrl: string;
  fileType: 'image' | 'pdf';
  isReceived: boolean;
}): Promise<{
  success: boolean;
  driveFileId?: string;
  webViewLink?: string;
  error?: string;
}> {
  const integration = await getDriveIntegration();
  if (!integration.connected) {
    return {
      success: false,
      error: 'Google Drive is not connected in Settings > Integrations.',
    };
  }

  // Fix #22: restore the OAuth session (silent re-auth) when the page reloaded
  try {
    await ensureDriveAccessToken();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Google Drive session expired.' };
  }

  try {
    const targetFolderId = params.isReceived 
      ? integration.receivedFolderId || integration.rootFolderId
      : integration.sentFolderId || integration.rootFolderId;

    const ext = params.fileType === 'pdf' ? '.pdf' : '.jpg';
    const renamedFileName = `${params.paymentNo}${ext}`;

    // Convert data URL to Blob / ArrayBuffer
    const mimeMatch = params.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = mimeMatch ? mimeMatch[1] : params.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg';
    const base64Data = mimeMatch ? mimeMatch[2] : params.fileDataUrl;
    
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Construct multipart request
    const metadata = {
      name: renamedFileName,
      mimeType,
      parents: targetFolderId ? [targetFolderId] : [],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
    const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
    
    const multipartBody = metadataPart + mediaHeader + base64Data + closeDelimiter;

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      if (uploadRes.status === 401) {
        cachedAccessToken = null; // force silent re-auth on the next attempt
        return { success: false, error: 'Google Drive session expired. Please reconnect Google Drive in Settings > Integrations.' };
      }
      return {
        success: false,
        error: `Drive API upload error: ${uploadRes.status} - ${errText}`,
      };
    }

    const fileData = await uploadRes.json();
    const driveFileId = fileData.id;
    const webViewLink = fileData.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`;

    return {
      success: true,
      driveFileId,
      webViewLink,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unknown network error uploading to Drive',
    };
  }
}

/**
 * Server-Side AI Verification via Gemini Vision API
 * Checks readability, authentic receipt format, and date matching
 */
export async function verifyReceiptWithAI(params: {
  fileDataUrl: string;
  expectedDate: string;
  amountSAR?: number;
}): Promise<AiVerificationResult> {
  try {
    const res = await fetch('/api/verify-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileDataUrl: params.fileDataUrl,
        expectedDate: params.expectedDate,
        amountSAR: params.amountSAR,
      }),
    });

    if (!res.ok) {
      throw new Error(`AI verification server returned status ${res.status}`);
    }

    const data: AiVerificationResult = await res.json();
    return data;
  } catch (err: any) {
    console.warn('AI receipt verification fallback:', err);
    return {
      aiStatus: 'Needs Review',
      aiExtractedDate: null,
      aiNotes: `AI verification offline: ${err.message || 'Inspection pending'}. Sent to Owner review queue.`,
      isReadable: true,
      isAuthenticReceipt: false,
      dateMatches: false,
    };
  }
}
