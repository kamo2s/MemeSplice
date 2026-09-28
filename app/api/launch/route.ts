import {z,ZodError} from 'zod';
import {session,requireSameOrigin} from '@/lib/server/identity';
import {BackendError} from '@/lib/server/supabase';
import {LaunchError,messages,identitySchema,walletAddress,address} from '@/lib/launch/validation';
import {prepareLaunch,reviewLaunch,submitLaunch,preflightLaunch} from '@/lib/launch/server';
import {launchSettingsSchema,DEFAULT_LAUNCH_SETTINGS} from '@/lib/launch/settings';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const prepare=z.object({action:z.literal('prepare'),offspringId:z.string().uuid(),wallet:walletAddress,mint:address,identity:identitySchema,settings:launchSettingsSchema.default(DEFAULT_LAUNCH_SETTINGS)}).strict();
const preflight=prepare.extend({action:z.literal('preflight')});
const submit=z.object({action:z.literal('submit'),launchId:z.string().uuid(),transaction:z.string().min(1).max(5000).regex(/^[A-Za-z0-9+/=]+$/)}).strict();
function failure(error:unknown){if(error instanceof BackendError&&error.code==='FORBIDDEN')return Response.json({error:'This request could not be verified.',code:'FORBIDDEN'},{status:403});const code=error instanceof LaunchError?error.code:error instanceof ZodError?'INVALID_INPUT':'UNCONFIRMED';return Response.json({error:messages[code]??messages.UNCONFIRMED,code},{status:error instanceof LaunchError?error.status:error instanceof ZodError?400:503,headers:{'Cache-Control':'no-store'}});}
export async function GET(request:Request){try{const owner=session(request);if(!owner)throw new LaunchError('NOT_OWNED',403);const id=z.string().uuid().parse(new URL(request.url).searchParams.get('offspringId'));return Response.json(await reviewLaunch(owner.id,id),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
export async function POST(request:Request){try{requireSameOrigin(request);const owner=session(request);if(!owner)throw new LaunchError('NOT_OWNED',403);const text=await request.text();if(text.length>8000)throw new LaunchError('INVALID_INPUT');const body=z.discriminatedUnion('action',[prepare,submit,preflight]).parse(JSON.parse(text));return Response.json(body.action==='prepare'?await prepareLaunch(owner.id,body):body.action==='preflight'?await preflightLaunch(owner.id,body):{launch:await submitLaunch(owner.id,body.launchId,body.transaction)},{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
