import type {Offspring,Coin} from "../memesplice/types";
export type JobStatus="QUEUED"|"ANALYZING"|"SPLICING"|"GENERATING"|"FINALIZING"|"COMPLETE"|"FAILED";
export type JobView={id:string;status:JobStatus;position:number|null;estimatedWaitSeconds:number|null;paused:boolean;result:Offspring|null;error:string|null};
export type ClaimedJob={id:string;lease_token:string;parents:[Coin,Coin];parent_a_mint:string;parent_b_mint:string;previous_job_id?:string|null;previous_instant_id?:string|null};
