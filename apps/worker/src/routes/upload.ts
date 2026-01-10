/**
 * Upload Routes - Bulk Excel/CSV file upload
 */

import { Hono } from 'hono';
import { BulkUploadService } from '../services/bulk-upload';
import type { Env } from '../types';
import type { DrizzleD1Database } from '../db/client';

const upload = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database } }>();

/**
 * POST /api/upload/excel
 * Upload and process Excel/CSV file
 */
upload.post('/excel', async (c) => {
  const db = c.get('db');
  const r2 = c.env.R2_BUCKET;

  try {
    // Get uploaded file from form data
    const formData = await c.req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
    ];

    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      return c.json({
        error: 'Invalid file type. Please upload .xlsx or .csv file',
      }, 400);
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json({
        error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB`,
      }, 400);
    }

    console.log(`Processing upload: ${file.name} (${file.size} bytes)`);

    // Store file in R2 for audit/backup
    const fileName = `uploads/${Date.now()}_${file.name}`;
    await r2.put(fileName, file.stream());

    // Get file as ArrayBuffer for processing
    const arrayBuffer = await file.arrayBuffer();

    // Process with BulkUploadService
    const uploadService = new BulkUploadService(db);
    const stats = await uploadService.processFile(arrayBuffer, file.name);

    return c.json({
      success: true,
      stats,
      message: 'Bulk upload completed successfully',
      fileName,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({
      success: false,
      error: error.message,
      message: 'Bulk upload failed',
    }, 500);
  }
});

/**
 * GET /api/upload/template/:format
 * Download template file (Excel or CSV)
 */
upload.get('/template/:format', async (c) => {
  const format = c.req.param('format');

  if (format !== 'excel' && format !== 'csv') {
    return c.json({ error: 'Invalid format. Use "excel" or "csv"' }, 400);
  }

  // Template data with example rows
  const templateData = [
    {
      'Tag No': 'UK523801-123456',
      'Management Tag': '25-1',
      'YOB': 2020,
      'DOB': '2020-03-15',
      'Breed': 'Char',
      'sex': 'fem',
      'size\\n1 - large\\n2 - med l\\n3 - med s\\n4 - small': 2,
      'DAM tag': '',
      'on farm': 'yes',
      'Calfed date 2024': '2024-04-10',
      'Month 2024': 'April',
      'Sire 2025 calf': 'Limousin',
      'Calf date 2025': '',
      'calf sex': 'male',
      'delta': 365,
      'service date 2025 for 2026': '',
      'calf due date from service date': '',
      'Sire 2026 calf': '',
      'Date sold / died': '',
      'Age sold / died': '',
      'sale weight kg': '',
      'Sale price £': '',
      'kg/ month': '',
      '£/month': '',
      'feet trimmed 2025-05-20': '',
    },
    {
      'Tag No': 'UK523801-789012',
      'Management Tag': '25-2',
      'YOB': 2018,
      'DOB': '2018-02-20',
      'Breed': 'AA',
      'sex': 'fem',
      'size\\n1 - large\\n2 - med l\\n3 - med s\\n4 - small': 1,
      'DAM tag': '25-1',
      'on farm': 'yes',
      'Calfed date 2024': '2024-03-25',
      'Month 2024': 'March',
      'Sire 2025 calf': 'Charolais',
      'Calf date 2025': '2025-04-15',
      'calf sex': 'female',
      'delta': 356,
      'service date 2025 for 2026': '2025-06-01',
      'calf due date from service date': '2026-03-10',
      'Sire 2026 calf': 'Simmental',
      'Date sold / died': '',
      'Age sold / died': '',
      'sale weight kg': '',
      'Sale price £': '',
      'kg/ month': '',
      '£/month': '',
      'feet trimmed 2025-05-20': 'Completed',
    },
  ];

  if (format === 'csv') {
    // Generate CSV
    const headers = Object.keys(templateData[0]);
    const csvRows = [
      headers.join(','),
      ...templateData.map(row =>
        headers.map(header => `"${row[header]}"`).join(',')
      ),
    ];
    const csv = csvRows.join('\\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="cattle-template.csv"',
      },
    });
  } else {
    // For Excel, return instructions to use a library on client side
    return c.json({
      message: 'Excel template generation requires client-side library',
      template: templateData,
      instructions: 'Use this data structure to create your Excel file',
    });
  }
});

export default upload;
