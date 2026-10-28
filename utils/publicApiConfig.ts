/** Public browser API key: restrict it to Sheets and your deployment referrers.
 * Never use a service-account private key or a server-side Gemini secret here. */
export function getGoogleSheetsApiKey(): string {
    const configured = localStorage.getItem('google_sheets_api_key')
        || import.meta.env.VITE_GOOGLE_SHEETS_API_KEY || '';
    if (!configured.trim()) throw new Error('请配置 Google Sheets API Key（google_sheets_api_key 或 VITE_GOOGLE_SHEETS_API_KEY）');
    return configured.trim();
}
