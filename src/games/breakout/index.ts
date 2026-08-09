import type { GameController, GameModule, GameServices } from '../../core/game-types';
import { clamp, makeKit, text } from '../arcade-kit';

export const breakout: GameModule = {
  meta: { slug: 'breakout', title: 'Brick Pulse', category: 'arcade', description: 'A luminous brick breaker with escalating pulse rows.', instructions: 'Drag the paddle or use arrow keys; clear every brick.', accent: '#70f0c2', mechanic: 'Bounce ball and clear bricks' },
  mount(host: HTMLElement, services: GameServices): GameController {
    const k = makeKit(host, services, 'breakout', 360, 560); let raf=0, paused=false, over=false, score=0, level=1;
    let paddle=140, ball={x:180,y:426,dx:3.1,dy:-3.5}, bricks: {x:number;y:number;hp:number}[]=[];
    const reset = () => { score=0; level=1; over=false; paddle=140; ball={x:180,y:426,dx:3.1,dy:-3.5}; bricks=[]; for(let r=0;r<5;r++)for(let c=0;c<8;c++)bricks.push({x:16+c*42,y:70+r*25,hp:r>2?2:1}); };
    reset();
    k.on('pointermove', e=>{ paddle=clamp(k.point(e as PointerEvent).x-40,8,272); });
    const draw=()=>{ const c=k.ctx; k.clear(); c.fillStyle='#0e1730';c.fillRect(0,0,360,560); c.fillStyle='#273149';c.fillRect(0,40,360,2); text(c,`SCORE ${score}   LEVEL ${level}`,180,27,15,'#a8b1c5');
      bricks.forEach(b=>{c.fillStyle=b.hp===2?'#8b7cff':'#70f0c2';c.fillRect(b.x,b.y,36,18); if(b.hp===2){c.fillStyle='#d8d4ff';c.fillRect(b.x+3,b.y+3,30,2);}}); c.fillStyle='#f7f9ff';c.fillRect(paddle,500,80,11); c.beginPath();c.arc(ball.x,ball.y,6,0,7);c.fill();
      if(paused) text(c,'PAUSED',180,280,28); if(over) { text(c,bricks.length?'PULSE LOST':'BOARD CLEAR',180,250,26,bricks.length?'#ff6b7a':'#70f0c2');text(c,'Tap or press Space to restart',180,282,15); }
    };
    const tick=()=>{ if(!paused&&!over){ if(k.keys.has('ArrowLeft')||k.keys.has('a'))paddle=clamp(paddle-6,8,272); if(k.keys.has('ArrowRight')||k.keys.has('d'))paddle=clamp(paddle+6,8,272); ball.x+=ball.dx;ball.y+=ball.dy;
      if(ball.x<6||ball.x>354){ball.dx*=-1;k.beep(460)} if(ball.y<45){ball.dy=Math.abs(ball.dy)} if(ball.y>540){over=true;services.sound.play('fail')}
      if(ball.y>492&&ball.y<514&&ball.x>paddle-5&&ball.x<paddle+85&&ball.dy>0){ball.dy=-Math.abs(ball.dy);ball.dx=(ball.x-(paddle+40))/12;k.beep(700)}
      for(const b of [...bricks]) if(ball.x>b.x-5&&ball.x<b.x+41&&ball.y>b.y-5&&ball.y<b.y+23){ball.dy*=-1; if(--b.hp===0){bricks.splice(bricks.indexOf(b),1);score+=10*level;k.score(score);k.beep(760)} break;}
      if(!bricks.length){level++; score+=100; k.score(score); ball={x:180,y:426,dx:3+level*.15,dy:-3.4-level*.12}; for(let r=0;r<Math.min(8,4+level);r++)for(let c=0;c<8;c++)bricks.push({x:16+c*42,y:70+r*25,hp:r>2?2:1}); services.reportComplete(level);}
    } draw();raf=requestAnimationFrame(tick);};
    k.on('pointerdown',()=>{if(over)reset();}); k.on('keydown',e=>{if((e as KeyboardEvent).key===' '&&over)reset();}); tick();
    return {pause:()=>paused=true,resume:()=>paused=false,restart:reset,destroy:()=>{cancelAnimationFrame(raf);k.dispose();}};
  }
}; export default breakout;
