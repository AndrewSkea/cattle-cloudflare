#!/usr/bin/env python3
"""
Export SQLite database to SQL format for D1 import
Alternative to TypeScript migration when better-sqlite3 build fails
"""

import sqlite3
import sys
from pathlib import Path
from datetime import datetime

def escape_sql_string(value):
    """Escape string values for SQL"""
    if value is None:
        return 'NULL'
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, bool):
        return '1' if value else '0'
    else:
        # Escape single quotes by doubling them
        return "'" + str(value).replace("'", "''") + "'"

def export_table(cursor, table_name):
    """Export a single table to SQL INSERT statements"""
    print(f"Exporting {table_name}...")

    # Get all rows
    cursor.execute(f"SELECT * FROM {table_name}")
    rows = cursor.fetchall()

    if not rows:
        print(f"  No data in {table_name}")
        return []

    # Get column names
    column_names = [description[0] for description in cursor.description]

    sql_statements = []
    for row in rows:
        values = [escape_sql_string(val) for val in row]
        values_str = ', '.join(values)
        columns_str = ', '.join(column_names)
        sql = f"INSERT INTO {table_name} ({columns_str}) VALUES ({values_str});"
        sql_statements.append(sql)

    print(f"  Exported {len(sql_statements)} rows")
    return sql_statements

def main():
    # Paths
    db_path = Path(__file__).parent.parent.parent / 'cattle_excel' / 'cattle.db'
    output_path = Path(__file__).parent.parent / 'migration-import.sql'

    if not db_path.exists():
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    print("Cattle Management System - SQLite to SQL Export")
    print("=" * 60)
    print(f"\nReading from: {db_path}")
    print(f"Writing to: {output_path}\n")

    # Connect to database
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    try:
        all_statements = []

        # Export tables in order (respecting foreign key dependencies)
        tables = ['cattle', 'calving_events', 'service_events', 'sale_events', 'health_events']

        for table in tables:
            statements = export_table(cursor, table)
            all_statements.extend(statements)

        # Write to file
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("-- Cattle Management System Data Migration\n")
            f.write(f"-- Exported: {datetime.now().isoformat()}\n")
            f.write(f"-- Total statements: {len(all_statements)}\n\n")

            for statement in all_statements:
                f.write(statement + '\n')

        print(f"\nExport complete!")
        print(f"Output file: {output_path}")
        print(f"Total SQL statements: {len(all_statements)}")

        # Summary
        cursor.execute("SELECT COUNT(*) FROM cattle")
        cattle_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM calving_events")
        calving_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM service_events")
        service_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM sale_events")
        sale_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM health_events")
        health_count = cursor.fetchone()[0]

        print("\nSummary:")
        print("--------")
        print(f"Cattle: {cattle_count}")
        print(f"Calving Events: {calving_count}")
        print(f"Service Events: {service_count}")
        print(f"Sale Events: {sale_count}")
        print(f"Health Events: {health_count}")
        print(f"Total Records: {cattle_count + calving_count + service_count + sale_count + health_count}")

        print("\nReady for import! Run:")
        print("   cd apps/worker")
        print(f"   wrangler d1 execute cattle-management-db --file=../../migration-import.sql --remote")

    except Exception as e:
        print(f"\nError during export: {e}")
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
