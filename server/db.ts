import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 👇 ESTO ES LO NUEVO: Evita que un error de conexión en segundo plano tumbe el servidor
pool.on('error', (err, client) => {
  console.error('⚠️ [DB ERROR] Error inesperado en el pool de PostgreSQL (probablemente un timeout). Se ignora para no cerrar el servidor:', err.message);
});

export const db = drizzle(pool, { schema });