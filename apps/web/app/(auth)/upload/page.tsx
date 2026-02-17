'use client'

import { useState } from 'react'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(process.env.NEXT_PUBLIC_API_URL + '/api/upload/excel', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({ error: error.message })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          Bulk Upload
        </h1>
        <p className="text-muted-foreground mt-2">
          Import cattle records from Excel or CSV files
        </p>
      </div>

      {/* Upload Card */}
      <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">Upload File</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Supported formats: .xlsx, .csv
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 whitespace-nowrap"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>

          {result && (
            <div className={`rounded-md p-4 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h3 className="font-semibold mb-2">
                {result.success ? '✅ Upload Successful' : '❌ Upload Failed'}
              </h3>
              {result.success && result.stats && (
                <div className="text-sm space-y-1">
                  <p>Cattle added: {result.stats.cattleAdded}</p>
                  <p>Cattle skipped: {result.stats.cattleSkipped}</p>
                  <p>Calvings added: {result.stats.calvingsAdded}</p>
                  <p>Services added: {result.stats.servicesAdded}</p>
                  <p>Sales added: {result.stats.salesAdded}</p>
                  <p>Maternal links: {result.stats.maternalLinks}</p>
                </div>
              )}
              {result.error && <p className="text-sm">{result.error}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
        <h2 className="text-lg font-semibold mb-2">📋 Instructions</h2>
        <ul className="text-sm space-y-2 list-disc list-inside">
          <li>Upload Excel (.xlsx) or CSV (.csv) files with cattle data</li>
          <li>File must include columns: Tag No, Management Tag, DOB</li>
          <li>System will automatically deduplicate by Tag No</li>
          <li>Maternal relationships will be linked automatically</li>
          <li>Maximum file size: 10MB</li>
        </ul>
      </div>
    </div>
  )
}
