import {z} from 'zod';
import {requireSameOrigin} from '@/lib/server/identity';
import {walletCheckContext} from '@/lib/launch/wallet-check';
import {reviewLaunch,preflightLaunch} from '@/lib/launch/server';
import {address,walletAddress,identitySchema,LaunchError,messages} from '@/lib/launch/validation';
import {launchSettingsSchema} from '@/lib/launch/settings';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const bodySchema=z.object({action:z.literal('preflight'),offspringId:z.string().uuid(),wallet:walletAddress,mint:address,identity:identitySchema,settings:launchSettingsSchema}).strict();
function failure(e:unknown){return Response.json({error:e instanceof LaunchError?messages[e.code]:'The local wallet rehearsal is unavailable.'},{status:e instanceof LaunchError?e.status:400,headers:{'Cache-Control':'no-store'}});}
export async function GET(request:Request){try{const c=await walletCheckContext(request);return Response.json({...await reviewLaunch(c.session,c.offspring.id,false),enabled:false,offspring:c.offspring},{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const c=await walletCheckContext(request),text=await request.text();if(text.length>8000)throw new LaunchError('INVALID_INPUT');const body=bodySchema.parse(JSON.parse(text));if(body.offspringId!==c.offspring.id)throw new LaunchError('NOT_OWNED',403);return Response.json(await preflightLaunch(c.session,body),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
