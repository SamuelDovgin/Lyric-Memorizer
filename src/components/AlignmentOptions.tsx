export interface AlignmentChoice { engine: 'legacy' | 'forced'; language: string }
export function AlignmentOptions({value, onChange, disabled = false}: {value: AlignmentChoice; onChange: (value: AlignmentChoice) => void; disabled?: boolean}) {
  return <div className="alignment-options">
    <label>Timing method<select aria-label="Timing method" value={value.engine} disabled={disabled} onChange={event => onChange({...value, engine: event.target.value as AlignmentChoice['engine']})}>
      <option value="legacy">Catalog comparison</option>
      <option value="forced">Align known lyrics to audio · preview</option>
    </select></label>
    {value.engine === 'forced' && <><label>Lyrics language<select aria-label="Lyrics language" disabled={disabled} value={value.language} onChange={event => onChange({...value, language: event.target.value})}>
      {Object.entries({en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese'}).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
    </select></label><p>Uses your lyrics and the larger Whisper turbo model to estimate line starts. Existing timestamps guide the search; manually verified lines stay locked. New imports run this automatically in the background, so you can keep adding songs. Please check the result by listening.</p></>}
  </div>;
}
