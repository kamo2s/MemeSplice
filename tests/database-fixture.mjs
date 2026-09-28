import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
export async function setup(){
 const db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const name of ['202609270001_cost_controls.sql','202609270002_ai_generation.sql','202609270003_public_ai_launch.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 return db;
}
