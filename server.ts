import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const port = 3000;

app.use(express.json({ limit: '15mb' }));

// Shared Gemini AI client for server-side verification
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// AI Receipt Verification Endpoint
app.post('/api/verify-receipt', async (req, res) => {
  try {
    const { fileDataUrl, mimeType, expectedDate, amountSAR } = req.body;
    if (!fileDataUrl) {
      return res.status(400).json({ error: 'fileDataUrl is required' });
    }

    // Extract base64 payload
    const base64Data = fileDataUrl.includes('base64,') 
      ? fileDataUrl.split('base64,')[1] 
      : fileDataUrl;

    const actualMime = mimeType || (fileDataUrl.includes('application/pdf') ? 'application/pdf' : 'image/jpeg');

    const prompt = `You are an AI financial auditor for SafarDesk travel agency.
Carefully inspect this uploaded receipt / transaction proof image or document.
Expected transaction date: "${expectedDate || 'N/A'}"
Expected amount (SAR): "${amountSAR || 'N/A'}"

Run these 3 checks:
1. Is the file readable, legible, and not blank, blacked-out, corrupt, or an empty template?
2. Does the document legitimately look like a payment receipt, bank wire transfer receipt, ATM deposit slip, or cash voucher? (Strictly flag dummy, meme, irrelevant photos, or non-receipts).
3. What transaction date is printed or visible on the receipt? Does it match or reasonably correspond to the expected date: "${expectedDate}"?

Return JSON conforming strictly to:
{
  "isReadable": boolean,
  "isAuthenticReceipt": boolean,
  "extractedDate": string,
  "dateMatches": boolean,
  "aiStatus": "Verified" or "Needs Review",
  "aiNotes": string
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: actualMime,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const isReadable = parsed.isReadable ?? true;
    const isAuthenticReceipt = parsed.isAuthenticReceipt ?? false;
    const dateMatches = parsed.dateMatches ?? false;

    // "No dummy receipts": failed or suspicious uploads flag with Needs Review
    const finalStatus = (isReadable && isAuthenticReceipt && dateMatches) ? 'Verified' : 'Needs Review';

    return res.json({
      aiStatus: parsed.aiStatus === 'Verified' && finalStatus === 'Verified' ? 'Verified' : 'Needs Review',
      aiExtractedDate: parsed.extractedDate || null,
      aiNotes: parsed.aiNotes || (finalStatus === 'Verified' ? 'Receipt verified authentic and date matches.' : 'Suspicious or non-matching receipt details.'),
      isReadable,
      isAuthenticReceipt,
      dateMatches,
    });
  } catch (err: any) {
    console.error('Error during AI receipt verification:', err);
    // Graceful fallback if Gemini service or network encountered an issue
    return res.json({
      aiStatus: 'Needs Review',
      aiExtractedDate: null,
      aiNotes: `AI verification service notice: ${err.message || 'Pending visual inspection'}. Flagged for Owner review.`,
      isReadable: true,
      isAuthenticReceipt: false,
      dateMatches: false,
    });
  }
});

// AI Urdu WhatsApp Voice Note Verification Endpoint for Direct Settlements
app.post('/api/verify-voice-note', async (req, res) => {
  try {
    const { audioDataUrl, mimeType, expectedDate, expectedAmountSAR, staffDetails } = req.body;
    if (!audioDataUrl) {
      return res.status(400).json({ error: 'audioDataUrl is required' });
    }

    const base64Data = audioDataUrl.includes('base64,')
      ? audioDataUrl.split('base64,')[1]
      : audioDataUrl;

    const actualMime = mimeType || 'audio/mp3';

    const prompt = `You are an AI financial auditor for a Saudi Arabia & Pakistan travel agency.
A sub-agent uploaded an Urdu WhatsApp voice note claiming proof of a Direct Settlement (they paid a Saudi hotel or Shirka directly in SAR).
Staff submitted details:
- Expected Amount (SAR): "${expectedAmountSAR || 'N/A'}"
- Expected Date: "${expectedDate || 'N/A'}"
- Staff description: "${staffDetails || 'N/A'}"

Run these checks:
1. Transcribe the spoken audio verbatim in Urdu, with a brief English translation.
2. Extract the financial amount stated in the voice note (in Riyals / SAR or Lakhs/Thousands).
3. Extract any date, day, or timeframe mentioned.
4. Extract the payer or company name mentioned.
5. Cross-check against the expected amount and date. If amount or date mismatches, or audio is unintelligible, set status to "Needs Review".

Respond strictly with valid JSON:
{
  "transcription": string,
  "extractedAmount": number or null,
  "extractedDate": string or null,
  "extractedPayer": string or null,
  "amountMatches": boolean,
  "dateMatches": boolean,
  "status": "Verified" or "Needs Review",
  "notes": string
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: actualMime,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return res.json({
      transcription: parsed.transcription || 'Voice note audio transcribed.',
      extractedAmount: parsed.extractedAmount ?? null,
      extractedDate: parsed.extractedDate ?? null,
      extractedPayer: parsed.extractedPayer ?? null,
      amountMatches: Boolean(parsed.amountMatches),
      dateMatches: Boolean(parsed.dateMatches),
      status: parsed.status === 'Verified' ? 'Verified' : 'Needs Review',
      notes: parsed.notes || 'Voice note verified.',
    });
  } catch (err: any) {
    console.error('Error during AI voice note verification:', err);
    return res.json({
      transcription: 'Voice note received. Manual staff verification recorded.',
      extractedAmount: null,
      extractedDate: null,
      extractedPayer: null,
      amountMatches: false,
      dateMatches: false,
      status: 'Needs Review',
      notes: `AI transcription offline: ${err.message || 'Inspection pending'}. Flagged for Owner review.`,
    });
  }
});

// Mount Vite middleware in dev mode, or serve static dist in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
  });
}

startServer();
