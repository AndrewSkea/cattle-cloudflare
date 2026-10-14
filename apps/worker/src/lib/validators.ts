/**
 * Reusable zod field validators.
 */

import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)');
export const optDate = isoDate.nullish().or(z.literal('').transform(() => null));
export const optText = (max = 2000) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
export const reqText = (max = 200) => z.string().trim().min(1, 'is required').max(max);
export const optNum = z.coerce.number().finite().nullish().or(z.literal('').transform(() => null));
export const optPosNum = z.coerce.number().finite().min(0).nullish().or(z.literal('').transform(() => null));
export const optId = z.coerce.number().int().positive().nullish().or(z.literal('').transform(() => null));
export const money = z.coerce.number().finite().min(0).max(100_000_000);

export const SPECIES = ['cattle', 'sheep', 'goat', 'pig', 'horse', 'poultry', 'other'] as const;
/** Menu sections a farm can hide in settings (Dashboard, Animals, Breeding, Team and settings always show). */
export const HIDEABLE_SECTIONS = ['calendar', 'tasks', 'health', 'families', 'traceability', 'land', 'equipment', 'inventory', 'mart', 'finance', 'reports'] as const;
export const ANIMAL_STATUS = ['active', 'sold', 'died', 'culled', 'missing'] as const;
export const HEALTH_TYPES = ['vaccination', 'treatment', 'test', 'procedure', 'vet_visit', 'observation', 'injury'] as const;
export const LAND_USES = ['pasture', 'silage', 'hay', 'arable', 'woodland', 'yard', 'other'] as const;
export const CROPS = [
  'grass', 'grass_clover', 'spring_barley', 'winter_barley', 'oats', 'wheat', 'whole_crop', 'turnips', 'swedes', 'kale',
  'fodder_beet', 'rape', 'maize', 'potatoes', 'other',
] as const;
export const CROP_PURPOSES = ['grazing', 'silage', 'hay', 'grain', 'wholecrop', 'forage', 'other'] as const;
export const CROP_STATUS = ['planned', 'growing', 'finished'] as const;
export const FIELD_EVENT_TYPES = [
  'sowing', 'fertiliser', 'lime', 'slurry', 'minerals', 'spray', 'cultivation', 'harvest', 'grazing', 'soil_test', 'reading', 'note',
] as const;
export const READING_KINDS = [
  'soil_moisture', 'grass_height', 'grass_cover', 'crop_moisture', 'dry_matter', 'ph', 'p_index', 'k_index', 'mg_index',
  'organic_matter', 'soil_temp', 'other',
] as const;
export const TENURES = ['owned', 'rented', 'licensed', 'other'] as const;
export const STRUCTURE_KINDS = ['barn', 'shed', 'yard', 'pen', 'silo', 'water', 'gate', 'handling', 'house', 'store', 'other'] as const;
export const EQUIPMENT_CATEGORIES = ['tractor', 'vehicle', 'trailer', 'implement', 'atv', 'handling', 'tool', 'other'] as const;
export const EQUIPMENT_STATUS = ['active', 'needs_attention', 'in_repair', 'retired', 'sold'] as const;
export const EQUIPMENT_LOG_TYPES = ['service', 'repair', 'inspection', 'fuel', 'hours', 'note'] as const;
export const INVENTORY_CATEGORIES = ['feed', 'medicine', 'vaccine', 'fertiliser', 'seed', 'fuel', 'bedding', 'parts', 'other'] as const;
export const INCOME_CATEGORIES = ['livestock_sales', 'subsidies', 'crop_sales', 'contracting', 'milk_wool', 'rent_received', 'other_income'] as const;
export const EXPENSE_CATEGORIES = [
  'feed', 'vet_medicine', 'wages', 'machinery', 'fuel', 'fertiliser_seed', 'rent', 'livestock_purchases',
  'contractors', 'repairs', 'utilities', 'insurance', 'bedding', 'professional_fees', 'other_expense',
] as const;
