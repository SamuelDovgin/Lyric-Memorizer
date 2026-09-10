import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import {TimingEditor} from './TimingEditor';
import type {Song} from '../types';
afterEach(cleanup);
test('opens on the first flagged line and moves through the review queue', () => {
 const song: Song={id:'test',title:'Test',artist:'',lyrics:'',status:'READY_NEEDS_REVIEW',statusMessage:'',createdAt:'',originalUrl:null,vocalsUrl:null,instrumentalUrl:null,duration:20,lines:[0,1,2].map(i=>({id:`l${i}`,index:i,songId:'test',section:'Verse',text:`Line ${i}`,start:1+i*5,end:4+i*5,confidence:.75,verified:false,timingQuality:i ? 'needs_review' : 'supported',tokens:[]}))};
 const seek=vi.fn();
 render(<TimingEditor song={song} position={0} onSeek={seek} onSave={vi.fn()}/>);
 expect(screen.getByRole('combobox',{name:'Lyric line'})).toHaveValue('1');
 fireEvent.click(screen.getByRole('button',{name:'Next line to review'}));
 expect(screen.getByRole('combobox',{name:'Lyric line'})).toHaveValue('2');
 expect(seek).toHaveBeenCalledWith(10);
 expect(screen.getByText(/could not confidently replace/)).toBeInTheDocument();
});
