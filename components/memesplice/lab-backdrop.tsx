import styles from './lab-backdrop.module.css';
export type BackgroundVariation='minimal'|'balanced'|'rich';
export function LabBackdrop({variant='balanced',scene='hero'}:{variant?:BackgroundVariation;scene?:'hero'|'result'|'showcase'|'lineage'}){
 return <div className={`${styles.layer} ${styles[variant]} ${styles[scene]}`} aria-hidden="true">
  <div className={styles.bloom}/><div className={styles.grain}/><div className={styles.grid}/>
  <svg className={styles.waves} viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" fill="none">
   <g stroke="currentColor" strokeWidth="1.1">
    <path d="M85 -90C390 65 -160 200 130 350S-110 600 140 870M215 -90C-90 65 460 200 170 350S410 600 160 870"/>
    <path d="M1290 -80C1080 90 1490 220 1270 375S1470 630 1260 880M1360 -80C1570 90 1160 220 1380 375S1180 630 1390 880"/>
    {Array.from({length:22},(_,i)=>{const y=i*39-24,x=Math.sin(y/98)*64;return <g key={i}><path d={`M${150-x} ${y}L${150+x} ${y+6}`}/><path d={`M${1325-x*.7} ${y}L${1325+x*.7} ${y+6}`}/></g>;})}
   </g>
   {Array.from({length:24},(_,i)=><circle key={i} cx={(i*317+83)%1440} cy={(i*137+51)%800} r={i%5===0?1.8:.8} fill="#d7afff" opacity={.3+(i%4)*.15}/>)}
  </svg><div className={styles.vignette}/>
 </div>;
}
