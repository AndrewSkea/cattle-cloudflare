/**
 * Export Routes - XLSX downloads for sales, costs, cattle register, and full reports
 */

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../db/schema';
import type { Env, AuthUser } from '../types';
import type { DrizzleD1Database } from '../db/client';

const exportRoutes = new Hono<{ Bindings: Env; Variables: { db: DrizzleD1Database; user: AuthUser } }>();

function sendXlsx(c: any, workbook: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

/**
 * GET /api/export/sales
 */
exportRoutes.get('/sales', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const sales = await db.select({
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    breed: schema.cattle.breed,
    sex: schema.cattle.sex,
    saleDate: schema.saleEvents.eventDate,
    weightKg: schema.saleEvents.weightKg,
    salePrice: schema.saleEvents.salePrice,
    pricePerKg: sql<number>`CASE WHEN ${schema.saleEvents.weightKg} > 0 THEN ROUND(${schema.saleEvents.salePrice} / ${schema.saleEvents.weightKg}, 2) ELSE NULL END`,
    notes: schema.saleEvents.notes,
  })
  .from(schema.saleEvents)
  .innerJoin(schema.cattle, eq(schema.saleEvents.animalId, schema.cattle.id))
  .where(eq(schema.saleEvents.farmId, farmId))
  .orderBy(desc(schema.saleEvents.eventDate));

  const rows = sales.map(s => ({
    'Tag': s.tagNo,
    'Mgmt Tag': s.managementTag || '',
    'Breed': s.breed || '',
    'Sex': s.sex || '',
    'Sale Date': s.saleDate,
    'Weight (kg)': s.weightKg || '',
    'Price (£)': s.salePrice || '',
    'Price/kg (£)': s.pricePerKg || '',
    'Notes': s.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales');
  return sendXlsx(c, wb, `sales-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/costs
 */
exportRoutes.get('/costs', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  const allocations = await db.select({
    tagNo: schema.cattle.tagNo,
    managementTag: schema.cattle.managementTag,
    date: schema.costAllocations.date,
    sourceType: schema.costAllocations.sourceType,
    description: schema.costAllocations.description,
    amount: schema.costAllocations.amount,
  })
  .from(schema.costAllocations)
  .innerJoin(schema.cattle, eq(schema.costAllocations.cattleId, schema.cattle.id))
  .where(eq(schema.costAllocations.farmId, farmId))
  .orderBy(desc(schema.costAllocations.date));

  const rows = allocations.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Date': a.date,
    'Category': a.sourceType,
    'Description': a.description || '',
    'Amount (£)': a.amount,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Costs');
  return sendXlsx(c, wb, `costs-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/cattle
 */
exportRoutes.get('/cattle', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;
  const status = c.req.query('status');

  let query = db.select()
    .from(schema.cattle)
    .where(eq(schema.cattle.farmId, farmId))
    .$dynamic();

  if (status === 'on_farm') {
    query = query.where(and(eq(schema.cattle.farmId, farmId), eq(schema.cattle.onFarm, true)));
  } else if (status === 'sold') {
    query = query.where(and(eq(schema.cattle.farmId, farmId), eq(schema.cattle.onFarm, false)));
  }

  const animals = await query.orderBy(schema.cattle.tagNo);

  const rows = animals.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Breed': a.breed || '',
    'Sex': a.sex || '',
    'DOB': a.dob,
    'YOB': a.yob,
    'Status': a.currentStatus || (a.onFarm ? 'On Farm' : 'Off Farm'),
    'Notes': a.notes || '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Cattle Register');
  return sendXlsx(c, wb, `cattle-register-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

/**
 * GET /api/export/full
 * Multi-sheet XLSX workbook
 */
exportRoutes.get('/full', async (c) => {
  const db = c.get('db');
  const user = c.get('user');
  const farmId = user.activeFarmId!;

  // Sheet 1: Cattle Register
  const animals = await db.select()
    .from(schema.cattle)
    .where(eq(schema.cattle.farmId, farmId))
    .orderBy(schema.cattle.tagNo);

  const cattleRows = animals.map(a => ({
    'Tag': a.tagNo,
    'Mgmt Tag': a.managementTag || '',
    'Breed': a.breed || '',
    'Sex': a.sex || '',
    'DOB': a.dob,
    'YOB': a.yob,
    'On Farm': a.onFarm ? 'Yes' : 'No',
    'Status': a.currentStatus || '',
  }));

  // Sheet 2: Sales
  const sales = await db.select({
    tagNo: schema.cattle.tagNo,
    saleDate: schema.saleEvents.eventDate,
    weightKg: schema.saleEvents.weightKg,
    salePrice: schema.saleEvents.salePrice,
    notes: schema.saleEvents.notes,
  })
  .from(schema.saleEvents)
  .innerJoin(schema.cattle, eq(schema.saleEvents.animalId, schema.cattle.id))
  .where(eq(schema.saleEvents.farmId, farmId))
  .orderBy(desc(schema.saleEvents.eventDate));

  const salesRows = sales.map(s => ({
    'Tag': s.tagNo,
    'Sale Date': s.saleDate,
    'Weight (kg)': s.weightKg || '',
    'Price (£)': s.salePrice || '',
    'Notes': s.notes || '',
  }));

  // Sheet 3: Costs & Allocations
  const allocations = await db.select({
    tagNo: schema.cattle.tagNo,
    date: schema.costAllocations.date,
    sourceType: schema.costAllocations.sourceType,
    description: schema.costAllocations.description,
    amount: schema.costAllocations.amount,
  })
  .from(schema.costAllocations)
  .innerJoin(schema.cattle, eq(schema.costAllocations.cattleId, schema.cattle.id))
  .where(eq(schema.costAllocations.farmId, farmId))
  .orderBy(desc(schema.costAllocations.date));

  const costRows = allocations.map(a => ({
    'Tag': a.tagNo,
    'Date': a.date,
    'Category': a.sourceType,
    'Description': a.description || '',
    'Amount (£)': a.amount,
  }));

  // Sheet 4: P&L Summary
  const totalRevenue = sales.reduce((s, sale) => s + (sale.salePrice || 0), 0);

  const supplyTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.supplyPurchases.totalCost}), 0)`,
  })
  .from(schema.supplyPurchases)
  .where(eq(schema.supplyPurchases.farmId, farmId));

  const machineryTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.machineryEvents.cost}), 0)`,
  })
  .from(schema.machineryEvents)
  .where(eq(schema.machineryEvents.farmId, farmId));

  const payrollTotal = await db.select({
    total: sql<number>`COALESCE(SUM(${schema.payrollEvents.amount}), 0)`,
  })
  .from(schema.payrollEvents)
  .where(eq(schema.payrollEvents.farmId, farmId));

  const plRows = [
    { 'Category': 'INCOME', 'Amount (£)': '' },
    { 'Category': 'Cattle Sales', 'Amount (£)': totalRevenue },
    { 'Category': '', 'Amount (£)': '' },
    { 'Category': 'EXPENDITURE', 'Amount (£)': '' },
    { 'Category': 'Supplies', 'Amount (£)': supplyTotal[0]?.total || 0 },
    { 'Category': 'Machinery', 'Amount (£)': machineryTotal[0]?.total || 0 },
    { 'Category': 'Payroll', 'Amount (£)': payrollTotal[0]?.total || 0 },
    { 'Category': '', 'Amount (£)': '' },
    { 'Category': 'NET MARGIN', 'Amount (£)': totalRevenue - (supplyTotal[0]?.total || 0) - (machineryTotal[0]?.total || 0) - (payrollTotal[0]?.total || 0) },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cattleRows), 'Cattle Register');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Sales');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(costRows), 'Costs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plRows), 'P&L Summary');
  return sendXlsx(c, wb, `farm-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
});

export default exportRoutes;
