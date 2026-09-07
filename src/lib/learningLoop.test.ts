import { describe, expect, it } from 'vitest';
import { afterPresentation, nextDue, planFeedback, restorePlan } from './learningLoop';
import { feedbackLine } from './rehearsal';
import type { LearningPlan, Song } from '../types';
const song: Song = {id:'s',title:'Fixture',artist:'',lyrics:'',status:'READY',statusMessage:'',createdAt:'',originalUrl:'/original.wav',vocalsUrl:null,instrumentalUrl:null,duration:40, lines:Array.from({length:4}, (_,i)=>({id:`l${i}`,index:i,songId:'s',section:'Verse',sectionId:'verse',text:`line ${i}`,start:1+i*4,end:4+i*4,confidence:1,verified:true,tokens:[]} ))};
describe('continuous learning loop', () => {
  it('does not interrupt the song before the user marks a spot', () => expect(nextDue(song,{},200,'',true)).toBe(null));
  it('prioritizes a fresh failure without losing other waiting lines', () => {
    let plan:LearningPlan={l0:{due:40,step:'revisit',visits:1}};
    plan=planFeedback(plan,'l2','again',0,50);
    expect(nextDue(song,plan,50,'',true)).toBe('l2');
    expect(plan.l0.due).toBe(40);
  });
  it('retries once, then allows 45 seconds of other singing before revisiting', () => {
    const plan=afterPresentation(planFeedback({},'l0','again',0,10),'l0',15);
    expect(nextDue(song,plan,59,'',true)).toBe(null);
    expect(nextDue(song,plan,60,'',true)).toBe('l0');
  });
  it('one success revisits later, two connect the section, three rest for another day', () => {
    let plan=planFeedback({},'l0','again',0,0);
    plan=planFeedback(plan,'l0','got-it',1,10);
    expect(plan.l0).toMatchObject({step:'revisit',due:55});
    plan=planFeedback(plan,'l0','got-it',2,80);
    expect(plan.l0).toMatchObject({step:'connect',due:170});
    plan=planFeedback(plan,'l0','got-it',3,200);
    expect(plan.l0.step).toBe('rest');
    expect(nextDue(song,plan,10000,'',true)).toBe(null);
  });
  it('a Got it on a familiar line does not manufacture a new drill',()=>expect(planFeedback({},'l0','got-it',1,20)).toEqual({}));
  it('stops unsolicited repeats without treating silence as mastery', () => {
    let plan=planFeedback({},'l0','again',0,0);
    plan=afterPresentation(plan,'l0',4);
    plan=afterPresentation(plan,'l0',60);
    expect(plan.l0.step).toBe('rest');
    expect(plan.l0.visits).toBe(2);
  });
  it('recovers a rested line next day without adding a due-card queue', () => {
    const plan:LearningPlan={l0:{step:'rest',due:20,visits:2,nextSessionAt:'2026-09-06T00:00:00Z'}};
    const state={l0:{judgment:'got-it' as const,comfortablePasses:3,lastAt:'2026-09-05T00:00:00Z'}};
    expect(restorePlan(plan,state,100,Date.parse('2026-09-07T00:00:00Z')).l0).toMatchObject({step:'revisit',due:115,visits:0});
  });
  it('a direct entrance does not send feedback to an unheard previous line',()=> {
    expect(feedbackLine(song.lines,5.2,4.92)).toBe(1);
    expect(feedbackLine(song.lines,5.2,0)).toBe(0);
  });
});
