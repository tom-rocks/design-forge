import { API_URL } from '../config'

/**
 * Upload a data URL to the server and get an asset URL back.
 * This allows efficient reuse - upload once, reference by URL in subsequent requests.
 * The server deduplicates by content hash, so the same image uploaded twice returns the same ID.
 */
export async function uploadAsset(dataUrl: string): Promise<string> {
  // Skip if it's already an asset URL or non-data URL
  if (!dataUrl.startsWith('data:')) {
    return dataUrl
  }
  
  try {
    const res = await fetch(`${API_URL}/api/assets/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ data: dataUrl }),
    })
    if (!res.ok) throw new Error('Upload failed')
    const { assetId, deduplicated } = await res.json()
    if (deduplicated) {
      console.log('[Asset] Reusing existing asset:', assetId)
    } else {
      console.log('[Asset] Uploaded new asset:', assetId)
    }
    // Return a URL that the server can resolve
    return `/api/assets/${assetId}`
  } catch (err) {
    console.error('[Asset] Upload failed, falling back to data URL:', err)
    return dataUrl // Fallback to data URL if upload fails
  }
}
